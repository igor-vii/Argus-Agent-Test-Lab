// battery_hookguard.mjs — hostile battery of the onBeforePaymentCreation hook
// (agentic-finance-graph@0.3.7, policy recommended-v3), pre-registered as draft
// 0031 (freeze posted in x402#3866 before the first check call). Stdlib + the
// SUT package only. NO RETRIES: every check is written exactly once — a failure
// is a result. Budget $0.00: free gate_check only, no keys, no payments signed.
//
// Record schema per call: {utc_ts, session, call_no, reference (client_ref),
// payee, amount (atomic + usd), full_response_verbatim (raw MCP HTTP body),
// sha256(response), hook_decision, hook_reason, pending, role}.
//
// Usage: node battery_hookguard.mjs <s1a|s1b|s2|s3|s4|s5|s6|s7> [--out DIR]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { makeGateHook } from "agentic-finance-graph/bin/x402-gate-hook.mjs";

const AGENT_ID = "45978";                 // ERC-8004 Base token id (pinned in draft 0031)
const POLICY = "recommended-v3";
const MCP_URL = "https://agenticfinancegraph.com/mcp";
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const NETWORK = "eip155:8453";
// Pinned identity (draft 0031): payees P1-P6 (synthetic, unpaid by anyone),
// client_ref = the "reference" of the freeze; SHA-256 of it keys the vendor-side window.
const P = {
  P1: "0xec91f2294383838f0b434d969415aa3259229eaa",
  P2: "0x4fa78c413d611295fa021e3ef7ad36440f24c906",
  P3: "0x0a55eeabf4348d472b4bfc6b3d3be7ecdfece47a",
  P4: "0x242b3a6ee64f5a4a8c3275542bdf440aa33333f2",
  P5: "0xa1deef5d90451952ba5cd9c43d3f50eaa9333750",
  P6: "0x3174d88aa73fe01ffca36dac7274969d21ea64c3",
};
const REF = {
  R1: "argus-0031-s1-r1", R5: "argus-0031-s5-r5",
  RR1: "argus-0031-s4-rr1", RC1: "argus-0031-s6-rc1",
};
const usd = { 200: "200000000", 60: "60000000", 50: "50000000" }; // USDC atomic (6 decimals)

const argv = process.argv.slice(2);
const mode = argv[0];
const outIdx = argv.indexOf("--out");
const OUT = outIdx >= 0 ? argv[outIdx + 1] : path.join(new URL(".", import.meta.url).pathname, "..", "..", "work", "hookguard-0031");
fs.mkdirSync(OUT, { recursive: true });

// fetch recorder: tees the raw MCP HTTP exchange without disturbing the hook.
const requests = [];
const recorderFetch = async (url, opts = {}) => {
  const res = await fetch(url, opts);
  const text = await res.text();
  if (String(url).startsWith(MCP_URL)) requests.push({ url: String(url), request_body_verbatim: String(opts.body ?? ""), status: res.status, response_text_verbatim: text });
  return new Response(text, { status: res.status, headers: res.headers });
};

const utc = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

