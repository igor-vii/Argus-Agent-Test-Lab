// battery_hookguard.mjs — hostile battery of the onBeforePaymentCreation hook
// (agentic-finance-graph@0.3.7 client, gate server 0.22.7, receipt schema
// afg-gate-receipt/2), pre-registered as draft 0033 (freeze posted in x402#3866
// before the first check call). Re-run of the 0031 battery under the vendor's
// ISSUED CONDITIONS (comment 7144596133, 2026-11-24T21:11:21Z, frozen verbatim
// in the draft's subject.issued_conditions — the conditions are frozen as
// issued, the expected column below is the operator binding derived from them).
// Stdlib + the SUT package only.
// NO RETRIES: every check is written exactly once — a failure is a result.
// Budget $0.00: free gate_check only, no keys, no payments signed.
//
// Session order is part of the freeze: S1 -> S2 -> S3 -> S4 -> S5 -> S6 -> S7,
// then s8 (offline 503 survey), s9 (offline receipt-v2 conformance) and l1
// (one openapi GET, evidence-only).
//
// Record schema per call: {utc_ts, session, call_no, reference (client_ref),
// payee, amount (atomic + usd), full_response_verbatim (raw MCP HTTP body),
// sha256(response), hook_decision, hook_reason, pending, role}.
//
// Usage: node battery_hookguard.mjs <s1a|s1b|s2|s3|s4|s5|s6|s7|s8|s9|l1> [--out DIR]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { makeGateHook } from "agentic-finance-graph/bin/x402-gate-hook.mjs";

const AGENT_ID = "45978"; // ERC-8004 Base token id — frozen identity, unchanged since 0031 (vendor caveat binds S6 expectations to this agent's characterization)
const POLICY = "recommended-v3";
const MCP_URL = "https://agenticfinancegraph.com/mcp";
const OPENAPI_URL = "https://agenticfinancegraph.com/openapi.json";
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const NETWORK = "eip155:8453";
// Fresh identity (draft 0033): payees P1-P6 are freshly generated synthetic
// addresses (payees-0033.json, written by the freeze builder and frozen by the
// freeze commit; the same values are embedded in the draft's identity block).
// The 0031 payees are NOT reused: after 0031 they are no longer new-payee-window
// candidates for agent 45978, and reuse would silently change what
// "allow -> block" tests. client_ref = the "reference" of the freeze; SHA-256
// of it keys the vendor-side window.
const P = JSON.parse(fs.readFileSync(path.join(new URL(".", import.meta.url).pathname, "payees-0033.json"), "utf8"));
const REF = {
  R1: "argus-0033-s1-r1", R5: "argus-0033-s5-r5",
  RR1: "argus-0033-s4-rr1", RC1: "argus-0033-s6-rc1",
};
const usd = { 200: "200000000", 60: "60000000", 50: "50000000" }; // USDC atomic (6 decimals)

const argv = process.argv.slice(2);
const mode = argv[0];
const outIdx = argv.indexOf("--out");
const OUT = outIdx >= 0 ? argv[outIdx + 1] : path.join(new URL(".", import.meta.url).pathname, "..", "..", "work", "hookguard-0033");
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

// canonical JSON (sorted keys, no whitespace) — same rule as the registry's canonical()
const canon = (v) => {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  const ks = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return "{" + ks.map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
};

// find receipt-body objects (schema afg-gate-receipt/*) anywhere in a parsed response
const walkReceipts = (node, hit, pathStr) => {
  if (!node || typeof node !== "object") return;
  if (typeof node.schema === "string" && node.schema.startsWith("afg-gate-receipt/")) hit.push({ path: pathStr, body: node });
  for (const [k, v] of Object.entries(node)) walkReceipts(v, hit, pathStr + "." + k);
};

const HEX64 = /^[0-9a-f]{64}$/;

