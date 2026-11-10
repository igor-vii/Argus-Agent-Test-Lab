#!/usr/bin/env node
/**
 * Battery: boundra-a10 — pre-registered A10a/A10b identical-offer race matrix
 * (x402 #4198) against the Boundra pre-sign reservation boundary.
 *
 * Candidate (variable): gobeyondfj-cmd/boundra @ fb09284434b85f824b099ade4430e1b77b4c4086
 *   - decisions come ONLY from the pinned checkout (Gateway.evaluate_payment +
 *     SpendLedger) via a transport-only local adapter;
 *   - client side = the pinned TS SDK (createX402Hook) inside the lab race
 *     perimeter client (client_boundra.ts, base = sealed client_v5.ts).
 *
 * Harness (constant): S-BS-06 fault-injection stand + CONCURRENCY=2 race slots
 * in one process (common start gate), signer-call counter, JSONL event ledger —
 * same perimeter as sealed cycles argus-seal-0004/0008/0012 (records #4/#8/#12).
 *
 * Session lifecycle (addendum R2): FRESH adapter process + FRESH state dir
 * (fresh SQLite spend.db) per session — reservation state never leaks across
 * sessions.
 *
 * Session matrix (both modes A10a explicit / A10b first-accepted; modes are
 * mechanically identical for this candidate — retained for topology
 * comparability with the cycle-1/2/3 baseline; divergence between modes is an
 * anomaly, not a mode effect):
 *   case1 same purchase / shared owner        -> exactly 1 signed payment
 *   case2 same purchase / separate owners     -> 2 signed (boundary negative control)
 *   case3 different purchases / same quote    -> 2 signed
 *   case4 same purchase_id / changed intent   -> explicit conflict, 0 additional
 *                                                signatures after the first commitment
 *   case3c (SUPPLEMENTARY probe, config-dependent expectation): conflicting
 *          offers, distinct purchase_ids -> 2 signed under reservation-only
 *          configuration (the baseline quote-control would yield 1) — a
 *          configuration fact, not a regression.
 *   case4 doubles as control C (A10c/A10d equivalent): observable criterion =
 *   exactly 1 commitment + exactly 1 pre-signer rejection per mode; the
 *   "must not over-block" side is case3/case3c. Winner-agnostic: matchers
 *   never assert WHICH slot won; winning amount + rejection layer are logged
 *   verbatim in the event JSONL and the adapter verdict log.
 *
 * Pre-flight (UNSEALED dry-run, runs before the sealed matrix unless
 * SKIP_PREFLIGHT=1): als_preflight verifies the AsyncLocalStorage glue under
 * concurrency — each slot must carry its own (owner, purchaseId) into
 * evaluate() (cross-checked against the adapter's own log).
 *
 * Evidence discipline: settlement mocked; per-session throwaway unfunded keys;
 * signatures NOT logged; no real funds, wallets or external network.
 *
 * Env: BOUNDRA_REPO (pinned checkout path), SKIP_PREFLIGHT, XC_ONLY (session id filter)
 */
