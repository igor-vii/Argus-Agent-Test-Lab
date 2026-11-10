#!/usr/bin/env node
/**
 * Battery: gist-a10 — pre-registered A10a/A10b identical-offer race matrix
 * (x402 #4198, run #2) against the pinned gist's pre-sign owner fence.
 *
 * Candidate (variable): gist e319a833e1be184a0df16ec69f474b72 @ revision
 * df69c25fac01f68f6b71981e57b71699c12fd1b2 (pre-sign-owner-replay.mjs, file
 * sha256 d4395716de9feef0288288ac89b9b326569cf06c97dae50ac148bdb2e40dc6e6).
 *   - Layer 1: the gist's own 12 cases run VERBATIM (separate run; its report
 *     lines are evidence; internal asserts must pass, exit 0);
 *   - Layer 2 (THIS battery): the lab A10 matrix applied to the SAME mechanism —
 *     decisions come ONLY from the pinned reserve()/digest() fragment, byte-
 *     verified against the pinned file, running in a transport-only sidecar;
 *     client side = the lab race perimeter (client_gist.ts, base = sealed
 *     client_v5.ts) hooking onBeforePaymentCreation -> sidecar /reserve.
 *
 * Harness (constant): S-BS-06 fault-injection stand + CONCURRENCY=2 race slots
 * in one process (common start gate), signer-call counter, JSONL event ledger —
 * same perimeter as sealed cycles argus-seal-0004/0008/0012 and run #1
 * (battery-boundra-a10.mjs).
 *
 * Session lifecycle (addendum R2): FRESH sidecar process + FRESH state dir
 * (fresh fence root) per session — reservation state never leaks across sessions.
 *
 * Session matrix (both modes A10a explicit / A10b first-accepted; modes are
 * mechanically identical for this candidate — retained for topology
 * comparability; divergence between modes is an anomaly):
 *   case1 same purchase / shared account       -> exactly 1 signed payment, loser 'held'
 *   case2 same purchase / separate accounts    -> 2 signed (key scope = digest([account, purchaseId]))
 *   case3 different purchases / same quote     -> 2 signed
 *   case4 same purchase_id / changed intent    -> exactly 1 commitment + 1 'conflict'
 *                                                 pre-signer rejection (= A10c/A10d equivalent;
 *                                                 doubles as control C)
 *   case3c conflicting offers, distinct pids   -> 2 signed (supplementary, config-dependent)
 *
 * Pre-flight (UNSEALED dry-run, runs before the sealed matrix unless
 * SKIP_PREFLIGHT=1): als_preflight verifies the AsyncLocalStorage glue under
 * concurrency, cross-checked against the sidecar's own log.
 *
 * Evidence discipline: settlement mocked; per-session throwaway unfunded keys;
 * signatures NOT logged; no real funds, wallets or external network.
 *
 * Env: GIST_FILE (pinned gist path), SKIP_PREFLIGHT, XC_ONLY (session id filter)
 */
