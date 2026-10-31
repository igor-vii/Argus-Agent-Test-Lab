#!/usr/bin/env node
/**
 * Cross-check battery — PR #3920 verification CYCLE 3 vs head e993bef.
 *
 * Continuity: cycle 2 (battery-pr3920-r4.mjs, @ b1a4d8ce, fixture
 * s-bs-06-pr3920-crosscheck-r4.fixture.json) left A1-A9 green, A11 closed,
 * A10a/A10b open (two signatures in the identical-offer first-contact window).
 * After cycle 2 the PR gained two recipient-normalization commits
 * (12fa8a95: EVM recipient case-insensitivity; e993bef6: shared canonical
 * form for sameRecipient + quoteKeyFor). Per the posted acceptance protocol
 * ("if the head moves again before results land, we re-pin and re-run rather
 * than mix heads"), cycle 3 re-pins to e993bef and re-runs:
 *
 *   1. full green-zone regression A1-A9 + A11 (must hold),
 *   2. identical-offer races A10a/A10b (continuity, same pre-registration),
 *   3. NEW pre-registered controls for the e993bef delta:
 *      - A10c/A10d conflicting-offer race (the discriminating control the PR
 *        author requested in-thread: concurrent CONFLICTING offers must not
 *        produce conflicting commitments — one commitment, one pre-signer
 *        rejection),
 *      - A12/A13 case-only EVM recipient variation (first-accepted): with
 *        canonicalized quote-ledger keys a case-variant offer rides the SAME
 *        anchor — unchanged amount must pass (A12, no false positive) and a
 *        raised amount must reject vs the accepted anchor (A13; at the
 *        case-sensitive b1a4d8ce keys A13 would have signed the raised offer
 *        as a fresh key — the delta the two commits close).
 *
 * Harness unchanged: same S-BS-06 fault-injection stand, same instrumentation
 * perimeter (client_v3 green/sequential, client_v5 race, CONCURRENCY=2),
 * @x402/core built FROM THE PR HEAD e993bef via file: tarball + npm overrides;
 * no Argus gate installed — every rejection (or signing) comes from the code
 * under test. Verdicts are against the matrix row; FAIL = conformance gap of
 * the PR, not a harness error. XC_ONLY=<substring> runs a session subset.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// XC_LAB_ROOT: run the stand from a lab checkout that has node_modules installed
// (sandbox: the cycle-3 worktree shares no node_modules; the main clone does).
const LAB_ROOT = process.env.XC_LAB_ROOT
  ? path.resolve(process.env.XC_LAB_ROOT)
  : path.resolve(__dirname, "..");
const SUT_ROOT = __dirname;
const OUT_DIR = process.env.XC_OUT_DIR || "/tmp/argus-xc-pr3920-c3";
const FIXTURE_OUT = process.env.XC_FIXTURE_OUT
  ? path.resolve(process.env.XC_FIXTURE_OUT)
  : path.join(LAB_ROOT, "docs/block-b/fixtures/S-BS-06/s-bs-06-pr3920-crosscheck-c3.fixture.json");
const TSX = path.join(SUT_ROOT, "node_modules/.bin/tsx");

const BASE = "http://127.0.0.1";
const ATTACKER2 = "0x2222222222222222222222222222222222222222";
const ASSET2 = "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD"; // non-USDC decoy
const NETWORK2 = "eip155:11155111"; // Ethereum Sepolia decoy
// Case-only EVM recipient pair (SAME address, two valid EIP-55/lowercase spellings):
const CASE_UPPER = "0xabCDeF0123456789AbcdEf0123456789aBCDEF01"; // EIP-55 checksummed
const CASE_LOWER = "0xabcdef0123456789abcdef0123456789abcdef01"; // same address, lowercase

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
  {
    id: "xc_a10c_race_conflict_explicit", mode: "explicit", amounts: "10000,100000", cycles: 2,
    client: "v5", concurrency: 2,
    matrix: "A10c",
    expect: "conflicting-offer race, explicit expectation (cycle-3 pre-registration; the in-thread requested discriminating control): the in-cap offer (10000) signs against the caller pin; the concurrently offered raised quote (100000) must be rejected pre-signer — concurrent CONFLICTING offers must not produce conflicting commitments (one commitment, one rejection)",
    match: (f) => f.signer_call_count === 1 && f.quote_rejections.length === 1
      && f.quote_rejections[0].offered === "100000" && f.quote_rejections[0].source === "caller-config",
  },
  {
    id: "xc_a10d_race_conflict_firstaccepted", mode: "first-accepted", amounts: "10000,100000", cycles: 2,
    client: "v5", concurrency: 2,
    matrix: "A10d",
    expect: "conflicting-offer race, first-accepted (cycle-3 pre-registration): whichever offer arrives first commits (one signature); the concurrent conflicting quote must be rejected pre-signer — regardless of which slot anchors (order is timing-dependent; the signed VALUE and rejection direction are recorded verbatim)",
    match: (f) => f.signer_call_count === 1 && f.quote_rejections.length === 1
      && f.quote_rejections[0].source === "quote-ledger",
  },
  {
    id: "xc_a12_casevariant_same_firstaccepted", mode: "first-accepted", amounts: "10000,10000", cycles: 2,
    overrides: [{ payTo: CASE_UPPER }, { payTo: CASE_LOWER }],
    matrix: "A12",
    expect: "case-only EVM recipient variation, unchanged amount, first-accepted (cycle-3 pre-registration, e993bef delta control): canonicalized quote-ledger keys make the case-variant offer ride the SAME anchor — both cycles sign, zero QuoteMismatch (no false positives from case spelling)",
    match: (f) => f.signer_values.join(",") === "10000,10000" && f.quote_rejections.length === 0,
  },
  {
    id: "xc_a13_casevariant_raise_firstaccepted", mode: "first-accepted", amounts: "10000,100000", cycles: 2,
    overrides: [{ payTo: CASE_UPPER }, { payTo: CASE_LOWER }],
    matrix: "A13",
    expect: "case-only EVM recipient variation + raised amount, first-accepted (cycle-3 pre-registration, e993bef delta control): canonical keys collapse the case-variant offer onto the accepted anchor — the raised 100000 must reject pre-signer vs expected=10000 (at case-sensitive b1a4d8ce keys this offer would have signed as a fresh key: the bypass the two normalization commits close)",
    match: (f) => f.signer_values.join(",") === "10000" && f.quote_rejections.length === 1
      && f.quote_rejections[0].source === "quote-ledger" && f.quote_rejections[0].expected === "10000"
      && f.quote_rejections[0].offered === "100000",
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

  // Verbatim recipient/amount actually served per 402 contact (from the stand's own
  // session report, when available) — proves what the two race slots were offered.
  const servedContacts = standReport?.scenarios?.[0]?.sessions?.[0]?.requirementDetails
    ?? standReport?.scenarios?.[0]?.session?.requirementDetails ?? null;

  const facts = {
    signer_values: signerValues,
    signer_call_count: summary?.signer_call_count ?? signerValues.length,
    quote_rejections: quoteRejections,
    other_rejections: otherRejections,
    per_cycle: summary?.per_cycle ?? null,
    served_contacts: servedContacts,
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
        : "FAIL",
    timeline: events,
    stand: standReport?.scenarios?.[0]
      ? { stand_verdict: standReport.scenarios[0].verdict, stand_reasons: standReport.scenarios[0].reasons }
      : null,
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const only = process.env.XC_ONLY;
  const sessions = only ? SESSIONS.filter((s) => s.id.includes(only)) : SESSIONS;
  const results = [];
  let port = 4470;
  for (const sess of sessions) {
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
    fixture: "S-BS-06 x PR #3920 cross-check cycle 3 (re-pinned re-run at e993bef: green-zone regression + identical-offer races + NEW conflicting-offer races A10c/A10d + case-variant recipient controls A12/A13)",
    upstream_issue: "https://github.com/x402-foundation/x402/issues/3866",
    pr_head: "e993bef62c9f7eea610f27cf3240c8bcdc599ad7",
    rerun_note: "verification cycle 3: per the posted acceptance protocol the head re-pin triggers a full re-run rather than mixing heads; delta vs cycle 2 (b1a4d8ce) = 12fa8a95 (EVM recipient case-insensitivity) + e993bef6 (shared canonical form in sameRecipient/quoteKeyFor). Cycle-2 pre-registrations A1-A11 unchanged; A10c/A10d and A12/A13 are new cycle-3 pre-registrations targeting the author's stated invariant (concurrent conflicting offers must not produce conflicting commitments) and the recipient-canonicalization delta",
    prior_cycles: {
      cycle1: "2b4cc47 — 12/12 sessions, matrix A1-A9 green (fixture s-bs-06-pr3920-crosscheck.fixture.json)",
      cycle2: "b1a4d8ce — 13/15 pass; A11 closed; A10a/A10b open: two signatures in the identical-offer first-contact window, zero rejections (fixture s-bs-06-pr3920-crosscheck-r4.fixture.json)",
    },
    pull_request: {
      repo: "x402-foundation/x402",
      number: 3920,
      branch: "feat/expected-amount",
      head: "e993bef62c9f7eea610f27cf3240c8bcdc599ad7 (recipient-canonicalization fix)",
      head_source: "refs/pull/3920/head fetched and verified == e993bef62c9f7eea610f27cf3240c8bcdc599ad7 before build",
      opened: "2026-10-24T07:22:27Z",
      note: "@x402/core built from the PR head (npm pack), installed via file: + overrides; PR code is the ONLY rejection logic in these sessions",
    },
    verdict_semantics: {
      PASS: "observed behavior satisfies the matrix row's required behavior",
      FAIL: "conformance gap: the PR's own control does not produce the matrix-required behavior (finding, not harness error)",
      note: "A10a/A10b verdicts continue the cycle-2 pre-registration (exactly one signature in the identical-offer first-contact window) for continuity; the PR author's in-thread position is that identical concurrent offers are duplicate-payment semantics out of the quote-control layer's scope — A10c/A10d now test that narrower invariant directly",
    },
    evidence_discipline: {
      established: "pre-signer rejection (signer-call count unchanged) or signing (signer invoked) at the signer boundary",
      not_established: "an ON-CHAIN transfer: settlement is mocked; per-session throwaway unfunded wallets",
      redaction: "no private keys, no signatures, no usable authorizations; nonce values truncated",
    },
    amounts_note: "atomic units, USDC 6 decimals: 10000 = $0.01, 5000 = $0.005, 50000 = $0.05, 100000 = $0.10, 5000000 = $5.00 (cap is $1 = 1,000,000). A11 operates in decimal-string representations: expectation pinned at $0.01, probe presents 0.5 (non-atomic) = 50x the pin if misinterpreted as dollars",
    versions: {
      note: "tested version pin",
      packages: { "@x402/core": "2.28.0+pr3920@e993bef (file: tarball)", "@x402/evm": "2.28.0", "@x402/express": "2.28.0", "@x402/fetch": "2.28.0", viem: "2.48.11" },
      tarball_sha256: "6c126dbea85be3bfb290f9f5b6fc977427ddb045797d4f565cf5d30ec8d2718d",
      runtime: `node ${process.version}`,
      network: "Base Sepolia (eip155:84532), USDC 0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      test_lab: { repo: "github.com/igor-vii/Argus-Agent-Test-Lab", harness: "sut-x402-pr3920/", orchestrator: "battery-pr3920-c3.mjs", clients: "green/sequential sessions reuse client_v3.ts unchanged; race sessions use client_v5.ts CONCURRENCY=2 (same instrumentation perimeter)" },
    },
    sessions: results,
    matrix_rollup: rollup,
    summary: {
      total: results.length,
      pass: results.filter((r) => r.verdict === "PASS").length,
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