import { spawn, execSync } from "node:child_process";
import {
  mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync,
  mkdtempSync, rmSync, cpSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAB_ROOT = path.resolve(__dirname, "..");
const SUT_ROOT = __dirname;
const OUT_DIR = "/tmp/argus-boundra-a10";
const FIXTURE_OUT = path.join(LAB_ROOT, "docs/block-b/fixtures/S-BS-06/s-bs-06-boundra-a10.fixture.json");
const TSX = path.join(SUT_ROOT, "node_modules/.bin/tsx");
const PYTHON = process.env.PYTHON || "python3";
const BOUNDRA_REPO = path.resolve(process.env.BOUNDRA_REPO || path.join(SUT_ROOT, "../../boundra"));
// STAND_ROOT: the S-BS-06 engine (src/cli/argus.ts) lives in the PRIVATE product
// repository since the boundary split (sealed record #0013, snapshot efbf51e); the
// public repo retains the proof layer only. The engine itself is UNCHANGED lab
// harness (same scenario, same flags as battery-pr3920-c3.mjs) — only its source
// checkout differs, recorded in the fixture provenance.stand.
const STAND_ROOT = path.resolve(process.env.STAND_ROOT || LAB_ROOT);
const ADAPTER = path.join(SUT_ROOT, "adapters/boundra_adapter_server.py");
const ADAPTER_PORT_BASE = 4610;
const BASE = "http://127.0.0.1";
const OWNER_A = "owner-slot-a";
const OWNER_B = "owner-slot-b";
const PID_1 = "purchase-1";
const PID_2 = "purchase-2";

const XC = { explicit: "$0.01", "first-accepted": "first-accepted" };

/* --------------------------- session matrix ------------------------------ */
/* matchers are winner-agnostic: totals only; the winning slot/amount is
   recorded verbatim, never asserted. */

const case1Match = (f) => f.signer_call_count === 1
  && f.presign_rejections.length === 1
  && /Boundra DENY/.test(f.presign_rejections[0].reason)
  && /duplicate signing permission denied/.test(f.presign_rejections[0].reason)
  && f.slots_committed.length === 1
  && f.attribution.consistent;

const case2Match = (f) => f.signer_call_count === 2
  && f.presign_rejections.length === 0
  && f.slots_committed.length === 2
  && f.presign_decisions.length === 2
  && f.presign_decisions[0].owner !== f.presign_decisions[1].owner
  && f.presign_decisions[0].purchase_id === f.presign_decisions[1].purchase_id;

const case3Match = (f) => f.signer_call_count === 2
  && f.presign_rejections.length === 0
  && f.slots_committed.length === 2
  && f.presign_decisions.length === 2
  && f.presign_decisions[0].purchase_id !== f.presign_decisions[1].purchase_id
  && f.presign_decisions[0].owner === f.presign_decisions[1].owner;

const case4Match = (f) => f.signer_call_count === 1
  && f.presign_rejections.length === 1
  && /Boundra DENY/.test(f.presign_rejections[0].reason)
  && /purchase_id conflict/.test(f.presign_rejections[0].reason)
  && f.slots_committed.length === 1
  && f.attribution.consistent;

const case3cMatch = (f) => f.signer_call_count === 2
  && f.presign_rejections.length === 0
  && f.slots_committed.length === 2
  && f.presign_decisions.length === 2
  && f.presign_decisions[0].purchase_id !== f.presign_decisions[1].purchase_id;

const preflightMatch = (f) => f.signer_call_count === 2
  && f.presign_rejections.length === 0
  && f.slots_committed.length === 2
  && f.presign_decisions.length === 2
  && f.presign_decisions.some((d) => d.slot === 1 && d.purchase_id === PID_1)
  && f.presign_decisions.some((d) => d.slot === 2 && d.purchase_id === PID_2)
  && f.adapter_owners_ok === true;

const SESSIONS = [
  {
    id: "als_preflight", preflight: true, mode: "explicit", amounts: "10000,10000",
    owners: `${OWNER_A},${OWNER_A}`, pids: `${PID_1},${PID_2}`,
    expect: "UNSEALED dry-run: ALS glue — each race slot must carry its own (owner, purchaseId) into evaluate() under concurrency; cross-checked against the adapter log",
    match: preflightMatch,
  },
  // ---- A10a mode (explicit label; mechanically identical for the candidate) ----
  {
    id: "b_a10a_case1_shared_owner", mode: "explicit", amounts: "10000,10000",
    owners: `${OWNER_A},${OWNER_A}`, pids: `${PID_1},${PID_1}`,
    matrix: "case1/A10a",
    expect: "same purchase / shared owner race: exactly ONE signed payment; the concurrent duplicate must be rejected pre-signer by the reservation layer (duplicate, no new token)",
    match: case1Match,
  },
  {
    id: "b_a10a_case2_separate_owners", mode: "explicit", amounts: "10000,10000",
    owners: `${OWNER_A},${OWNER_B}`, pids: `${PID_1},${PID_1}`,
    matrix: "case2/A10a",
    expect: "same purchase / SEPARATE owners (boundary negative control): UNIQUE(owner, purchase_id) does not collide across owner strings — 2 signed, behavior unchanged; one Gateway instance, not cross-process (out of scope by pre-registration)",
    match: case2Match,
  },
  {
    id: "b_a10a_case3_distinct_purchases", mode: "explicit", amounts: "10000,10000",
    owners: `${OWNER_A},${OWNER_A}`, pids: `${PID_1},${PID_2}`,
    matrix: "case3/A10a",
    expect: "different purchase IDs over an IDENTICAL quote: reservations independent — 2 signed",
    match: case3Match,
  },
  {
    id: "b_a10a_case4_changed_intent", mode: "explicit", amounts: "10000,100000",
    owners: `${OWNER_A},${OWNER_A}`, pids: `${PID_1},${PID_1}`,
    matrix: "case4/A10a (= A10c equivalent)",
    expect: "same purchase_id / changed intent (conflicting offers, race): explicit purchase_id conflict — exactly 1 commitment + exactly 1 pre-signer rejection, 0 additional signatures after the first commitment; winner-agnostic (whichever offer wins the reservation race commits)",
    match: case4Match,
  },
  {
    id: "b_a10a_case3c_conflicting_distinct_purchases", mode: "explicit", amounts: "10000,100000",
    owners: `${OWNER_A},${OWNER_A}`, pids: `${PID_1},${PID_2}`,
    matrix: "case3c/A10a (supplementary)",
    expect: "SUPPLEMENTARY probe, config-dependent expectation: conflicting offers under DISTINCT purchase_ids — 2 signed under reservation-only configuration (baseline quote-control would yield 1); configuration fact, not a regression",
    match: case3cMatch,
  },
  // ---- A10b mode (first-accepted label; mechanically identical for the candidate) ----
  {
    id: "b_a10b_case1_shared_owner", mode: "first-accepted", amounts: "10000,10000",
    owners: `${OWNER_A},${OWNER_A}`, pids: `${PID_1},${PID_1}`,
    matrix: "case1/A10b",
    expect: "same as case1/A10a in first-accepted labeling (modes mechanically identical for this candidate; divergence is an anomaly)",
    match: case1Match,
  },
  {
    id: "b_a10b_case2_separate_owners", mode: "first-accepted", amounts: "10000,10000",
    owners: `${OWNER_A},${OWNER_B}`, pids: `${PID_1},${PID_1}`,
    matrix: "case2/A10b",
    expect: "same as case2/A10a in first-accepted labeling (boundary negative control)",
    match: case2Match,
  },
  {
    id: "b_a10b_case3_distinct_purchases", mode: "first-accepted", amounts: "10000,10000",
    owners: `${OWNER_A},${OWNER_A}`, pids: `${PID_1},${PID_2}`,
    matrix: "case3/A10b",
    expect: "same as case3/A10b in first-accepted labeling",
    match: case3Match,
  },
  {
    id: "b_a10b_case4_changed_intent", mode: "first-accepted", amounts: "10000,100000",
    owners: `${OWNER_A},${OWNER_A}`, pids: `${PID_1},${PID_1}`,
    matrix: "case4/A10b (= A10d equivalent)",
    expect: "same as case4/A10a in first-accepted labeling (= A10d equivalent): exactly 1 commitment + exactly 1 pre-signer rejection, winner-agnostic",
    match: case4Match,
  },
  {
    id: "b_a10b_case3c_conflicting_distinct_purchases", mode: "first-accepted", amounts: "10000,100000",
    owners: `${OWNER_A},${OWNER_A}`, pids: `${PID_1},${PID_2}`,
    matrix: "case3c/A10b (supplementary)",
    expect: "same as case3c/A10a in first-accepted labeling (supplementary, config-dependent expectation)",
    match: case3cMatch,
  },
];

/* ------------------------------ plumbing --------------------------------- */

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForAdapter(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return await res.json();
    } catch { /* not up yet */ }
    await sleep(150);
  }
  throw new Error(`adapter on port ${port} did not become healthy`);
}