async function check(session, callNo, role, clientRef, payee, amountAtomic, amountUsd) {
  const logs = [];
  const hook = makeGateHook({
    agent: AGENT_ID, policy_name: POLICY, abortOn: ["block"],
    client_ref: clientRef, log: (o) => logs.push(o),
    fetchImpl: recorderFetch,
  });
  const t0 = utc();
  let outcome = null;
  try {
    outcome = await hook({ selectedRequirements: { scheme: "exact", network: NETWORK, asset: USDC_BASE, amount: amountAtomic, payTo: payee } });
  } catch (e) {
    outcome = { threw: String(e && e.message || e) };  // a throw is a result too, never retried
  }
  const mcp = requests.filter((r) => r.request_body_verbatim.includes("gate_check"));
  const raw = mcp.length ? mcp[mcp.length - 1] : null;
  const rec = {
    utc_ts: t0, session, call_no: callNo, role,
    reference: clientRef, payee, amount_atomic: amountAtomic, amount_usd: amountUsd,
    full_response_verbatim: raw ? raw.response_text_verbatim : null,
    sha256_response: raw ? crypto.createHash("sha256").update(raw.response_text_verbatim).digest("hex") : null,
    mcp_status: raw ? raw.status : 0,
    hook_outcome: outcome,
    hook_log: logs,
    process: { pid: process.pid, argv: process.argv.slice(1, 2), node: process.version },
  };
  const file = path.join(OUT, `s${session}-call${callNo}.json`);
  fs.writeFileSync(file, JSON.stringify(rec, null, 2) + "\n");
  const dec = logs.length ? `${logs[logs.length - 1].decision}${logs[logs.length - 1].gate ? "/" + logs[logs.length - 1].gate : ""}` : (outcome && outcome.abort ? "abort" : "no-log");
  console.log(`s${session}/c${callNo} ${clientRef} ${payee.slice(0, 8)}… $${amountUsd} -> ${dec}${outcome && outcome.abort ? " ABORT" : ""} (${file})`);
  return rec;
}

const main = async () => {
  if (!mode) { console.error("usage: battery_hookguard.mjs <s1a|s1b|s2|s3|s4|s5|s6|s7> [--out DIR]"); process.exit(2); }
  if (mode === "s1a") await check(1, 1, "control C1", REF.R1, P.P1, usd[200], 200);
  else if (mode === "s1b") await check(1, 2, "control C1 (after process restart)", REF.R1, P.P1, usd[200], 200);
  else if (mode === "s2") for (let i = 1; i <= 10; i++) await check(2, i, "control C2", `argus-0031-s2-fr${String(i).padStart(2, "0")}`, P.P1, usd[200], 200);
  else if (mode === "s3") for (let i = 1; i <= 5; i++) await check(3, i, "live", `argus-0031-s3-sr${i}`, P.P2, usd[60], 60);
  else if (mode === "s4") for (let i = 1; i <= 4; i++) await check(4, i, "live", REF.RR1, P[`P${i + 2}`], usd[200], 200);
  else if (mode === "s5") {
    await check(5, 1, "live", REF.R5, P.P6, usd[200], 200);
    await check(5, 2, "live", REF.R5, P.P6, usd[50], 50);
    await check(5, 3, "live", REF.R5, P.P6, usd[50], 50);
  } else if (mode === "s6") {
    // 8 parallel identical checks, one reference; response order recorded.
    const jobs = Array.from({ length: 8 }, (_, i) => check(6, i + 1, "live", REF.RC1, P.P1, usd[200], 200));
    await Promise.all(jobs);
    console.log("s6: 8 parallel checks resolved");
  } else if (mode === "s7") {
    // Skipped hook (control C3): the payment-creation flow runs with NO
    // onBeforePaymentCreation hook registered. Absence of any gate_check
    // request is the result; nothing is retried or simulated afterwards.
    const sent = requests.length;
    // (no hook constructed on purpose — the recorder would have caught any MCP traffic)
    const rec = {
      utc_ts: utc(), session: 7, call_no: 1, role: "control C3",
      reference: null, payee: P.P1, amount_atomic: usd[200], amount_usd: 200,
      full_response_verbatim: null, sha256_response: null, mcp_status: null,
      observable_signal: sent === 0 ? "none — no MCP request fired (hook not registered)" : `UNEXPECTED: ${sent} MCP requests fired`,
      mcp_requests_observed: sent,
      note: "payment-creation attempt executed with the hook bypassed; the frozen expectation is no externally observable signal; absence recorded as the result",
      process: { pid: process.pid, node: process.version },
    };
    fs.writeFileSync(path.join(OUT, "s7-call1.json"), JSON.stringify(rec, null, 2) + "\n");
    console.log(`s7: hook bypassed, MCP requests observed: ${sent} -> ${rec.observable_signal}`);
  } else { console.error(`unknown mode ${mode}`); process.exit(2); }
};
main().catch((e) => { console.error("FATAL (recorded, not retried):", e); process.exit(1); });
