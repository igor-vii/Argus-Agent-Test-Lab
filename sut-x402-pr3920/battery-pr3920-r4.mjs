#!/usr/bin/env node
/**
 * Cross-check battery: PR #3920 (gobeyondfj-cmd/x402, feat/expected-amount,
 * head 4232cf6) vs the Argus acceptance matrix A1–A9 (#3866 thread).
 *
 * Runs the SAME S-BS-06 fault-injection stand as the round-2 binding battery,
 * but the client is @x402/core built FROM THE PR BRANCH, with the PR's own
 * SpendControls.expectedAmount configured per its public API. No Argus gate
 * is installed — every rejection (or signing) comes from the code under test.
 *
 * Verdicts are against the MATRIX row (required behavior), so MISMATCH flags
 * a conformance gap of the PR, not a harness error. Sessions are named xc_*.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAB_ROOT = path.resolve(__dirname, "..");
const SUT_ROOT = __dirname;
const OUT_DIR = "/tmp/argus-xc-pr3920-r4";
const FIXTURE_OUT = path.join(LAB_ROOT, "docs/block-b/fixtures/S-BS-06/s-bs-06-pr3920-crosscheck-r4.fixture.json");
const TSX = path.join(SUT_ROOT, "node_modules/.bin/tsx");

const BASE = "http://127.0.0.1";
const ATTACKER2 = "0x2222222222222222222222222222222222222222";
const ASSET2 = "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD"; // non-USDC decoy
const NETWORK2 = "eip155:11155111"; // Ethereum Sepolia decoy

const XC = { explicit: "$0.01", "first-accepted": "first-accepted" };

const SESSIONS = [
  {
    id: "xc_a1_unchanged_explicit", mode: "explicit", amounts: "10000,10000", cycles: 2,
    matrix: "A1",
    expect: "unchanged quote with explicit expectation: both cycles sign, zero QuoteMismatch (no false positives)",
    match: (f) => f.signer_values.join(",") === "10000,10000" && f.quote_rejections.length === 0,
  },
  {
    id: "xc_a2_raise_explicit", mode: "explicit", amounts: "10000,100000", cycles: 2,
    matrix: "A2",
    expect: "raise within cap on accepted quote: QuoteMismatch (caller-config, offered 100000) BEFORE the signer; signer x1",
    match: (f) => f.signer_values.join(",") === "10000" && f.quote_rejections.length === 1
      && f.quote_rejections[0].source === "caller-config" && f.quote_rejections[0].offered === "100000",
  },
  {
    id: "xc_a3_drop_explicit", mode: "explicit", amounts: "10000,5000", cycles: 2,
    matrix: "A3",
    expect: "mid-session price DROP rejected pre-signer (symmetric band, tolerance 1.0); signer x1",
    match: (f) => f.signer_values.join(",") === "10000" && f.quote_rejections.length === 1
      && f.quote_rejections[0].offered === "5000",
  },
  {
    id: "xc_a4_firstoffer_explicit", mode: "explicit", amounts: "100000,100000", cycles: 2,
    matrix: "A4",
    expect: "first offer != caller expectation: rejected at first acceptance; signer x0",
    match: (f) => f.signer_values.length === 0 && f.quote_rejections.length >= 1
      && f.quote_rejections[0].source === "caller-config" && f.quote_rejections[0].offered === "100000",
  },
  {
    id: "xc_a5_payto_same_explicit", mode: "explicit", amounts: "10000,10000", cycles: 2,
    overrides: [{}, { payTo: ATTACKER2 }],
    matrix: "A5",
    expect: "payTo substitution, SAME amount: matrix requires rejection before the signer (binding = full tuple, not just the number)",
    match: (f) => f.signer_values.join(",") === "10000",
  },
  {
    id: "xc_a5b_payto_raise_firstaccepted", mode: "first-accepted", amounts: "10000,50000", cycles: 2,
    overrides: [{}, { payTo: ATTACKER2 }],
    matrix: "A5",
    expect: "payTo substitution + raised amount under first-accepted: payTo is part of the quote key, so the variant key has no anchor — matrix still requires rejection before the signer",
    match: (f) => f.signer_values.join(",") === "10000",
  },
  {
    id: "xc_a6_rejected_never_anchors", mode: "first-accepted", amounts: "5000000,10000", cycles: 2,
    matrix: "A6",
    expect: "cap-rejected offer must NOT anchor: cycle 1 (5,000,000) rejected by cap; cycle 2 (10000, no anchor exists) signs — if the rejected offer had anchored, cycle 2 would mismatch; signer x1",
    match: (f) => f.signer_values.join(",") === "10000" && f.other_rejections.length === 1
      && f.quote_rejections.length === 0,
  },
  {
    id: "xc_a7_asset_explicit", mode: "explicit", amounts: "10000,10000", cycles: 2,
    overrides: [{}, { asset: ASSET2 }],
    matrix: "A7",
    expect: "asset swap: built-in spendControls rejection preserved under the PR (no regression); signer x1",
    match: (f) => f.signer_values.join(",") === "10000" && f.quote_rejections.length === 0
      && JSON.stringify(f.per_cycle).includes("spendControls"),
  },
  {
    id: "xc_a7_network_explicit", mode: "explicit", amounts: "10000,10000", cycles: 2,
    overrides: [{}, { network: NETWORK2 }],
    matrix: "A7",
    expect: "network swap: built-in spendControls rejection preserved under the PR (no regression); signer x1",
    match: (f) => f.signer_values.join(",") === "10000" && f.quote_rejections.length === 0
      && JSON.stringify(f.per_cycle).includes("spendControls"),
  },
  {
    id: "xc_a8_resource_raise_explicit", mode: "explicit",
    endpointSequence: "GET /weather,GET /weather2", amounts: "10000,50000", cycles: 2,
    matrix: "A8",
    expect: "raised amount on a NEW resource caught by the explicit expectation (global per-offer check); signer x1",
    match: (f) => f.signer_values.join(",") === "10000" && f.quote_rejections.length === 1
      && f.quote_rejections[0].offered === "50000",
  },
  {
    id: "xc_a8b_method_new_binding_explicit", mode: "explicit",
    endpointSequence: "GET /weather,POST /weather", amounts: "10000,10000", cycles: 2,
    matrix: "A8",
    expect: "method change (method is NOT in the PR quote key): documented semantics — both cycles sign under the explicit expectation",
    match: (f) => f.signer_values.join(",") === "10000,10000" && f.quote_rejections.length === 0,
  },
  {
    id: "xc_a9_firstaccepted_drift", mode: "first-accepted", amounts: "10000,100000", cycles: 2,
    matrix: "A9",
    expect: "first-accepted anchors at payload creation; later drift rejected with source=quote-ledger, expected=10000; signer x1",
    match: (f) => f.signer_values.join(",") === "10000" && f.quote_rejections.length === 1
      && f.quote_rejections[0].source === "quote-ledger" && f.quote_rejections[0].expected === "10000"
      && f.quote_rejections[0].offered === "100000",
  },
  {
    id: "xc_a10a_first_race_explicit", mode: "explicit", amounts: "10000,10000", cycles: 2,
    client: "v5", concurrency: 2,
    matrix: "A10a",
    expect: "first-contact race, explicit expectation (pre-registered matrix-a10a11.json): exactly ONE signature admitted in the un-anchored window; the concurrent duplicate must not reach the signer",
    match: (f) => f.signer_call_count === 1,
  },
  {
    id: "xc_a10b_first_race_firstaccepted", mode: "first-accepted", amounts: "10000,10000", cycles: 2,
    client: "v5", concurrency: 2,
    matrix: "A10b",
    expect: "first-contact race, first-accepted anchoring (pre-registered): exactly ONE first commitment admitted; concurrent duplicates must not both sign",
    match: (f) => f.signer_call_count === 1,
  },
  {
    id: "xc_a11_unsupported_amount_explicit", mode: "explicit", cycles: 1,
    overrides: [{ amount: "0.5" }],
    matrix: "A11",
    expect: "unsupported amount representation under an ENABLED expectation (pin $0.01, offered 0.5 non-atomic decimal, pre-registered): fail-closed typed rejection, never sign",
    match: (f) => f.signer_call_count === 0 && f.other_rejections.length >= 1
      && f.other_rejections.some((r) => /unsupported|non-atomic|expectation|quote-check/i.test(String(r.error ?? ""))),
  },
];

const run = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    const p = spawn(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => resolve({ code, stdout, stderr }));
  });

const withTimeout = async (promise, ms, killFn) => {
  let timer = setTimeout(() => killFn?.(), ms);
  try { return await promise; } finally { clearTimeout(timer); }
};

async function runSession(sess, port) {
  const evLog = path.join(OUT_DIR, `${sess.id}.jsonl`);
  const standLog = path.join(OUT_DIR, `${sess.id}.stand.json`);
  try { unlinkSync(evLog); } catch {}
  try { unlinkSync(`${evLog}.summary`); } catch {}

  const standArgs = [
    "src/cli/argus.ts", "run", "--block", "B", "--family", "BS",
    "--scenario", "S-BS-06", "--bind", `0.0.0.0:${port}`,
    "--observe-window-ms", "2500", "--skip-gate", "--json",
  ];
  if (sess.amounts) standArgs.push("--requirement-amounts", sess.amounts);
  if (sess.overrides) standArgs.push("--requirement-overrides", JSON.stringify(sess.overrides));

  const standProc = spawn(TSX, standArgs, { cwd: LAB_ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let standOut = "";
  let standErr = "";
  standProc.stdout.on("data", (d) => (standOut += d));
  standProc.stderr.on("data", (d) => (standErr += d));

  await new Promise((r) => setTimeout(r, 3000)); // stand listen

  const clientEnv = {
    ...process.env,
    RESOURCE_SERVER_URL: `${BASE}:${port}`,
    REQUEST_CYCLES: String(sess.cycles),
    EVM_PRIVATE_KEY: `0x${randomBytes(32).toString("hex")}`,
    CLIENT_EVENT_LOG: evLog,
    XC_EXPECTED: XC[sess.mode] ?? "false",
  };
  if (sess.endpointSequence) clientEnv.ENDPOINT_SEQUENCE = sess.endpointSequence;
  if (sess.client === "v5") clientEnv.CONCURRENCY = String(sess.concurrency ?? sess.cycles ?? 2);

  const clientScript = sess.client === "v5" ? "client_v5.ts" : "client_v3.ts";
  const client = await withTimeout(
    run(TSX, [clientScript], { cwd: SUT_ROOT, env: clientEnv }),
    60000,
    () => {},
  );

  await withTimeout(
    new Promise((resolve) => {
      standProc.on("close", resolve);
      setTimeout(() => { try { standProc.kill("SIGKILL"); } catch {} }, 15000);
    }),
    16000,
  );
  writeFileSync(standLog, standOut || JSON.stringify({ error: standErr || "no output" }));

  const events = existsSync(evLog)
    ? readFileSync(evLog, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const summaryLine = (client.stdout.split("\n").find((l) => l.startsWith("PROBE_SUMMARY:")) ?? "").slice("PROBE_SUMMARY: ".length);
  let summary = null;
  try { summary = JSON.parse(summaryLine); } catch {}

  const signerValues = events.filter((e) => e.type === "signer_call").map((e) => e.value);
  // The typed QuoteMismatchError does NOT survive to the caller: wrapFetchWithPayment
  // wraps it as Error("Failed to create payment payload: quote-check-rejected: ...").
  // Recover source/expected/offered from the message (typed fields when present).
  const QM_RE = /quote-check-rejected:\s*quote_mismatch_vs_(expected|accepted):\s*amount\s+(\d+)\s*->\s*(\d+)/;
  const parseQM = (e) => {
    if (e.quote_mismatch) return { ...e.quote_mismatch, via: "typed-error" };
    const m = QM_RE.exec(String(e.error ?? ""));
    if (!m) return null;
    return {
      source: m[1] === "expected" ? "caller-config" : "quote-ledger",
      expected: m[2],
      offered: m[3],
      via: "wrapped-message",
    };
  };
  const isErrEvent = (e) => e.type === "cycle_error" || e.type === "slot_error";
  const quoteRejections = events
    .filter((e) => isErrEvent(e) && parseQM(e))
    .map((e) => ({ cycle: e.cycle ?? e.slot, ...parseQM(e) }));
  const otherRejections = events
    .filter((e) => isErrEvent(e) && !parseQM(e))
    .map((e) => ({ cycle: e.cycle ?? e.slot, error_name: e.error_name, error: e.error }));

  let standReport = null;
  try { standReport = JSON.parse(standOut); } catch {}

  const facts = {
    signer_values: signerValues,
    signer_call_count: summary?.signer_call_count ?? signerValues.length,
    quote_rejections: quoteRejections,
    other_rejections: otherRejections,
    per_cycle: summary?.per_cycle ?? null,
    client_rc: client.code,
    stand_verdict: standReport?.scenarios?.[0]?.verdict ?? null,
  };
  const harnessError = client.code !== 0 && events.length === 0;
  return {
    session: sess.id,
    matrix: sess.matrix,
    expectation_mode: sess.mode,
    requirement_amounts_served: sess.amounts ? sess.amounts.split(",") : null,
    requirement_overrides: sess.overrides ?? null,
    endpoint_sequence: sess.endpointSequence ?? null,
    request_cycles: sess.cycles,
    client_script: sess.client === "v5" ? "client_v5.ts" : "client_v3.ts",
    concurrency: sess.concurrency ?? 1,
    matrix_row: sess.expect,
    observed: facts,
    verdict: harnessError
      ? "HARNESS_ERROR"
      : sess.match(facts)
        ? "PASS"
        : sess.matrix === "A11" && facts.signer_call_count === 0
          && (facts.quote_rejections.length + facts.other_rejections.length) >= 1
          ? "PARTIAL"
          : "FAIL",
    timeline: events,
    stand: standReport?.scenarios?.[0]
      ? { stand_verdict: standReport.scenarios[0].verdict, stand_reasons: standReport.scenarios[0].reasons }
      : null,
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const results = [];
  let port = 4450;
  for (const sess of SESSIONS) {
    process.stdout.write(`[xc] ${sess.id} ... `);
    const rec = await runSession(sess, port++);
    results.push(rec);
    console.log(`${rec.verdict} (signer=${rec.observed.signer_call_count}, quote_rej=${rec.observed.quote_rejections.length}, other_rej=${rec.observed.other_rejections.length})`);
  }

  const byMatrix = {};
  for (const r of results) {
    (byMatrix[r.matrix] ??= []).push({ session: r.session, verdict: r.verdict });
  }
  const rollup = Object.fromEntries(
    Object.entries(byMatrix).map(([m, rs]) => [
      m,
      rs.every((r) => r.verdict === "PASS")
        ? "pass"
        : rs.some((r) => r.verdict === "PASS")
          ? "partial"
          : "fail",
    ]),
  );

  const fixture = {
    fixture: "S-BS-06 x PR #3920 cross-check cycle 2 (acceptance matrix A1-A9 regression + red zone A10a/A10b/A11 vs the PR's own expectedAmount control)",
    upstream_issue: "https://github.com/x402-foundation/x402/issues/3866",
    pr_head: "b1a4d8ce0ae91ed5462db427a7388c516da3e70f",
    rerun_note: "verification cycle 2: green-zone regression (A1-A9 must hold) + red-zone re-run at b1a4d8ce (33dc20d serialization + b1a4d8ce round-4 scoping claimed); red-zone required behaviors pre-registered in matrix-a10a11.json @ 2b4cc47",
    pull_request: {
      repo: "gobeyondfj-cmd/x402",
      branch: "feat/expected-amount",
      head: "b1a4d8ce0ae91ed5462db427a7388c516da3e70f (round-4 review)",
      opened: "2026-10-24T07:22:27Z",
      note: "@x402/core built from the PR branch (npm pack), installed via file: + overrides; PR code is the ONLY rejection logic in these sessions",
    },
    verdict_semantics: {
      PASS: "observed behavior satisfies the matrix row's required behavior",
      FAIL: "conformance gap: the PR's own control does not produce the matrix-required behavior (finding, not harness error)",
      PARTIAL: "A11 only: no signature (fail-closed at the signer boundary) but the rejection lacks the typed unsupported-error signature the matrix row requires; verbatim error recorded for classification",
    },
    evidence_discipline: {
      established: "pre-signer rejection (signer-call count unchanged) or signing (signer invoked) at the signer boundary",
      not_established: "an ON-CHAIN transfer: settlement is mocked; per-session throwaway unfunded wallets",
      redaction: "no private keys, no signatures, no usable authorizations; nonce values truncated",
    },
    amounts_note: "atomic units, USDC 6 decimals: 10000 = $0.01, 5000 = $0.005, 50000 = $0.05, 100000 = $0.10, 5000000 = $5.00 (cap is $1 = 1,000,000). A11 operates in decimal-string representations: expectation pinned at $0.01, probe presents 0.5 (non-atomic) = 50x the pin if misinterpreted as dollars",
    versions: {
      note: "tested version pin",
      packages: { "@x402/core": "2.28.0+pr3920@b1a4d8ce (file: tarball)", "@x402/evm": "2.28.0", "@x402/express": "2.28.0", "@x402/fetch": "2.28.0", viem: "2.48.11" },
      runtime: `node ${process.version}`,
      network: "Base Sepolia (eip155:84532), USDC 0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      test_lab: { repo: "github.com/igor-vii/Argus-Agent-Test-Lab", harness: "sut-x402-pr3920/", orchestrator: "battery-pr3920-r4.mjs", clients: "green sessions reuse client_v3.ts unchanged; race sessions use client_v5.ts CONCURRENCY=2 (same instrumentation perimeter)" },
    },
    sessions: results,
    matrix_rollup: rollup,
    summary: {
      total: results.length,
      pass: results.filter((r) => r.verdict === "PASS").length,
      partial: results.filter((r) => r.verdict === "PARTIAL").length,
      fail: results.filter((r) => r.verdict === "FAIL").length,
      harness_error: results.filter((r) => r.verdict === "HARNESS_ERROR").length,
    },
  };

  writeFileSync(FIXTURE_OUT, JSON.stringify(fixture, null, 2));
  console.log(`\n[xc] fixture -> ${FIXTURE_OUT}`);
  console.log(`[xc] sessions: ${JSON.stringify(fixture.summary)}`);
  console.log(`[xc] matrix rollup: ${JSON.stringify(rollup)}`);
}

main().catch((e) => {
  console.error("[xc] fatal:", e);
  process.exit(1);
});