const ts = (iso) => Date.parse(iso);

function extractFacts(events, summary, adapterLines, auditRecords, sess) {
  const signerValues = events.filter((e) => e.type === "signer_call").map((e) => e.value);
  const presignDecisions = events
    .filter((e) => e.type === "presign_decide")
    .map((e) => ({ slot: e.slot, owner: e.owner, purchase_id: e.purchase_id, decision: e.decision, reason: e.reason, at: e.at }));
  const presignRejections = presignDecisions.filter((d) => d.decision === "rejected");
  const slotResults = events.filter((e) => e.type === "slot_result").map((e) => ({ slot: e.slot, http: e.http, receipt_served: e.receipt_served ?? null, at: e.at }));
  const slotErrors = events.filter((e) => e.type === "slot_error").map((e) => ({ slot: e.slot, error: e.error, error_name: e.error_name, at: e.at }));
  const slotsCommitted = slotResults.filter((s) => s.http === 200);

  // Winner-agnostic signer attribution: the pre-sign rejection by construction
  // precedes the signer entry, so a rejecting slot cannot own a signer call;
  // with exactly one commitment and signer_call_count == commitments, the
  // single signer call is attributed to the committed slot(s).
  const attribution = {
    consistent: signerValues.length === slotsCommitted.length
      && presignRejections.every((d) => {
        const err = slotErrors.find((e) => e.slot === d.slot);
        return !!err; // the rejecting slot ended in slot_error (pre-signer abort)
      }),
    note: "rejected slots carry presign_decide=rejected + slot_error and by construction have zero signer calls; signer_call_count must equal the number of committed slots",
  };

  // Metrics: signer-call deltas (ms) + both-before-any-slot-completed flag.
  const signerTimes = events.filter((e) => e.type === "signer_call").map((e) => e.at);
  const deltas = [];
  for (let i = 1; i < signerTimes.length; i++) deltas.push(ts(signerTimes[i]) - ts(signerTimes[i - 1]));
  const firstSlotDone = [...slotResults, ...slotErrors].map((s) => ts(s.at)).sort((a, b) => a - b)[0] ?? null;
  const metrics = {
    signer_call_deltas_ms: deltas.length ? deltas : null,
    both_calls_before_first_slot_completion: signerTimes.length === 2 && firstSlotDone !== null
      ? signerTimes.every((t) => ts(t) <= firstSlotDone)
      : null,
  };

  // Adapter-side cross-check (observation only): every evaluate seen by the
  // adapter must carry the owner/purchaseId the client intended per slot.
  const adapterEvals = adapterLines.filter((l) => l.type === "adapter_evaluate");
  const adapter_owners_ok = presignDecisions.length > 0 && presignDecisions.every((d) => {
    return adapterEvals.some((a) => a.owner === d.owner && a.purchase_id === d.purchase_id)
      && adapterEvals.length === presignDecisions.length;
  });

  const conflictFlags = adapterEvals.map((a) => ({ purchase_id: a.purchase_id, duplicate: !!a.duplicate, purchase_id_conflict: !!a.purchase_id_conflict, layer: a.layer, decision: a.decision }));

  return {
    signer_values: signerValues,
    signer_call_count: summary?.signer_call_count ?? signerValues.length,
    presign_decisions: presignDecisions,
    presign_rejections: presignRejections,
    slots_committed: slotsCommitted,
    slots_errored: slotErrors,
    attribution,
    metrics,
    adapter_owners_ok,
    adapter_verdicts: conflictFlags,
    adapter_audit: auditRecords,
    client_rc: summary ? 0 : 1,
  };
}