const main = async () => {
  if (!mode) { console.error("usage: battery_hookguard.mjs <s1a|s1b|s2|s3|s4|s5|s6|s7|s8|s9|l1> [--out DIR]"); process.exit(2); }
  if (mode === "s1a") await check(1, 1, "control C1", REF.R1, P.P1, usd[200], 200);
  else if (mode === "s1b") await check(1, 2, "control C1 (after process restart)", REF.R1, P.P1, usd[200], 200);
  else if (mode === "s2") for (let i = 1; i <= 10; i++) await check(2, i, "control C2", `argus-0033-s2-fr${String(i).padStart(2, "0")}`, P.P1, usd[200], 200);
  else if (mode === "s3") for (let i = 1; i <= 5; i++) await check(3, i, "live", `argus-0033-s3-sr${i}`, P.P2, usd[60], 60);
  else if (mode === "s4") for (let i = 1; i <= 4; i++) await check(4, i, "live", REF.RR1, P[`P${i + 2}`], usd[200], 200);
  else if (mode === "s5") {
    await check(5, 1, "live", REF.R5, P.P6, usd[200], 200);
    await check(5, 2, "live", REF.R5, P.P6, usd[50], 50);
    await check(5, 3, "live", REF.R5, P.P6, usd[50], 50);
  } else if (mode === "s6") {
    // 8 parallel identical checks, one reference; response order recorded.
    // Vendor-issued expectation (comment 7144596133): exactly 1 allow + 7 blocks,
    // each block with pending {decisions: 1, usd: 200}. A repeat of the 0031
    // outcome (7 allow / 1 block via pre-decision pending snapshots) is a
    // DIVERGENCE against this expectation and is recorded as-is — never re-run.
    const jobs = Array.from({ length: 8 }, (_, i) => check(6, i + 1, "live", REF.RC1, P.P1, usd[200], 200));
    await Promise.all(jobs);
    console.log("s6: 8 parallel checks resolved");
  } else if (mode === "s7") {
    // Skipped hook (control C3): the payment-creation flow runs with NO
    // onBeforePaymentCreation hook registered. Absence of any gate_check
    // request is the result; nothing is retried or simulated afterwards.
    const sent = requests.length;
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
  } else if (mode === "s8") {
    // Offline survey over the captured run (NO network): 503 reachability.
    // Vendor-issued expectation (comment 7144596133): "not observed" — a 503
    // requires >5 s queue wait (~>100 queued checks under one reference); the
    // caller cannot hold the lock. Any 503 is recorded verbatim: divergence.
    const files = fs.readdirSync(OUT).filter((f) => /^s[1-6]-call\d+\.json$/.test(f)).sort();
    const hist = {}; let total = 0; let c503 = 0; const files_with_503 = [];
    for (const f of files) {
      const rec = JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8"));
      const st = rec.mcp_status;
      total += 1;
      hist[st] = (hist[st] || 0) + 1;
      if (st === 503) { c503 += 1; files_with_503.push(f); }
    }
    const out = {
      utc_ts: utc(), session: 8, role: "live (passive)",
      calls_total: total, mcp_status_histogram: hist, count_503: c503, files_with_503,
      expected: "not observed (vendor-issued expectation, comment 7144596133)",
      note: "sessions 1-6 only: session 7 fires no gate_check by design; every check of the run is counted exactly once (no retries by construction)",
    };
    fs.writeFileSync(path.join(OUT, "s8-503-survey.json"), JSON.stringify(out, null, 2) + "\n");
    console.log(`s8: calls=${total} statuses=${JSON.stringify(hist)} 503=${c503} -> ${c503 === 0 ? "not observed (MATCH)" : "503 OBSERVED (DIVERGENCE, recorded verbatim)"}`);
  } else if (mode === "s9") {
    // Offline receipt-v2 conformance over the captured run (NO network).
    // Vendor-issued expectation (comment 7144596133) + frozen definition
    // snapshot (recon/def-gate.receipt.v2.snap):
    //   - every run-window receipt carries body.schema == "afg-gate-receipt/2"
    //     and body.policy == {name, sha256}; the 16-character policy.hash is
    //     absent from the receipt (the answer may carry it beside
    //     policy.sha256 — recorded as corroboration);
    //   - recompute per the definition: policy.sha256 = sha256 of the UTF-8
    //     bytes of the policy body in canonical form (keys sorted at every
    //     level, no spaces), the body being the policy as evaluated minus the
    //     top-level keys _comment, name, note, description, taken from the
    //     answer's policy body; a mismatch is recorded honestly, never
    //     normalized;
    //   - receipt signature verification (Ed25519, keys saved by l1) is
    //     corroboration-only and never affects the verdict.
    const files = fs.readdirSync(OUT).filter((f) => /^s[1-6]-call\d+\.json$/.test(f)).sort();
    const results = []; let receipts = 0; let v2ok = 0; const divergences = [];
    const DEF_EXCLUDED = ["_comment", "name", "note", "description"];
    const defRuleHash = (body) => {
      const trimmed = {};
      for (const [k, v] of Object.entries(body)) if (!DEF_EXCLUDED.includes(k)) trimmed[k] = v;
      return crypto.createHash("sha256").update(canon(trimmed), "utf8").digest("hex");
    };
    // candidate policy bodies in an answer: any object that carries .body
    // (object) and is itself named (name) or hash-bearing (sha256)
    const collectPolicyBodies = (node, pathStr, acc) => {
      if (!node || typeof node !== "object") return;
      if (node.body && typeof node.body === "object" && !Array.isArray(node.body)
        && (typeof node.name === "string" || typeof node.sha256 === "string")) {
        acc.push({ path: pathStr, body: node.body, self_sha256: typeof node.sha256 === "string" ? node.sha256 : null, self_name: typeof node.name === "string" ? node.name : null });
      }
      for (const [k, v] of Object.entries(node)) collectPolicyBodies(v, pathStr + "." + k, acc);
    };
    // keys for signature corroboration (saved by l1; corroboration-only)
    let pubKeys = [];
    const keysPath = path.join(OUT, "afg-pass-keys.json");
    if (fs.existsSync(keysPath)) {
      try {
        const kf = JSON.parse(fs.readFileSync(keysPath, "utf8"));
        const arr = Array.isArray(kf) ? kf : (kf.keys || [kf]);
        const edFromHex = (hex) => crypto.createPublicKey({
          key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(hex, "hex")]),
          format: "der", type: "spki",
        });
        pubKeys = arr.filter((k) => k && (k.public_jwk || k.jwk || (k.public_key_hex && k.alg === "Ed25519")))
          .map((k) => k.public_jwk || k.jwk || edFromHex(k.public_key_hex));
      } catch { pubKeys = []; }
    }
    const sigCorroborate = (receiptObj) => {
      if (!pubKeys.length) return "keys_file_unavailable (corroboration skipped)";
      const sigRaw = receiptObj && receiptObj.signature;
      const sigB64 = typeof sigRaw === "string" ? sigRaw : (sigRaw && sigRaw.signature);
      if (!sigB64) return "signature_field_absent_in_receipt_layout (corroboration skipped)";
      const stripped = { ...receiptObj }; delete stripped.signature;
      const canonBuf = Buffer.from(canon(stripped), "utf8");
      const digestBuf = crypto.createHash("sha256").update(canonBuf).digest();
      const sigBuf = Buffer.from(sigB64, "base64");
      for (const jwk of pubKeys) {
        try {
          const pub = crypto.createPublicKey({ key: jwk, format: "jwk" });
          if (crypto.verify(null, canonBuf, pub, sigBuf)) return "signature_verified (over canonical bytes)";
          if (crypto.verify(null, digestBuf, pub, sigBuf)) return "signature_verified (over sha256 digest of canonical bytes)";
        } catch { /* key/sig shape mismatch — recorded, never fatal */ }
      }
      return "signature_not_verified (layout per def page: RFC 8785 JCS, sha256, Ed25519; raw receipt recorded verbatim in evidence)";
    };
    for (const f of files) {
      const rec = JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8"));
      const raw = rec.full_response_verbatim;
      if (!raw) continue;
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) {
        divergences.push({ file: f, kind: "response_not_json", detail: String(e && e.message || e) });
        results.push({ file: f, receipts: 0, parse_error: true });
        continue;
      }
      const hit = []; walkReceipts(parsed, hit, "$");
      const pbs = []; collectPolicyBodies(parsed, "$", pbs);
      const legacy16 = (raw.match(/"hash"\s*:\s*"[0-9a-f]{16}"/g) || []).length;
      for (const h of hit) {
        receipts += 1;
        const b = h.body;
        const checks = {
          schema_is_v2: b.schema === "afg-gate-receipt/2",
          policy_shape: !!b.policy && typeof b.policy === "object" && !Array.isArray(b.policy)
            && Object.keys(b.policy).sort().join(",") === "name,sha256",
          sha256_hex64: !!b.policy && typeof b.policy.sha256 === "string" && HEX64.test(b.policy.sha256),
          legacy_hash_absent: !("hash" in (b.policy || {})),
        };
        // recompute per the frozen definition rule over each candidate policy
        // body found in the same answer; matches recorded, never normalized
        const recomputes = pbs.map((pb) => ({
          path: pb.path, policy_name: pb.self_name,
          def_rule_hash: defRuleHash(pb.body),
          matches_receipt_sha256: pb.body && checks.sha256_hex64 ? defRuleHash(pb.body) === b.policy.sha256 : null,
          matches_answer_self_sha256: pb.self_sha256 && checks.sha256_hex64 ? b.policy.sha256 === pb.self_sha256 : null,
        }));
        checks.recompute_verdict = recomputes.some((r) => r.matches_receipt_sha256 || r.matches_answer_self_sha256)
          ? "recomputed" : (recomputes.length ? "recompute_mismatch_recorded" : "no_policy_body_found_in_answer (recorded as-is)");
        const ok = checks.schema_is_v2 && checks.policy_shape && checks.sha256_hex64 && checks.legacy_hash_absent;
        if (ok) v2ok += 1; else divergences.push({ file: f, path: h.path, checks });
        results.push({
          file: f, path: h.path, schema: b.schema,
          policy_name: b.policy && b.policy.name, policy_sha256: b.policy && b.policy.sha256,
          checks, recompute_candidates: recomputes,
          signature_corroboration: sigCorroborate(parsed.receipt || (parsed.result && parsed.result.receipt) || b),
          answer_carries_legacy16_occurrences: legacy16,
        });
      }
      if (hit.length === 0) results.push({ file: f, receipts: 0, note: "no afg-gate-receipt/* object found in response — recorded as-is" });
    }
    const out = {
      utc_ts: utc(), session: 9, role: "offline control",
      responses_scanned: files.length, receipts_found: receipts, receipts_v2_conformant: v2ok,
      divergences, results,
      expected: 'every run-window receipt: body.schema == "afg-gate-receipt/2", body.policy == {name, sha256} (64-hex), 16-char policy.hash absent from the receipt; policy.sha256 equals the sha256 of the canonical policy body from the answer (keys sorted at every level, no spaces, minus top-level _comment/name/note/description) per the frozen definition snapshot',
      note: "a recompute_mismatch is recorded honestly (spec-conformance question for the vendor), never silently normalized; a v1 receipt in this run window is a divergence; signature verification is corroboration-only and never affects the verdict",
    };
    fs.writeFileSync(path.join(OUT, "s9-receipt-v2-verify.json"), JSON.stringify(out, null, 2) + "\n");
    console.log(`s9: receipts=${receipts} v2-conformant=${v2ok} divergences=${divergences.length}`);
  } else if (mode === "l1") {
    // Evidence-only L1: one GET /openapi.json and one GET
    // /.well-known/afg-pass-keys.json at run start (the keys file enables
    // offline signature corroboration in s9). One-time snapshot fingerprints;
    // the vendor issued 0.22.7 (comment 7144596133). Never affect the verdict.
    // NO RETRIES.
    const grab = async (url, saveAs) => {
      const res = await fetch(url);
      const text = await res.text();
      let meta = null;
      try { meta = JSON.parse(text); } catch {}
      fs.writeFileSync(path.join(OUT, saveAs), text);
      return { url, http_status: res.status, sha256_response: crypto.createHash("sha256").update(text).digest("hex"), saved: saveAs, parsed_meta: meta ? (meta.info?.version ?? meta.id ?? null) : null };
    };
    const openapi = await grab(OPENAPI_URL, "openapi-runstart.json");
    const keys = await grab("https://agenticfinancegraph.com/.well-known/afg-pass-keys.json", "afg-pass-keys.json");
    const rec = {
      utc_ts: utc(), role: "evidence-only L1", snapshots: [openapi, keys],
      note: "one-time snapshot fingerprints, not a reproducibility claim; if the openapi version moved above 0.22.7 mid-queue it is recorded and does not affect the verdict (receipts remain v2 per the vendor: v2 since 2026-11-24T10:10:11Z)",
    };
    fs.writeFileSync(path.join(OUT, "l1-openapi.json"), JSON.stringify(rec, null, 2) + "\n");
    console.log(`l1: openapi ${openapi.http_status} version=${openapi.parsed_meta}; keys ${keys.http_status}`);
  } else { console.error(`unknown mode ${mode}`); process.exit(2); }
};
main().catch((e) => { console.error("FATAL (recorded, not retried):", e); process.exit(1); });
