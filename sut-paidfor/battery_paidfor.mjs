#!/usr/bin/env node
/**
 * ARGUS 0035 — paidfor client 0.8.0 cap battery (Phase A, $0.00).
 *
 * Committed BEFORE the first live GET (RUNBOOK P1) together with
 * freeze-0035.prereg.json. Every Phase A row ends before the signature
 * (README "Caps and switches (0.8.0)"); the burner wallet holds 0 USDC,
 * so any unexpected path to payment throws InsufficientFundsError instead
 * of signing. Every call is made exactly once — retries: 0.
 *
 * Usage:
 *   PRIVATE_KEY=0x… PAIDFOR_ENDPOINTS=endpoints.json node battery_paidfor.mjs
 *
 * endpoints.json:
 * { "candidates": [
 *     { "id": "P1", "url": "https://api.exa.ai/search", "method": "POST",
 *       "body": { "query": "argus 0035 probe", "numResults": 1 } },
 *     { "id": "P2", "url": "https://api.exa.ai/contents", "method": "POST",
 *       "body": { "ids": ["https://example.com"] } } ] }
 * Results: runs/<ts>/rows/*.json (verbatim) + runs/<ts>/summary.json
 */
import { createHmac, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { safeFetch, deriveNonce, PaymentRefusedError } from "@paidfor/x402-safe-fetch";

const INDEX_URL = process.env.PAIDFOR_INDEX_URL ?? "https://paidfor.dev/v1";
const NONCE_KEY = "x402-safe-fetch:eip3009-nonce:v1";
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = join("runs", ts);
mkdirSync(join(outDir, "rows"), { recursive: true });

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const candidates = JSON.parse(readFileSync(process.env.PAIDFOR_ENDPOINTS ?? "endpoints.json", "utf8")).candidates;

const rows = [];
const record = (id, obj) => {
  const row = { id, ts: new Date().toISOString(), ...obj };
  rows.push(row);
  writeFileSync(join(outDir, "rows", `${id}.json`), JSON.stringify(row, null, 2) + "\n");
  console.log(`${id}: ${row.verdict ?? row.kind ?? "?"} ${row.note ?? ""}`);
};

/* Per-endpoint request shape: x402 quotes arrive on the seller's real method —
 * api.exa.ai/search answers 402 on POST; a bare GET returns no quote
 * (observed in prep smoke, disclosed in the freeze). */
const initOf = (endpoint) => ({
  method: endpoint.method ?? "GET",
  headers: { accept: "application/json", ...(endpoint.body ? { "content-type": "application/json" } : {}) },
  ...(endpoint.body ? { body: JSON.stringify(endpoint.body) } : {}),
});

/* Unpaid 402 probe: learn the live quote (payTo, amountAtomic) and compute
 * quoteUsd — all caps are frozen RELATIVE to it (quoteUsd / 2), immune to
 * price drift. The probe itself never pays. */
async function probe(endpoint) {
  const res = await fetch(endpoint.url, initOf(endpoint));
  const body = await res.json().catch(() => null);
  if (res.status !== 402 || !body?.accepts?.length) {
    return { ok: false, status: res.status, body };
  }
  const req = body.accepts.find(
    (a) => a.scheme === "exact" && String(a.network ?? "").startsWith("eip155:8453")
      && String(a.asset ?? "").toLowerCase() === "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  ) ?? body.accepts.find((a) => a.scheme === "exact" && String(a.network ?? "").startsWith("eip155:"));
  if (!req) return { ok: false, status: res.status, body };
  /* x402 v2 schema: `amount`; legacy used `maxAmountRequired` */
  const atomic = String(req.maxAmountRequired ?? req.amount ?? "");
  const decimals = String(req.asset).toLowerCase() === "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" ? 6 : 6; // Base USDC
  const quoteUsd = req.extra?.totalUsd ?? Number(atomic) / 10 ** decimals;
  return { ok: true, requirement: req, atomic, quoteUsd, status: res.status, body };
}

/* One refusal row: fresh receipts dir, single call, receipt verbatim. */
async function refusalRow(id, endpoint, config, expectedOutcome) {
  const receiptsDir = mkdtempSync(join(tmpdir(), "argus-0035-"));
  const probeResult = await probe(endpoint);
  if (!probeResult.ok) {
    record(id, { kind: "evidence-only", verdict: "evidence-only (no verdict)", endpoint, probeResult,
      note: "endpoint did not present a live 402 quote — deviation recorded, row not run" });
    return;
  }
  const intentId = `argus-0035-${id}:${randomUUID()}`;
  let observed = null;
  try {
    const res = await safeFetch(account, {
      ...config,
      indexUrl: INDEX_URL,
      receiptsDir,
    })(endpoint.url, { ...initOf(endpoint), intentId });
    observed = { threw: false, outcome: res.receipt?.outcome ?? null, paid: res.receipt?.paid ?? null, receipt: res.receipt ?? null };
  } catch (err) {
    observed = {
      threw: true,
      isPaymentRefusedError: err instanceof PaymentRefusedError,
      outcome: err.receipt?.outcome ?? err.code ?? null,
      paid: err.receipt?.paid ?? false,
      message: String(err.message ?? err),
      receipt: err.receipt ?? null,
    };
  }
  const outcome = observed.outcome;
  const verdict = outcome === expectedOutcome && observed.paid === false
    ? "MATCH"
    : "DIVERGENCE";
  record(id, {
    kind: "verdict",
    verdict,
    expected: expectedOutcome,
    observed: { outcome, paid: observed.paid, threw: observed.threw, isPaymentRefusedError: observed.isPaymentRefusedError },
    message: observed.message,
    endpoint: { id: endpoint.id, url: endpoint.url },
    config,
    quote: { payTo: probeResult.requirement.payTo, amountAtomic: probeResult.atomic, quoteUsd: probeResult.quoteUsd },
    receipt: observed.receipt,
    intentId,
  });
}

/* S3 — pay-to refuse mode over candidates; honest not_observed allowed. */
async function paytoRow(id, endpoints) {
  const receiptsDir = mkdtempSync(join(tmpdir(), "argus-0035-"));
  const attempts = [];
  for (const endpoint of endpoints) {
    const probeResult = await probe(endpoint);
    if (!probeResult.ok) { attempts.push({ endpoint: endpoint.id, note: "no live 402" }); continue; }
    const intentId = `argus-0035-${id}:${randomUUID()}`;
    try {
      const res = await safeFetch(account, {
        maxPerCallUsd: 100,
        refuseUnknownPayTo: true,
        indexUrl: INDEX_URL,
        receiptsDir,
      })(endpoint.url, { ...initOf(endpoint), intentId });
      attempts.push({ endpoint: endpoint.id, outcome: res.receipt?.outcome ?? null, paid: res.receipt?.paid ?? null, receipt: res.receipt ?? null });
    } catch (err) {
      attempts.push({
        endpoint: endpoint.id,
        threw: true,
        isPaymentRefusedError: err instanceof PaymentRefusedError,
        outcome: err.receipt?.outcome ?? err.code ?? null,
        paid: err.receipt?.paid ?? false,
        warnings: err.receipt?.warnings ?? null,
        receipt: err.receipt ?? null,
      });
      if (err.receipt?.outcome === "refused_pay_to") break; // observed — stop, one call per candidate max
    }
  }
  const hit = attempts.find((a) => a.outcome === "refused_pay_to");
  const warn = hit?.warnings?.some((w) => w.code === "unknown_pay_to");
  const verdict = hit ? (warn ? "MATCH" : "DIVERGENCE") : attempts.every((a) => a.note) ? "evidence-only (no verdict)" : "MATCH";
  record(id, {
    kind: hit ? "verdict" : "evidence-only",
    verdict: hit ? verdict : "evidence-only (no verdict)",
    expected: "refused_pay_to with unknown_pay_to warning — or not_observed (README: unknown seller gets neither)",
    attempts,
    note: hit ? undefined : "not observed: no known seller triggered the check — evidence recorded verbatim",
  });
}

/* S7 — deterministic nonce, fully offline: package deriveNonce vs independent
 * HMAC-SHA256 recompute (our crypto, not their code), per pinned formula. */
function nonceRow(id) {
  const vectors = [
    { intentId: "argus-0035-s7:vec-1", payer: "0x" + "a".repeat(40), payTo: "0x" + "b".repeat(40), amountAtomic: "250000" },
    { intentId: "argus-0035-s7:vec-1", payer: "0x" + "a".repeat(40), payTo: "0x" + "b".repeat(40), amountAtomic: "250000" }, // same => same nonce
    { intentId: "argus-0035-s7:vec-2", payer: "0x" + "a".repeat(40), payTo: "0x" + "b".repeat(40), amountAtomic: "250000" }, // intent differs
    { intentId: "argus-0035-s7:vec-1", payer: "0x" + "a".repeat(40), payTo: "0x" + "b".repeat(40), amountAtomic: "350000" }, // amount differs
  ];
  const checks = vectors.map((v) => {
    const theirs = deriveNonce({ intentId: v.intentId, payer: v.payer, payTo: v.payTo, amountAtomic: v.amountAtomic });
    const mine = "0x" + createHmac("sha256", NONCE_KEY)
      .update(JSON.stringify([v.intentId, v.payer.toLowerCase(), v.payTo.toLowerCase(), String(v.amountAtomic)]))
      .digest("hex");
    return { vector: v.intentId + "/" + v.amountAtomic, theirs, mine, equal: theirs === mine };
  });
  const stable = checks[0].theirs === checks[1].theirs;
  const distinctIntent = checks[0].theirs !== checks[2].theirs;
  const distinctAmount = checks[0].theirs !== checks[3].theirs;
  const verdict = checks.every((c) => c.equal) && stable && distinctIntent && distinctAmount ? "MATCH" : "DIVERGENCE";
  record(id, { kind: "verdict", verdict, checks, stable, distinctIntent, distinctAmount, key: NONCE_KEY });
}

/* --- run order: probe endpoints first, then one call per row --- */
const live = [];
for (const endpoint of candidates) {
  const p = await probe(endpoint);
  live.push({ endpoint, probe: { ok: p.ok, status: p.status, quoteUsd: p.quoteUsd, payTo: p.requirement?.payTo, amountAtomic: p.atomic, requirement: p.requirement ?? null, body: p.ok ? undefined : p.body } });
}
writeFileSync(join(outDir, "L1-liveness.json"), JSON.stringify({ account: account.address, indexUrl: INDEX_URL, live }, null, 2) + "\n");

const usable = live.filter((l) => l.probe.ok).map((l) => l.endpoint);
if (!usable.length) {
  console.error("no live endpoint presented a 402 quote — battery aborted, nothing charged");
  process.exit(1);
}
const P1 = usable[0];
const q = live.find((l) => l.endpoint.id === P1.id).probe.quoteUsd;
const half = q / 2;

await refusalRow("C1_per_call_control", P1, { maxPerCallUsd: half }, "refused_max_per_call");
await refusalRow("S1_per_day_cap", P1, { maxPerCallUsd: 100, maxPerDayUsd: half }, "refused_max_per_day");
await refusalRow("S2_per_seller_per_day_cap", P1, { maxPerCallUsd: 100, maxPerSellerPerDayUsd: half }, "refused_max_per_seller_per_day");
await refusalRow("S4_approveAbove", P1, { maxPerCallUsd: 100, approveAbove: half }, "needs_approval");
await refusalRow("S5_first_payment_cap", P1, { maxPerCallUsd: 100, maxFirstPaymentUsd: half }, "refused_max_first_payment");
await refusalRow("S6_frozen_switch", P1, { maxPerCallUsd: 100, frozen: true }, "frozen");
await paytoRow("S3_payto_refuse_mode", usable.slice(0, 3));
nonceRow("S7_nonce_from_intent");

/* S9 — telemetry posture: Phase A refusal rows send no index row (README).
 * Post-run manual check of paidfor.dev for the burner address is recorded
 * here as evidence-only; any attributable row = DIVERGENCE in the record. */
record("S9_telemetry_posture", {
  kind: "evidence-only",
  verdict: "evidence-only (no verdict)",
  payer: account.address,
  note: "verify absence of Phase A rows on the index post-run; result recorded in the registry record verbatim",
});

/* --- summary with keyword verdicts + by_session (badges color from these) --- */
const verdictRows = rows.filter((r) => r.kind === "verdict");
const match = verdictRows.filter((r) => r.verdict === "MATCH").length;
const divergence = verdictRows.filter((r) => r.verdict === "DIVERGENCE").length;
const by_session = {};
for (const r of verdictRows) {
  const slug = r.id.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  by_session[`${r.id}_${slug}`] = `${r.verdict} — expected ${rows.find((x) => x.id === r.id)?.expected ?? "see freeze"}; observed outcome ${r.observed?.outcome ?? JSON.stringify(r.checks ?? r.attempts ?? null)}`;
}
const summary = {
  run_id: "argus-0035-paidfor-0.8.0-caps",
  run_ts: new Date().toISOString(),
  payer: account.address,
  indexUrl: INDEX_URL,
  checks_total: verdictRows.length,
  findings_summary: { match, divergence, total: verdictRows.length, by_session },
  scenarios: rows.map((r) => ({ id: r.id, verdict: r.verdict })),
  phase_b_gated: ["pay-to warning mode (default, settles)", "approveAbove approval path (settles)"],
};
writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(`\nPhase A done: ${match} MATCH / ${divergence} DIVERGENCE / ${verdictRows.length} verdict rows — $0.00 spent (all refusals pre-signature)`);
console.log(`Phase B (gated, needs operator go): ${summary.phase_b_gated.join("; ")}`);