async function runSession(sess, standPort, adapterPort) {
  const evLog = path.join(OUT_DIR, `${sess.id}.jsonl`);
  const adapterLog = path.join(OUT_DIR, `${sess.id}.adapter.jsonl`);
  try { unlinkSync(evLog); } catch {}
  try { unlinkSync(evLog + ".summary"); } catch {}
  try { unlinkSync(adapterLog); } catch {}

  // R2: fresh reservation-owner state per session.
  const stateDir = mkdtempSync(path.join(tmpdir(), "boundra-a10-state-"));

  const adapterProc = spawn(PYTHON, [ADAPTER], {
    env: {
      ...process.env,
      BOUNDRA_REPO,
      BOUNDRA_STATE_DIR: stateDir,
      BOUNDRA_ADAPTER_PORT: String(adapterPort),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let adapterOut = "", adapterErr = "";
  adapterProc.stdout.on("data", (d) => { adapterOut += d; });
  adapterProc.stderr.on("data", (d) => { adapterErr += d; });

  let health = null;
  try {
    health = await waitForAdapter(adapterPort);
  } catch (e) {
    try { adapterProc.kill("SIGKILL"); } catch {}
    return {
      session: sess.id, matrix: sess.matrix ?? null, preflight: !!sess.preflight,
      verdict: "HARNESS_ERROR", error: `adapter failed to start: ${e.message}; stderr=${adapterErr.slice(0, 400)}`,
    };
  }

  // The stand (lab constant) — same spawn shape as battery-pr3920-c3.mjs.
  const standArgs = [
    "src/cli/argus.ts", "run", "--block", "B", "--family", "BS",
    "--scenario", "S-BS-06", "--bind", `0.0.0.0:${standPort}`,
    "--observe-window-ms", "2500", "--skip-gate", "--json",
    "--requirement-amounts", sess.amounts,
  ];
  const standProc = spawn(TSX, standArgs, { cwd: STAND_ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let standOut = "", standErr = "";
  standProc.stdout.on("data", (d) => (standOut += d));
  standProc.stderr.on("data", (d) => (standErr += d));
  await sleep(3000); // stand listen

  const clientEnv = {
    ...process.env,
    RESOURCE_SERVER_URL: `${BASE}:${standPort}`,
    CONCURRENCY: "2",
    EVM_PRIVATE_KEY: `0x${randomBytes(32).toString("hex")}`,
    CLIENT_EVENT_LOG: evLog,
    XC_EXPECTED: XC[sess.mode] ?? "false",
    BOUNDRA_ADAPTER_URL: `${BASE}:${adapterPort}`,
    BOUNDRA_TS_SDK: process.env.BOUNDRA_TS_SDK || path.join(BOUNDRA_REPO, "sdk/typescript/src/index.ts"),
    BOUNDRA_OWNER: sess.owners.split(",")[0],
    BOUNDRA_OWNER_2: sess.owners.split(",")[1],
    BOUNDRA_PURCHASE_ID: sess.pids.split(",")[0],
    BOUNDRA_PURCHASE_ID_2: sess.pids.split(",")[1],
  };

  const client = await withTimeout(
    run(TSX, ["client_boundra.ts"], { cwd: SUT_ROOT, env: clientEnv }),
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
  try { adapterProc.kill("SIGKILL"); } catch {}

  writeFileSync(adapterLog, adapterOut || JSON.stringify({ error: adapterErr || "no output" }));
  writeFileSync(path.join(OUT_DIR, `${sess.id}.stand.json`), standOut || JSON.stringify({ error: standErr || "no output" }));
  // Preserve the fresh session state (audit trail + SQLite ledger) as evidence.
  try { cpSync(stateDir, path.join(OUT_DIR, `${sess.id}.state`), { recursive: true }); } catch {}
  try { rmSync(stateDir, { recursive: true, force: true }); } catch {}

  const events = existsSync(evLog)
    ? readFileSync(evLog, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const summaryLine = (client.stdout.split("\n").find((l) => l.startsWith("PROBE_SUMMARY:")) ?? "").slice("PROBE_SUMMARY: ".length);
  let summary = null;
  try { summary = JSON.parse(summaryLine); } catch {}

  const adapterLines = adapterOut.trim().split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return { unparsable: l.slice(0, 200) }; } });
  const auditPath = path.join(OUT_DIR, `${sess.id}.state`, "audit.jsonl");
  const auditRecords = existsSync(auditPath)
    ? readFileSync(auditPath, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];

  const facts = extractFacts(events, summary, adapterLines, auditRecords, sess);
  const harnessError = client.code !== 0 && events.length === 0;
  return {
    session: sess.id,
    preflight: !!sess.preflight,
    matrix: sess.matrix ?? null,
    expectation_mode_label: sess.mode,
    requirement_amounts_served: sess.amounts.split(","),
    owners_config: sess.owners.split(","),
    purchase_ids_config: sess.pids.split(","),
    matrix_row: sess.expect,
    adapter_state_dir_policy: "fresh per session (R2)",
    adapter_health: { policy_summary: health.policy_summary, state_dir_basis: "fresh mkdtemp per session" },
    observed: facts,
    verdict: harnessError
      ? "HARNESS_ERROR"
      : sess.match(facts)
        ? "PASS"
        : "FAIL",
    timeline: events,
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const only = process.env.XC_ONLY;
  const skipPreflight = process.env.SKIP_PREFLIGHT === "1";
  const sessions = SESSIONS.filter((s) => (skipPreflight ? !s.preflight : true))
    .filter((s) => (only ? s.id.includes(only) : true));

  const labCommit = (() => {
    try { return execSync("git rev-parse HEAD", { cwd: LAB_ROOT }).toString().trim(); }
    catch { return "unresolved"; }
  })();
  const standCommit = (() => {
    try { return execSync("git rev-parse HEAD", { cwd: STAND_ROOT }).toString().trim(); }
    catch { return "unresolved"; }
  })();
  const boundraCommit = (() => {
    try { return execSync("git rev-parse HEAD", { cwd: BOUNDRA_REPO }).toString().trim(); }
    catch { return "unresolved"; }
  })();
  const nodeVersion = process.version;
  let npmLs = null;
  try { npmLs = execSync("npm ls --depth=0", { cwd: SUT_ROOT }).toString().trim(); } catch {}

  const results = [];
  let standPort = 4480;
  let adapterPort = ADAPTER_PORT_BASE;
  for (const sess of sessions) {
    process.stdout.write(`[boundra-a10] ${sess.id} ... `);
    const rec = await runSession(sess, standPort++, adapterPort++);
    results.push(rec);
    console.log(rec.verdict);
  }

  const sealed = results.filter((r) => !r.preflight);
  const fixture = {
    rig: "S-BS-06 x Boundra fb09284 — pre-registered A10a/A10b identical-offer race matrix (x402 #4198), battery-boundra-a10.mjs",
    attribution: {
      lab: "Argus Agent Test Lab",
      operator: "igor-vii (run executed in the lab sandbox on the operator's behalf)",
      repo: "github.com/igor-vii/Argus-Agent-Test-Lab",
      lab_commit: labCommit,
      stand: {
        engine: "S-BS-06 fault-injection stand (src/cli/argus.ts run --block B --family BS --scenario S-BS-06) — UNCHANGED lab harness",
        source: "private product repo igor-vii/Argus-Agent-Test-Lab-product (engine moved there by sealed boundary record argus-seal-0013, snapshot efbf51e)",
        stand_root_commit: standCommit,
        spawn_flags: "--observe-window-ms 2500 --skip-gate --json --requirement-amounts <session>",
        deviation_note: "documented deviation: STAND_ROOT env selects the engine checkout (public repo has no src/ since the boundary split); engine code/scenario/flags identical to the cycle-3 baseline",
      },
      harness: "sut-boundra-a10/ (orchestrator battery-boundra-a10.mjs; client adapter client_boundra.ts, base = sealed client_v5.ts perimeter)",
    },
    provenance: {
      upstream_issue: "https://github.com/x402-foundation/x402/issues/4198",
      candidate: {
        repo: "gobeyondfj-cmd/boundra",
        commit: boundraCommit,
        pin: "fb09284434b85f824b099ade4430e1b77b4c4086",
        integration: "pinned TS SDK (createX402Hook) client-side; pinned Gateway.evaluate_payment + SpendLedger decision-side via transport-only adapter (adapters/boundra_adapter_server.py, zero decision logic)",
        pr2_included: false,
      },
      pre_registration: "fixed in x402 #4198 thread (igor-vii comment 'Order and pins'); addendum items R1-R3 recorded in this fixture metadata",
      baseline: "cycle-1/2/3 red zone records #4/#8/#12 (argus-seal-0004/0008/0012) @ 2b4cc47 / b1a4d8c / e993bef",
    },
    addendum: {
      repetitions: "1 canonical run per session; re-run only as documented deviation",
      window: "single battery run session",
      node_version: nodeVersion,
      npm_ls: npmLs,
      r1_seq_derivation: "next free seq derived from attestations/INDEX.json (min 0000, max 0017, no collision) -> 0018",
      r2_fresh_state: "fresh adapter process + fresh mkdtemp state dir (SQLite spend.db) per session; reservation owner state never crosses sessions",
      r3_no_quote_control: {
        fact: "client_boundra.ts does NOT configure setSpendControls(expectedAmount); the hook is created without expected_amount/expected_recipient in BOTH modes",
        justification: "the onBeforePaymentCreation hook API exists only in @x402/fetch 2.30.0; stacking the 2.28.0 PR build with 2.30.0 would be a larger deviation than replacing the control",
        mapping: "case4@A10a := A10c-equivalent; case4@A10b := A10d-equivalent; control C observable criterion = exactly 1 commitment + exactly 1 pre-signer rejection per mode (winner-agnostic)",
        modes_note: "A10a/A10b labels retained for topology comparability; mechanically identical for this candidate (dedup/conflict by intent digest); result divergence between modes is an anomaly",
      },
      attribution_note: "winner-agnostic matchers; winning slot/amount + rejection layer logged verbatim in the event JSONL and adapter verdict log; rejected slots carry zero signer calls by construction (attribution check in facts)",
      case3c_note: "case3c is a SUPPLEMENTARY probe with config-dependent expectation: signer=2 is correct under reservation-only configuration; the baseline quote-control would yield 1 — configuration fact, not a regression",
      owners_model: "run #1 case2 = distinct owner STRINGS through ONE Gateway (UNIQUE(owner, purchase_id) scope check), not cross-process — cross-process without a shared owner is out of scope by pre-registration",
      out_of_scope_boundary: "post-sign ambiguity reconciliation (#4094), facilitator-side dedup, cross-process without a shared owner, DO-backed door (wave 2, cv-scvd) — recorded as boundary, not PASS/FAIL",
    },
    preflight: results.find((r) => r.preflight) ?? null,
    sessions: sealed,
    green_zone_definition: "exactly one signed payment per purchase across the three matrix cases (case1, case2-control unchanged, case3), with conflict controls green (case4: 1 commitment + 1 pre-signer rejection in both modes)",
    evidence_discipline: {
      established: "pre-signer rejection (presign_decide=rejected + slot_error, signer untouched) or signing (signer_call) at the signer boundary",
      not_established: "an on-chain transfer: settlement is mocked; per-session throwaway unfunded wallets",
      redaction: "no private keys, no signatures, no usable authorizations; nonces truncated",
    },
  };

  writeFileSync(FIXTURE_OUT, JSON.stringify(fixture, null, 2) + "\n");
  const fails = sealed.filter((r) => r.verdict !== "PASS");
  console.log(`\n[boundra-a10] sealed sessions: ${sealed.length}, PASS: ${sealed.length - fails.length}, not-PASS: ${fails.length}`);
  console.log(`[boundra-a10] fixture: ${FIXTURE_OUT}`);
  if (fails.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`[boundra-a10] fatal: ${e.message}`);
  process.exit(1);
});