import { spawn, execSync } from "node:child_process";
import {
  mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync,
  mkdtempSync, rmSync, cpSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAB_ROOT = path.resolve(__dirname, "..");
const SUT_ROOT = __dirname;
const OUT_DIR = "/tmp/argus-gist-a10";
const FIXTURE_OUT = path.join(LAB_ROOT, "docs/block-b/fixtures/S-BS-06/s-bs-06-gist-a10.fixture.json");
const TSX = path.join(SUT_ROOT, "node_modules/.bin/tsx");
const PYTHON = process.env.PYTHON || "python3";
const GIST_FILE = process.env.GIST_FILE || "/home/z/my-project/work/gist-run/pre-sign-owner-replay.mjs";
const GIST_SHA = "d4395716de9feef0288288ac89b9b326569cf06c97dae50ac148bdb2e40dc6e6";
const GIST_REVISION = "df69c25fac01f68f6b71981e57b71699c12fd1b2";
const GIST_ID = "e319a833e1be184a0df16ec69f474b72";
const FRAG_SHA = "c6d61c7b43fe8b9c8ef28d57f234b3a9c4b4956384ab2bc75355e4eb310180b6";
const SIDECAR = path.join(SUT_ROOT, "adapters/gist_sidecar_server.mjs");
const SIDECAR_PORT_BASE = 4710;
const STAND_ROOT = path.resolve(process.env.STAND_ROOT || path.join(LAB_ROOT, "../Argus-Agent-Test-Lab-product"));
const BASE = "http://127.0.0.1";
const ACC_A = "account-slot-a";
const ACC_B = "account-slot-b";
const PID_1 = "purchase-1";
const PID_2 = "purchase-2";

const XC = { explicit: "$0.01", "first-accepted": "first-accepted" };

/* --------------------------- session matrix ------------------------------ */
/* matchers are winner-agnostic: totals only; the winning slot/amount is
   recorded verbatim, never asserted. Reason tokens are the candidate's own
   fence decisions: 'held' (same intent already reserved) / 'conflict'. */

const case1Match = (f) => f.signer_call_count === 1
  && f.presign_rejections.length === 1
  && f.presign_rejections[0].reason === "held"
  && f.slots_committed.length === 1
  && f.attribution.consistent;

const case2Match = (f) => f.signer_call_count === 2
  && f.presign_rejections.length === 0
  && f.slots_committed.length === 2
  && f.presign_decisions.length === 2
  && f.presign_decisions[0].account !== f.presign_decisions[1].account
  && f.presign_decisions[0].purchase_id === f.presign_decisions[1].purchase_id;

const case3Match = (f) => f.signer_call_count === 2
  && f.presign_rejections.length === 0
  && f.slots_committed.length === 2
  && f.presign_decisions.length === 2
  && f.presign_decisions[0].purchase_id !== f.presign_decisions[1].purchase_id
  && f.presign_decisions[0].account === f.presign_decisions[1].account;

const case4Match = (f) => f.signer_call_count === 1
  && f.presign_rejections.length === 1
  && f.presign_rejections[0].reason === "conflict"
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
  && f.sidecar_accounts_ok === true;

const SESSIONS = [
  {
    id: "als_preflight", preflight: true, mode: "explicit", amounts: "10000,10000",
    accounts: `${ACC_A},${ACC_A}`, pids: `${PID_1},${PID_2}`,
    expect: "UNSEALED dry-run: ALS glue — each race slot must carry its own (account, purchaseId) into reserve() under concurrency; cross-checked against the sidecar log",
    match: preflightMatch,
  },
  // ---- A10a mode ----
  {
    id: "g_a10a_case1_shared_account", mode: "explicit", amounts: "10000,10000",
    accounts: `${ACC_A},${ACC_A}`, pids: `${PID_1},${PID_1}`,
    matrix: "case1/A10a",
    expect: "same purchase / shared account race: exactly ONE signed payment; the concurrent duplicate must be rejected pre-signer with the candidate's own 'held' decision (same intent already reserved)",
    match: case1Match,
  },
  {
    id: "g_a10a_case2_separate_accounts", mode: "explicit", amounts: "10000,10000",
    accounts: `${ACC_A},${ACC_B}`, pids: `${PID_1},${PID_1}`,
    matrix: "case2/A10a",
    expect: "same purchase / SEPARATE accounts (boundary negative control): the fence key digest([account, purchaseId]) does not collide across account strings — 2 signed, behavior unchanged; distinct owner STRINGS, one fence root (per pre-registration scope)",
    match: case2Match,
  },
  {
    id: "g_a10a_case3_distinct_purchases", mode: "explicit", amounts: "10000,10000",
    accounts: `${ACC_A},${ACC_A}`, pids: `${PID_1},${PID_2}`,
    matrix: "case3/A10a",
    expect: "different purchase IDs over an IDENTICAL quote: reservations independent — 2 signed",
    match: case3Match,
  },
  {
    id: "g_a10a_case4_changed_intent", mode: "explicit", amounts: "10000,100000",
    accounts: `${ACC_A},${ACC_A}`, pids: `${PID_1},${PID_1}`,
    matrix: "case4/A10a (= A10c equivalent)",
    expect: "same purchase_id / changed intent (conflicting offers, race): the candidate's own 'conflict' decision — exactly 1 commitment + exactly 1 pre-signer rejection, 0 additional signatures after the first commitment; winner-agnostic (whichever offer wins the reservation race commits)",
    match: case4Match,
  },
  {
    id: "g_a10a_case3c_conflicting_distinct_purchases", mode: "explicit", amounts: "10000,100000",
    accounts: `${ACC_A},${ACC_A}`, pids: `${PID_1},${PID_2}`,
    matrix: "case3c/A10a (supplementary)",
    expect: "SUPPLEMENTARY probe, config-dependent expectation: conflicting offers under DISTINCT purchase_ids — 2 signed under fence-only configuration (baseline quote-control would yield 1); configuration fact, not a regression",
    match: case3cMatch,
  },
  // ---- A10b mode ----
  {
    id: "g_a10b_case1_shared_account", mode: "first-accepted", amounts: "10000,10000",
    accounts: `${ACC_A},${ACC_A}`, pids: `${PID_1},${PID_1}`,
    matrix: "case1/A10b",
    expect: "same as case1/A10a in first-accepted labeling (modes mechanically identical for this candidate; divergence is an anomaly)",
    match: case1Match,
  },
  {
    id: "g_a10b_case2_separate_accounts", mode: "first-accepted", amounts: "10000,10000",
    accounts: `${ACC_A},${ACC_B}`, pids: `${PID_1},${PID_1}`,
    matrix: "case2/A10b",
    expect: "same as case2/A10a in first-accepted labeling (boundary negative control)",
    match: case2Match,
  },
  {
    id: "g_a10b_case3_distinct_purchases", mode: "first-accepted", amounts: "10000,10000",
    accounts: `${ACC_A},${ACC_A}`, pids: `${PID_1},${PID_2}`,
    matrix: "case3/A10b",
    expect: "same as case3/A10b in first-accepted labeling",
    match: case3Match,
  },
  {
    id: "g_a10b_case4_changed_intent", mode: "first-accepted", amounts: "10000,100000",
    accounts: `${ACC_A},${ACC_A}`, pids: `${PID_1},${PID_1}`,
    matrix: "case4/A10b (= A10d equivalent)",
    expect: "same as case4/A10a in first-accepted labeling (= A10d equivalent): exactly 1 commitment + exactly 1 pre-signer rejection, winner-agnostic",
    match: case4Match,
  },
  {
    id: "g_a10b_case3c_conflicting_distinct_purchases", mode: "first-accepted", amounts: "10000,100000",
    accounts: `${ACC_A},${ACC_A}`, pids: `${PID_1},${PID_2}`,
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

async function waitForSidecar(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return await res.json();
    } catch { /* not up yet */ }
    await sleep(150);
  }
  throw new Error(`sidecar on port ${port} did not become healthy`);
}

const ts = (iso) => Date.parse(iso);

function extractFacts(events, summary, sidecarLines) {
  const signerValues = events.filter((e) => e.type === "signer_call").map((e) => e.value);
  const presignDecisions = events
    .filter((e) => e.type === "presign_decide")
    .map((e) => ({ slot: e.slot, account: e.account, purchase_id: e.purchase_id, decision: e.decision, reason: e.reason, raw_decision: e.raw_decision, at: e.at }));
  const presignRejections = presignDecisions.filter((d) => d.decision === "rejected");
  const slotResults = events.filter((e) => e.type === "slot_result").map((e) => ({ slot: e.slot, http: e.http, receipt_served: e.receipt_served ?? null, at: e.at }));
  const slotErrors = events.filter((e) => e.type === "slot_error").map((e) => ({ slot: e.slot, error: e.error, error_name: e.error_name, at: e.at }));
  const slotsCommitted = slotResults.filter((s) => s.http === 200);

  const attribution = {
    consistent: signerValues.length === slotsCommitted.length
      && presignRejections.every((d) => {
        const err = slotErrors.find((e) => e.slot === d.slot);
        return !!err; // the rejecting slot ended in slot_error (pre-signer abort)
      }),
    note: "rejected slots carry presign_decide=rejected + slot_error and by construction have zero signer calls; signer_call_count must equal the number of committed slots",
  };

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

  // Sidecar-side cross-check (observation only): every reserve seen by the
  // sidecar must carry the account/purchaseId the client intended per slot.
  const sidecarReserves = sidecarLines.filter((l) => l.type === "sidecar_reserve");
  const sidecar_accounts_ok = presignDecisions.length > 0 && presignDecisions.every((d) => {
    return sidecarReserves.some((a) => a.account === d.account && a.purchase_id === d.purchase_id)
      && sidecarReserves.length === presignDecisions.length;
  });

  const sidecarVerdicts = sidecarReserves.map((a) => ({
    purchase_id: a.purchase_id, decision: a.decision, intent_digest: a.intent_digest, key_digest: a.key_digest,
  }));

  return {
    signer_values: signerValues,
    signer_call_count: summary?.signer_call_count ?? signerValues.length,
    presign_decisions: presignDecisions,
    presign_rejections: presignRejections,
    slots_committed: slotsCommitted,
    slots_errored: slotErrors,
    attribution,
    metrics,
    sidecar_accounts_ok,
    sidecar_verdicts: sidecarVerdicts,
    client_rc: summary ? 0 : 1,
  };
}

async function runSession(sess, standPort, sidecarPort) {
  const evLog = path.join(OUT_DIR, `${sess.id}.jsonl`);
  const sidecarLog = path.join(OUT_DIR, `${sess.id}.sidecar.jsonl`);
  try { unlinkSync(evLog); } catch {}
  try { unlinkSync(evLog + ".summary"); } catch {}
  try { unlinkSync(sidecarLog); } catch {}

  // R2: fresh fence root per session.
  const stateDir = mkdtempSync(path.join(tmpdir(), "gist-a10-state-"));

  const sidecarProc = spawn(process.execPath, [SIDECAR], {
    env: {
      ...process.env,
      GIST_STATE_DIR: stateDir,
      GIST_SIDECAR_PORT: String(sidecarPort),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let sidecarOut = "", sidecarErr = "";
  sidecarProc.stdout.on("data", (d) => { sidecarOut += d; });
  sidecarProc.stderr.on("data", (d) => { sidecarErr += d; });

  let health = null;
  try {
    health = await waitForSidecar(sidecarPort);
  } catch (e) {
    try { sidecarProc.kill("SIGKILL"); } catch {}
    return {
      session: sess.id, matrix: sess.matrix ?? null, preflight: !!sess.preflight,
      verdict: "HARNESS_ERROR", error: `sidecar failed to start: ${e.message}; stderr=${sidecarErr.slice(0, 400)}`,
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
    GIST_SIDECAR_URL: `${BASE}:${sidecarPort}`,
    GIST_ACCOUNT: sess.accounts.split(",")[0],
    GIST_ACCOUNT_2: sess.accounts.split(",")[1],
    GIST_PURCHASE_ID: sess.pids.split(",")[0],
    GIST_PURCHASE_ID_2: sess.pids.split(",")[1],
  };

  const client = await withTimeout(
    run(TSX, ["client_gist.ts"], { cwd: SUT_ROOT, env: clientEnv }),
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
  try { sidecarProc.kill("SIGKILL"); } catch {}

  writeFileSync(sidecarLog, sidecarOut || JSON.stringify({ error: sidecarErr || "no output" }));
  writeFileSync(path.join(OUT_DIR, `${sess.id}.stand.json`), standOut || JSON.stringify({ error: standErr || "no output" }));
  // Preserve the fresh session fence state (immutable reservation records) as evidence.
  try { cpSync(stateDir, path.join(OUT_DIR, `${sess.id}.state`), { recursive: true }); } catch {}
  try { rmSync(stateDir, { recursive: true, force: true }); } catch {}

  const events = existsSync(evLog)
    ? readFileSync(evLog, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const summaryLine = (client.stdout.split("\n").find((l) => l.startsWith("PROBE_SUMMARY:")) ?? "").slice("PROBE_SUMMARY: ".length);
  let summary = null;
  try { summary = JSON.parse(summaryLine); } catch {}

  const sidecarLines = sidecarOut.trim().split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return { unparsable: l.slice(0, 200) }; } });

  const facts = extractFacts(events, summary, sidecarLines);
  const harnessError = client.code !== 0 && events.length === 0;
  return {
    session: sess.id,
    preflight: !!sess.preflight,
    matrix: sess.matrix ?? null,
    expectation_mode_label: sess.mode,
    requirement_amounts_served: sess.amounts.split(","),
    accounts_config: sess.accounts.split(","),
    purchase_ids_config: sess.pids.split(","),
    matrix_row: sess.expect,
    sidecar_state_dir_policy: "fresh per session (R2)",
    sidecar_health: health,
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

  // Provenance guard (fail fast): pinned gist file hash + sidecar fragment byte equality.
  const gistSha = createHash("sha256").update(readFileSync(GIST_FILE)).digest("hex");
  if (gistSha !== GIST_SHA) throw new Error(`pinned gist drifted: ${gistSha}`);
  const sidecarSrc = readFileSync(SIDECAR, "utf8");
  const begin = sidecarSrc.indexOf("// ---- FRAGMENT-BEGIN");
  const end = sidecarSrc.indexOf("// ---- FRAGMENT-END");
  if (begin < 0 || end < 0) throw new Error("sidecar fragment markers missing");
  const fragmentInFile = sidecarSrc.slice(sidecarSrc.indexOf("\n", begin) + 1, end).replace(/\n$/, "");
  const gistLines = readFileSync(GIST_FILE, "utf8").split("\n");
  const fragmentPinned = gistLines.slice(13, 38).join("\n");
  const fragSha = createHash("sha256").update(fragmentInFile).digest("hex");
  if (fragmentInFile !== fragmentPinned || fragSha !== FRAG_SHA) {
    throw new Error("sidecar fragment is not byte-equal to the pinned gist slice");
  }
  console.log(`[gist-a10] provenance ok: gist ${GIST_ID}@${GIST_REVISION.slice(0, 7)} sha ${gistSha.slice(0, 8)}…, fragment ${fragSha.slice(0, 8)}… byte-equal`);

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
  const nodeVersion = process.version;
  let npmLs = null;
  try { npmLs = execSync("npm ls --depth=0", { cwd: SUT_ROOT }).toString().trim(); } catch {}
  let gistNpmLs = null;
  try { gistNpmLs = execSync("npm ls --depth=0", { cwd: path.dirname(GIST_FILE) }).toString().trim(); } catch {}

  const results = [];
  let standPort = 4580;
  let sidecarPort = SIDECAR_PORT_BASE;
  for (const sess of sessions) {
    process.stdout.write(`[gist-a10] ${sess.id} ... `);
    const rec = await runSession(sess, standPort++, sidecarPort++);
    results.push(rec);
    console.log(rec.verdict);
  }

  const sealed = results.filter((r) => !r.preflight);
  const fixture = {
    rig: "S-BS-06 x gist df69c25 pre-sign owner fence — pre-registered A10a/A10b identical-offer race matrix (x402 #4198), battery-gist-a10.mjs (Layer 2)",
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
      harness: "sut-gist-a10/ (orchestrator battery-gist-a10.mjs; client adapter client_gist.ts, base = sealed client_v5.ts perimeter, same instrumentation structure as run #1 client_boundra.ts)",
    },
    provenance: {
      upstream_issue: "https://github.com/x402-foundation/x402/issues/4198",
      candidate: {
        kind: "public gist (pre-sign-owner-replay.mjs)",
        gist_id: GIST_ID,
        revision: GIST_REVISION,
        file_sha256: gistSha,
        integration: "Layer 1 = gist's own 12 cases VERBATIM (node pre-sign-owner-replay.mjs, exit 0, results embedded below); Layer 2 (this battery) = pinned sha/canonical/digest/reserve fragment (lines 14-38) byte-verified against the pinned file (fragment_sha256 below) running in a transport-only sidecar (adapters/gist_sidecar_server.mjs, zero decision logic outside the fragment); client glue mirrors the pinned hook shape (lines 64-69) with GET/empty-body adaptation, documented in client_gist.ts",
        fragment_lines: "14-38",
        fragment_sha256: fragSha,
        fragment_byte_equal_to_pinned_slice: true,
        node_version_note: "gist header says 'Node 22'; sandbox runs node v24.22.2 — Layer 1 verbatim run passed 12/12 on Node 24 (no engine errors), recorded as the appendix deviation",
        layer1_run: {
          command: "node pre-sign-owner-replay.mjs (run in /home/z/my-project/work/gist-run with the gist's own npm install --no-save --ignore-scripts @x402/fetch@2.30.0 @x402/core@2.30.0 zod@4.6.7)",
          exit_code: 0,
          cases: [
            { name: "same purchase, shared owner", outcomes: ["delivered", "held"], signCalls: 1 },
            { name: "same purchase, isolated owners (negative control)", outcomes: ["delivered", "delivered"], signCalls: 2 },
            { name: "different purchase IDs, same quote and input", outcomes: ["delivered", "delivered"], signCalls: 2 },
            { name: "same ID, different payer accounts", outcomes: ["delivered", "delivered"], signCalls: 2 },
            { name: "same ID, changed input", outcomes: ["conflict", "delivered"], signCalls: 1 },
            { name: "same ID, changed terms", outcomes: ["conflict", "delivered"], signCalls: 1 },
            { name: "lost reply after signed submission", outcomes: ["unresolved"], signCalls: 1, boundary: "x402 #4094 lost-reply class — boundary observation, not PASS/FAIL" },
            { name: "later process still refuses to sign", outcomes: ["held"], signCalls: 0 },
            { name: "failure before signer starts retains fence", outcomes: ["fenced"], signCalls: 0 },
            { name: "later process does not guess it is safe", outcomes: ["held"], signCalls: 0 },
            { name: "native cap refuses before reservation", outcomes: ["cap-refused"], signCalls: 0 },
            { name: "over-cap offer did not reserve purchase", outcomes: ["delivered"], signCalls: 1 },
          ],
          total_sign_calls: 11,
        },
      },
      pre_registration: "fixed in x402 #4198 thread (igor-vii comment 'Order and pins'); addendum items R1-R3 recorded in this fixture metadata; run order: candidate 1 (boundra fb09284, record 0018) then candidate 2 (this gist, record 0019)",
      baseline: "cycle-1/2/3 red zone records #4/#8/#12 (argus-seal-0004/0008/0012) @ 2b4cc47 / b1a4d8c / e993bef",
    },
    addendum: {
      repetitions: "1 canonical run per session; re-run only as documented deviation",
      window: "single battery run session",
      node_version: nodeVersion,
      npm_ls: npmLs,
      gist_runner_npm_ls: gistNpmLs,
      r1_seq_derivation: "next free seq derived from attestations/INDEX.json + records dir (min 0000, max 0017) -> run #1 = 0018, run #2 (this) = 0019",
      r2_fresh_state: "fresh sidecar process + fresh mkdtemp fence root per session; reservation state never crosses sessions",
      r3_gist: {
        fact: "client_gist.ts does NOT configure an expectedAmount quote-control; native spendControls are ENABLED but NON-TRIGGERING (allowedAssets maxAmountPerPayment '1000000' >= stand amounts 10000/100000) — candidate-shaped (the gist's own client sets cap '2000' at its own fixture scale; scaled here to avoid colliding with the stand's atomic amounts)",
        justification: "the cap-refusal class is exercised VERBATIM by Layer 1 (gist cases 11-12: cap-refused + over-cap offer did not reserve); stacking a quote-control into the lab client would change the candidate's client shape",
        mapping: "case4@A10a := A10c-equivalent; case4@A10b := A10d-equivalent; control C observable criterion = exactly 1 commitment + exactly 1 pre-signer rejection per mode (winner-agnostic)",
        modes_note: "A10a/A10b labels retained for topology comparability; mechanically identical for this candidate (dedup/conflict by canonical intent digest); result divergence between modes is an anomaly",
      },
      attribution_note: "winner-agnostic matchers; winning slot/amount + rejection decision logged verbatim in the event JSONL and sidecar log; rejected slots carry zero signer calls by construction (attribution check in facts)",
      case3c_note: "case3c is a SUPPLEMENTARY probe with config-dependent expectation: signer=2 is correct under fence-only configuration; the baseline quote-control would yield 1 — configuration fact, not a regression",
      owners_model: "run #2 case2 = distinct account STRINGS (fence key = digest([account, purchaseId])) through ONE fence root — single shared filesystem is the reference owner per the gist's own model; cross-process/independent-roots behavior is the gist's own Layer-1 negative control (its case 2) and is out of scope for the lab matrix",
      out_of_scope_boundary: "post-sign ambiguity reconciliation (#4094 lost-reply class — exercised verbatim by Layer 1 cases 7-8, boundary observation), facilitator-side dedup, cross-process without a shared owner, DO-backed door (wave 2, cv-scvd) — recorded as boundary, not PASS/FAIL",
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
  console.log(`\n[gist-a10] sealed sessions: ${sealed.length}, PASS: ${sealed.length - fails.length}, not-PASS: ${fails.length}`);
  console.log(`[gist-a10] fixture: ${FIXTURE_OUT}`);
  if (fails.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`[gist-a10] fatal: ${e.message}`);
  process.exit(1);
});
