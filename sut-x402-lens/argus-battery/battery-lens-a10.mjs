#!/usr/bin/env node
/**
 * Battery: x402-lens — full lab battery against a SERVER-side SUT
 * (candidate: Rozenberg888/x402-lens @ 1a99549, packages 0.2.0).
 *
 * TOPOLOGY INVERSION (documented): for gist/boundra the SUT was a client-side
 * signer and the lab's S-BS-06 stand played the merchant. Here the merchant IS
 * the SUT — `paymentLens` middleware from the built @x402-lens/express dist —
 * so the stand is REPLACED by the SUT and the lab controls both counterparts:
 *   - the facilitator: LAB-owned mock (adapters/mock_facilitator.mjs), NOT the
 *     SUT's own helper — fault injection point (verify/settle/supported);
 *   - the buyer: LAB client (client_lens.mjs, sealed client_v5 perimeter
 *     lineage, plain honest buyer, instrumented signer, JSONL ledger).
 *
 * Layer 1 (separate run): the SUT's own suite verbatim (`npm test`, no
 * network) — 22 files / 352 tests, results embedded in the fixture.
 * Layer 2 (THIS battery): 20 sealed sessions + 1 unsealed harness preflight,
 * each verdicted against the pre-registered expectation; observations that
 * match the candidate's documented behavior carry verdict DOCUMENTED with the
 * doc-registry ID (sut-x402-lens/doc-registry.md) — a documented behavior is
 * NOT a bug by tasking; a documented guarantee that does NOT hold is a defect.
 *
 * Harness (constant): fresh facilitator + fresh SUT process + fresh client
 * process per session (R2-equivalent: no state crosses sessions); JSONL event
 * ledgers on all three sides; settlement mocked; per-session throwaway
 * unfunded keys; signatures NOT logged (replay capture stays in process
 * memory); no real funds, wallets or external network.
 *
 * Env: XC_ONLY (session id filter), SKIP_PREFLIGHT=1
 */
import { spawn, execSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUT_ROOT = path.resolve(__dirname, "..");
const LAB_ROOT = path.resolve(SUT_ROOT, "..");
const UPSTREAM = "/home/z/my-project/work/x402-lens-upstream";
const OUT_DIR = "/tmp/argus-lens-a10";
const FIXTURE_OUT = path.join(__dirname, "x402-lens-a10.fixture.json");
const FACILITATOR = path.join(__dirname, "adapters/mock_facilitator.mjs");
const SERVER = path.join(__dirname, "server_lens.mjs");
const CLIENT = path.join(__dirname, "client_lens.mjs");
const CONFIG_PROBE = path.join(__dirname, "config_probe.mjs");
const CLI = path.join(SUT_ROOT, "packages/cli/dist/index.js");
const DOC_REGISTRY = path.join(SUT_ROOT, "doc-registry.md");
const LAYER1_LOG = path.join(OUT_DIR, "layer1-npm-test.log");

const EVM_NET = "eip155:84532";
const SOL_NET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
const EVM_ADDR = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
const SOL_ADDR = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const PAYER = "0x857b06519E91e3A54538791bDAbd0E22373e36b66";
const TX_OK = `0x${"11".repeat(32)}`;
const BEARER_TOKEN = "argus-lens-bearer-token";

/* ----------------------------- session matrix ---------------------------- */

const CLIENT_SESSIONS = [
  {
    id: "l_gate_valid", matrix: "canonical gate", doc_refs: ["D-14"],
    expect: "canonical gate (honest counterparties): 402 -> pay -> verify -> settle -> deliver; 200 + PAYMENT-RESPONSE receipt success:true; events required->verified->settled with buyer/txHash/route; facilitator called once per endpoint",
    facilitator: {},
    server: {},
    client: {},
    match: (f) => f.slot_http.join(",") === "200"
      && f.receipts.every(r => r?.success === true && /^0x[0-9a-f]+$/i.test(r.transaction ?? ""))
      && f.signer_call_count === 1
      && (f.handler_counts["/weather"] ?? 0) === 1
      && seqIncludes(f.server_event_types, ["payment.required", "payment.verified", "payment.settled"])
      && f.facilitator_counts.verify === 1
      && f.facilitator_counts.settle === 1,
  },
  {
    id: "l_verify_reject", matrix: "verify rejects (money-fault: invalid payment)", doc_refs: ["D-14"],
    expect: "facilitator verify isValid:false invalidReason invalid_exact_evm_payload_signature -> no delivery (handler untouched), 402-class slot outcome, payment.failed carries the raw reason code and a signature_mismatch finding",
    facilitator: { FAC_VERIFY_RESULT: JSON.stringify({ isValid: false, invalidReason: "invalid_exact_evm_payload_signature", payer: PAYER }) },
    server: {},
    client: {},
    match: (f) => !f.slot_http.includes(200)
      && (f.handler_counts["/weather"] ?? 0) === 0
      && f.server_events.some(e => e.type === "payment.failed" && e.reason === "invalid_exact_evm_payload_signature")
      && f.server_events.some(e => e.type === "payment.failed" && JSON.stringify(e.findings ?? []).includes("signature_mismatch")),
  },
  {
    id: "l_undecodable_payload", matrix: "garbage payment header", doc_refs: ["D-12"],
    expect: "PAYMENT-SIGNATURE that is not base64 -> 402, handler untouched, no crash: the server still serves a fresh challenge and /health afterwards",
    kind: "probe",
    facilitator: {},
    server: {},
    probe: async (ctx) => {
      const garbage = await ctx.fetch("/weather", { headers: { "PAYMENT-SIGNATURE": "not-base64!!!" } });
      const challenge = await ctx.fetch("/weather");
      const health = await ctx.fetch("/health");
      return {
        garbage_status: garbage.status,
        challenge_status: challenge.status,
        challenge_header_present: challenge.headers.get("payment-required") !== null,
        health_status: health.status,
      };
    },
    match: (f) => f.battery_obs.garbage_status === 402
      && f.battery_obs.challenge_status === 402
      && f.battery_obs.challenge_header_present === true
      && f.battery_obs.health_status === 200
      && (f.handler_counts["/weather"] ?? 0) === 0
      && f.server_alive_after === true,
  },
  {
    id: "l_settle_fail_auth", matrix: "money-fault: settle fails, authorization flow (default)", doc_refs: ["D-05"],
    expect: "DOCUMENTED trade-off (D-05): handler HAS run (compute spent) and the response carries no paid body; lens guarantee under test = payment.settle_failed event with the facilitator reason. Flow outcome DOCUMENTED if the event fires; missing event = defect",
    facilitator: { FAC_SETTLE_RESULT: JSON.stringify({ success: false, errorReason: "insufficient_funds", transaction: "", network: EVM_NET, payer: PAYER }) },
    server: {},
    client: {},
    match: (f) => {
      const eventOk = f.server_events.some(e => e.type === "payment.settle_failed" && String(e.reason ?? "").includes("insufficient_funds"));
      const flowOk = (f.handler_counts["/weather"] ?? 0) === 1;
      if (eventOk && flowOk && !f.slot_http.includes(200)) return "DOCUMENTED";
      if (eventOk && f.slot_http.includes(200)) return "FAIL"; // delivered AND settle-failed event: money-fault delivered goods
      return "FAIL";
    },
  },
  {
    id: "l_settle_fail_upfront", matrix: "money-fault: settle fails, upfront flow", doc_refs: ["D-06"],
    expect: "documented guarantee (D-06): with upfront and a failing settle the handler is NEVER called; 402 to the buyer; payment.settle_failed event present",
    facilitator: { FAC_SETTLE_RESULT: JSON.stringify({ success: false, errorReason: "insufficient_funds", transaction: "", network: EVM_NET, payer: PAYER }) },
    server: { LENS_ROUTES: JSON.stringify([{ route: "GET /generate", price: "$0.05", paymentFlow: "upfront" }]) },
    client: { ENDPOINT_PATH: "/generate" },
    match: (f) => f.slot_http.join(",") === "402"
      && (f.handler_counts["/generate"] ?? 0) === 0
      && f.server_events.some(e => e.type === "payment.settle_failed" && String(e.reason ?? "").includes("insufficient_funds")),
  },
  {
    id: "l_facilitator_500", matrix: "chaos: verify -> HTTP 500", doc_refs: ["D-12"],
    expect: "chaos contract: facilitator.error event, no delivery (handler untouched), 402-class slot outcome, process survives (fresh challenge + /health after the fault)",
    facilitator: { FAC_VERIFY_STATUS: 500 },
    server: {},
    client: {},
    match: (f) => !f.slot_http.includes(200)
      && (f.handler_counts["/weather"] ?? 0) === 0
      && f.server_events.some(e => e.type === "facilitator.error")
      && f.server_alive_after === true,
  },
  {
    id: "l_facilitator_timeout", matrix: "chaos: verify hangs beyond facilitator timeout", doc_refs: ["D-12"],
    expect: "chaos contract with X402_FACILITATOR_TIMEOUT_MS=1000 vs 3000ms hang: facilitator.error event, no delivery, process survives",
    facilitator: { FAC_VERIFY_DELAY_MS: 3000 },
    server: { LENS_FACILITATOR_TIMEOUT_MS: 1000 },
    client: {},
    match: (f) => !f.slot_http.includes(200)
      && (f.handler_counts["/weather"] ?? 0) === 0
      && f.server_events.some(e => e.type === "facilitator.error")
      && f.server_alive_after === true,
  },
  {
    id: "l_unknown_code", matrix: "unknown facilitator code", doc_refs: ["D-13"],
    expect: "documented contract (D-13): an unrecognised invalidReason is never swallowed — payment.failed carries the raw code and the findings name it",
    facilitator: { FAC_VERIFY_RESULT: JSON.stringify({ isValid: false, invalidReason: "facilitator_zeta_unknown_code", payer: PAYER }) },
    server: {},
    client: {},
    match: (f) => {
      const failed = f.server_events.find(e => e.type === "payment.failed");
      return !f.slot_http.includes(200)
        && (f.handler_counts["/weather"] ?? 0) === 0
        && !!failed
        && failed.reason === "facilitator_zeta_unknown_code"
        && JSON.stringify(failed.findings ?? []).includes("facilitator_zeta_unknown_code");
    },
  },
  {
    id: "l_settle_pending", matrix: "settlement_pending (non-terminal)", doc_refs: ["D-15"],
    expect: "documented contract (D-15): settlement_pending is non-terminal — payment.settle_failed carries the facilitator reason, no delivery is claimed, no auto-retry exists; the settlement_pending FINDING renders via explain/CLI, while the runtime event's findings depend on the SDK settle-error packaging (recorded as an observability nuance if empty)",
    facilitator: { FAC_SETTLE_RESULT: JSON.stringify({ success: false, errorReason: "settlement_pending", transaction: "", network: EVM_NET, payer: PAYER }) },
    server: {},
    client: {},
    match: (f) => {
      const event = f.server_events.find(e => e.type === "payment.settle_failed");
      const core = !f.slot_http.includes(200)
        && !!event
        && String(event.reason ?? "") === "settlement_pending";
      if (!core) return "FAIL";
      if (JSON.stringify(event.findings ?? []).includes("settlement_pending")) return "PASS";
      return "DOCUMENTED"; // reason + non-terminal semantics hold; findings rendering is CLI-side (see findings_note)
    },
  },
  {
    id: "l_race_two_buyers", matrix: "server-side race: two independent buyers, one route (negative control)", doc_refs: ["D-01"],
    expect: "two SEPARATE buyer processes with distinct throwaway keys pay the same route concurrently: both deliver independently (server-side owner fencing does not exist and must not be invented); 2 verifies, 2 settles, no cross-talk",
    clients: 2,
    facilitator: {},
    server: {},
    client: {},
    match: (f) => f.slot_http.join(",") === "200,200"
      && f.receipts.length === 2
      && f.receipts.every(r => r?.success === true)
      && f.signer_call_count === 2
      && f.handler_counts["/weather"] === 2
      && f.facilitator_counts.verify === 2
      && f.facilitator_counts.settle === 2
      && f.slot_errors.length === 0,
  },
  {
    id: "l_replay_same_payload", matrix: "replay: identical PAYMENT-SIGNATURE resubmitted", doc_refs: ["D-01", "D-14"],
    expect: "server-side double-delivery vector: slot 1 pays (captures its header in memory), slot 2 resends the IDENTICAL header via raw fetch; the honest facilitator rejects the duplicate nonce; expected: exactly ONE delivery, slot2 402-class, payment.failed with duplicate_payment_nonce, zero new signer calls for slot 2",
    facilitator: { FAC_HONEST_NONCES: "1" },
    server: {},
    client: { CLIENT_REPLAY: "1" },
    match: (f) => f.slot_http.join(",") === "200,402"
      && f.signer_call_count === 1
      && (f.handler_counts["/weather"] ?? 0) === 1
      && f.server_events.some(e => e.type === "payment.failed" && e.reason === "duplicate_payment_nonce"),
  },
  {
    id: "l_grant_paths", matrix: "grant bypass: allow / deny / absent (negative control)", doc_refs: ["D-07"],
    expect: "documented bypass (D-07): allow -> 200 UNPAID with access.granted (signer untouched); deny -> 403 with access.denied carrying the reason; absent callback path (plain request) -> normal paid flow. Silent bypass (delivery without the event) would be a defect",
    runs: "grant3",
    facilitator: {},
    server: { LENS_GRANT_MODE: "demo" },
    client: {},
    match: (f) => {
      const [allow, deny, normal] = f.client_summaries;
      const allowOk = allow?.per_slot?.[0]?.http === 200 && f.signer_counts_by_run[0] === 0;
      const denyOk = deny?.per_slot?.[0]?.http === 403;
      const normalOk = normal?.per_slot?.[0]?.http === 200 && f.signer_counts_by_run[2] === 1;
      return allowOk && denyOk && normalOk
        && f.server_events.filter(e => e.type === "access.granted").length === 1
        && f.server_events.some(e => e.type === "access.denied" && String(e.reason ?? "").includes("denied by lab grant probe"))
        && f.handler_counts["/weather"] === 2;
    },
  },
  {
    id: "l_sink_throws", matrix: "chaos: a sink throws on every event", doc_refs: ["D-11"],
    expect: "documented guarantee (D-11): a failing sink never breaks a payment — happy-path payment completes 200 with receipt, and the sibling jsonl sink still records the full event stream",
    facilitator: {},
    server: { LENS_SINK_THROW: "1" },
    client: {},
    match: (f) => f.slot_http.join(",") === "200"
      && f.receipts[0]?.success === true
      && (f.handler_counts["/weather"] ?? 0) === 1
      && f.server_event_types.includes("payment.settled"),
  },
  {
    id: "l_multinetwork", matrix: "multi-network challenge: eip155 + solana", doc_refs: ["D-16"],
    expect: "documented (D-16): one accepts[] entry per network with per-network payTo (map form is the only accepted shape for EVM+Solana); EVM buyer pays the EVM entry; amounts atomic on both entries",
    facilitator: { FAC_NETWORKS: `${EVM_NET},${SOL_NET}` },
    server: { LENS_NETWORKS: `${EVM_NET},${SOL_NET}`, LENS_PAY_TO_MAP: JSON.stringify({ [EVM_NET]: EVM_ADDR, [SOL_NET]: SOL_ADDR }) },
    client: {},
    probe: async (ctx) => {
      const res = await ctx.fetch("/weather");
      const header = res.headers.get("payment-required");
      if (!header) return { challenge_status: res.status, decoded: null };
      const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
      return {
        challenge_status: res.status,
        accepts_count: decoded.accepts?.length ?? 0,
        second_accept: decoded.accepts?.[1]
          ? { network: decoded.accepts[1].network ?? null, payTo: decoded.accepts[1].payTo ?? null, amount_atomic: /^\d+$/.test(String(decoded.accepts[1].amount ?? "")) }
          : null,
        first_accept_payto: decoded.accepts?.[0]?.payTo ?? null,
      };
    },
    match: (f) => f.battery_obs.accepts_count === 2
      && f.battery_obs.first_accept_payto === EVM_ADDR
      && f.battery_obs.second_accept?.network === SOL_NET
      && f.battery_obs.second_accept?.payTo === SOL_ADDR
      && f.battery_obs.second_accept?.amount_atomic === true
      && f.quote_accepts_count === 2
      && f.slot_http.join(",") === "200",
  },
  {
    id: "l_facilitator_bearer", matrix: "facilitator auth: Bearer token forwarding", doc_refs: ["D-17"],
    expect: "documented (D-17): X402_FACILITATOR_TOKEN rides as Authorization: Bearer on supported+verify+settle; the token-requiring facilitator accepts the flow end-to-end (payment completes)",
    facilitator: { FAC_REQUIRE_BEARER: BEARER_TOKEN },
    server: { LENS_FACILITATOR_TOKEN: BEARER_TOKEN },
    client: {},
    match: (f) => f.slot_http.join(",") === "200"
      && f.receipts[0]?.success === true
      && f.facilitator_counts.auth_rejected === 0
      && f.facilitator_counts.verify === 1
      && f.facilitator_counts.settle === 1
      && f.facilitator_calls.filter(c => c.path === "supported").every(c => c.auth_present === true)
      && f.facilitator_calls.filter(c => c.path === "verify").every(c => c.auth_present === true)
      && f.facilitator_calls.filter(c => c.path === "settle").every(c => c.auth_present === true),
  },
  {
    id: "l_facilitator_flat_headers", matrix: "facilitator auth: flat headers object (documented per-path shape)", doc_refs: ["D-17"],
    expect: "documented (D-17): the SDK requires the per-path facilitatorHeaders shape and rejects a flat object — fails closed: no delivery, no facilitator verify/settle contact, process survives. Observed manifestation recorded verbatim (the rejection surfaces at request time)",
    facilitator: { FAC_REQUIRE_BEARER: BEARER_TOKEN },
    server: { LENS_FACILITATOR_TOKEN: BEARER_TOKEN, LENS_FACILITATOR_HEADERS_FLAT: "1" },
    client: {},
    match: (f) => {
      const core = !f.slot_http.includes(200)
        && (f.handler_counts["/weather"] ?? 0) === 0
        && f.facilitator_counts.verify === 0
        && f.facilitator_counts.settle === 0
        && f.server_alive_after === true;
      if (!core) return "FAIL";
      return "DOCUMENTED"; // the rejection itself is documented; the manifestation (HTTP 500 on first request, no event) is recorded in findings_note
    },
  },
];

const PROBE_SESSIONS = [
  {
    id: "l_gate_unpaid", matrix: "canonical gate: unpaid challenge", doc_refs: ["D-09", "D-10"],
    expect: "unpaid GET /weather -> 402; PAYMENT-REQUIRED header with v2 fields (x402Version 2, accepts[0] exact on eip155:84532, atomic amount, payTo, 40-hex asset); challenge mirrored into the body (D-09); payment.required event emitted; handler untouched; unprotected /health passes with no payment header",
    kind: "probe",
    facilitator: {},
    server: {},
    probe: async (ctx) => {
      const unpaid = await ctx.fetch("/weather");
      const header = unpaid.headers.get("payment-required");
      const bodyText = await unpaid.text();
      let body = null;
      try { body = JSON.parse(bodyText); } catch { body = { unparsable: true }; }
      const decoded = header ? JSON.parse(Buffer.from(header, "base64").toString("utf-8")) : null;
      const accept = decoded?.accepts?.[0] ?? null;
      const health = await ctx.fetch("/health");
      return {
        unpaid_status: unpaid.status,
        header_present: header !== null,
        x402_version: decoded?.x402Version ?? null,
        accept_scheme: accept?.scheme ?? null,
        accept_network: accept?.network ?? null,
        accept_amount_atomic: accept ? /^\d+$/.test(String(accept.amount ?? "")) : false,
        accept_payto: accept?.payTo ?? null,
        accept_asset_40hex: accept ? /^0x[0-9a-fA-F]{40}$/.test(String(accept.asset ?? "")) : false,
        body_has_x402_version: body?.x402Version === 2,
        body_has_accepts: Array.isArray(body?.accepts) && body.accepts.length > 0,
        health_status: health.status,
        health_payment_header: health.headers.get("payment-required") !== null,
      };
    },
    match: (f) => f.battery_obs.unpaid_status === 402
      && f.battery_obs.header_present
      && f.battery_obs.x402_version === 2
      && f.battery_obs.accept_scheme === "exact"
      && f.battery_obs.accept_network === EVM_NET
      && f.battery_obs.accept_amount_atomic
      && f.battery_obs.accept_payto === EVM_ADDR
      && f.battery_obs.accept_asset_40hex
      && f.battery_obs.body_has_x402_version
      && f.battery_obs.body_has_accepts
      && f.battery_obs.health_status === 200
      && f.battery_obs.health_payment_header === false
      && (f.handler_counts["/weather"] ?? 0) === 0
      && f.server_event_types.includes("payment.required"),
  },
  {
    id: "l_wire_readonly", matrix: "observer read-only: wire form untouched", doc_refs: ["D-10"],
    expect: "documented (D-10): the observer only reads — the challenge header stays canonical (no lens-specific keys anywhere), the mirrored body equals the decoded header, accepts[0] carries only standard fields",
    kind: "probe",
    facilitator: {},
    server: {},
    probe: async (ctx) => {
      const res = await ctx.fetch("/weather");
      const header = res.headers.get("payment-required");
      if (!header) return { header_present: false };
      const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
      const body = JSON.parse(await res.text());
      const headerStr = JSON.stringify(decoded);
      const ACCEPT_KEYS = new Set(["scheme", "network", "amount", "asset", "payTo", "maxTimeoutSeconds", "extra"]);
      const acceptKeysOk = (decoded.accepts ?? []).every(a => Object.keys(a).every(k => ACCEPT_KEYS.has(k)));
      const noLensKeys = !/lens/i.test(headerStr) && !/lens/i.test(JSON.stringify(body));
      const topKeys = Object.keys(decoded);
      return {
        header_present: true,
        mirror_equal: stableStringify(decoded) === stableStringify(body),
        no_lens_keys: noLensKeys,
        accept_keys_standard: acceptKeysOk,
        top_level_keys: topKeys.sort(),
        x402_version: decoded.x402Version ?? null,
      };
    },
    match: (f) => f.battery_obs.header_present === true
      && f.battery_obs.mirror_equal === true
      && f.battery_obs.no_lens_keys === true
      && f.battery_obs.accept_keys_standard === true
      && f.battery_obs.x402_version === 2,
  },
  {
    id: "l_cors_browser", matrix: "browser buyers: cors off (default) / on / merge with app CORS", doc_refs: ["D-08"],
    expect: "documented (D-08): default exposes NO payment headers (an app with its own CORS layer owns this — DOCUMENTED, not a bug); cors:true exposes PAYMENT-REQUIRED/PAYMENT-RESPONSE and allows PAYMENT-SIGNATURE+Content-Type; with a pre-existing app CORS header the lens MERGES (X-Custom-Header kept)",
    kind: "probe",
    facilitator: {},
    server_variants: [
      { tag: "default", env: {} },
      { tag: "cors_on", env: { LENS_CORS: "on" } },
      { tag: "cors_merge", env: { LENS_CORS: "on", LENS_APP_CORS: "1" } },
    ],
    probe: async (ctx) => {
      const res = await ctx.fetch("/weather");
      return {
        status: res.status,
        expose: res.headers.get("access-control-expose-headers"),
        allow_headers: res.headers.get("access-control-allow-headers"),
        allow_origin: res.headers.get("access-control-allow-origin"),
      };
    },
    match: (f) => {
      const [def, on, merge] = f.battery_obs;
      return def.expose === null
        && on.expose?.includes("PAYMENT-REQUIRED") && on.expose?.includes("PAYMENT-RESPONSE")
        && on.allow_headers?.includes("PAYMENT-SIGNATURE") && on.allow_headers?.includes("Content-Type")
        && merge.expose?.includes("X-Custom-Header") && merge.expose?.includes("PAYMENT-REQUIRED");
    },
  },
];

const CONFIG_SESSION = {
  id: "l_config_refusals", kind: "config", matrix: "config surface: documented refusals + one valid control", doc_refs: ["D-02", "D-03", "D-04", "D-16", "D-18"],
  expect: "documented refusal surface: missing_config/v1_shorthand/upto_flow/exact_flow/mixed_payto_string/flat_headers/unknown_namespace all refused with the documented specifics; multi_network_ok resolves (control). A missing refusal where one is documented would be the anomaly",
  scenarios: [
    { scenario: "missing_config", expectThrew: true, messageIncludes: null },
    { scenario: "v1_shorthand", expectThrew: true, messageIncludes: "eip155:84532" },
    { scenario: "upto_flow", expectThrew: true, messageIncludes: "GET /generate" },
    { scenario: "exact_flow", expectThrew: true, messageIncludes: null },
    { scenario: "mixed_payto_string", expectThrew: true, messageIncludes: null },
    { scenario: "unknown_namespace", expectThrew: true, messageIncludes: "cosmos" },
    { scenario: "multi_network_ok", expectThrew: false, messageIncludes: null },
  ],
};

const CLI_SESSION = {
  id: "l_cli_inspect_doctor", kind: "cli", matrix: "shipped CLI against the live SUT", doc_refs: ["D-08", "D-20"],
  expect: "documented (D-20/D-08): inspect --json against the live SUT — default server (cors off) reports the browser-readiness issue and exits 1 (the documented CORS report, conformance empty); cors-on server exits 0; doctor --json against the lab facilitator exits 0 (network listed for v2)",
  variants: [
    { tag: "default", env: {} },
    { tag: "cors_on", env: { LENS_CORS: "on" } },
  ],
};

const PREFLIGHT = {
  id: "h_preflight", preflight: true, matrix: "UNSEALED harness dry-run", doc_refs: [],
  expect: "harness sanity: facilitator healthy, SUT up, honest buyer completes one paid flow, all ledgers populated",
  facilitator: {}, server: {}, client: {},
  match: (f) => f.slot_http.join(",") === "200"
    && f.receipts[0]?.success === true
    && f.signer_call_count === 1
    && f.server_event_types.includes("payment.settled"),
};

const SESSIONS = [PREFLIGHT, ...CLIENT_SESSIONS, ...PROBE_SESSIONS, CONFIG_SESSION, CLI_SESSION];

/* ------------------------------- plumbing -------------------------------- */

const run = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    const p = spawn(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    p.stdout.on("data", d => (stdout += d));
    p.stderr.on("data", d => (stderr += d));
    p.on("close", code => resolve({ code, stdout, stderr }));
  });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitForHttp(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      return res;
    } catch { /* not up yet */ }
    await sleep(150);
  }
  throw new Error(`endpoint not reachable: ${url}`);
}

const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const body = Object.keys(value).sort()
      .map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",");
    return `{${body}}`;
  }
  return JSON.stringify(value);
};

function flattenKeys(value, acc = {}, path = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      acc[`${path}.${k}`] = true;
      flattenKeys(v, acc, `${path}.${k}`);
    }
  } else if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) flattenKeys(v, acc, `${path}.${i}`);
  }
  return acc;
}

function seqIncludes(sequence, expected) {
  let idx = 0;
  for (const item of sequence) {
    if (item === expected[idx]) idx += 1;
    if (idx === expected.length) return true;
  }
  return idx === expected.length;
}

function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf-8").trim().split("\n").filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return { unparsable: l.slice(0, 200) }; } });
}

const paths = (sess, tag = "") => ({
  client: path.join(OUT_DIR, `${sess.id}${tag}.client.jsonl`),
  events: path.join(OUT_DIR, `${sess.id}${tag}.events.jsonl`),
  handlers: path.join(OUT_DIR, `${sess.id}${tag}.handlers.jsonl`),
  facilitator: path.join(OUT_DIR, `${sess.id}${tag}.facilitator.jsonl`),
});

function startChild(cmd, args, env, tag) {
  const proc = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "", err = "";
  proc.stdout.on("data", d => (out += d));
  proc.stderr.on("data", d => (err += d));
  return { proc, tag, out: () => out, err: () => err };
}

async function stopChild(child, sig = "SIGTERM") {
  if (!child || child.proc.exitCode !== null || child.proc.signalCode) return;
  await new Promise((resolve) => {
    child.proc.once("close", resolve);
    try { child.proc.kill(sig); } catch { resolve(); }
    setTimeout(() => { try { child.proc.kill("SIGKILL"); } catch {} resolve(); }, 3000);
  });
}

const sumCount = (entries, key) => entries.filter(e => e.path === key).length;

function buildFacts({ clientRuns, clientEvents, serverEvents, handlerEntries, facilitatorEntries, batteryObs, serverAlive }) {
  const slotHttp = [];
  const receipts = [];
  const slotErrors = [];
  let signerTotal = 0;
  for (const summary of clientRuns) {
    for (const slot of summary?.per_slot ?? []) {
      if (slot.http !== undefined) slotHttp.push(slot.http);
      if (slot.receipt !== undefined && slot.receipt !== null) receipts.push(slot.receipt);
      if (slot.error) slotErrors.push({ slot: slot.slot, error: slot.error });
    }
    signerTotal += summary?.signer_call_count ?? 0;
  }
  const handlerCounts = {};
  for (const entry of handlerEntries) {
    const route = String(entry.route ?? "");
    const p = route.slice(route.indexOf(" ") + 1);
    handlerCounts[p] = (handlerCounts[p] ?? 0) + 1;
  }
  return {
    client_summaries: clientRuns,
    signer_counts_by_run: clientRuns.map(s => s?.signer_call_count ?? 0),
    slot_http: slotHttp,
    receipts,
    slot_errors: slotErrors,
    signer_call_count: signerTotal,
    quote_accepts_count: clientEvents.find(e => e.type === "quote_offered")?.accepts_count ?? null,
    client_events: clientEvents,
    server_events: serverEvents,
    server_event_types: serverEvents.map(e => e.type),
    handler_entries: handlerEntries,
    handler_counts: handlerCounts,
    facilitator_calls: facilitatorEntries,
    facilitator_counts: {
      supported: sumCount(facilitatorEntries, "supported"),
      verify: sumCount(facilitatorEntries, "verify"),
      settle: sumCount(facilitatorEntries, "settle"),
      auth_rejected: facilitatorEntries.filter(e => e.auth_rejected === true).length,
    },
    battery_obs: batteryObs ?? null,
    server_alive_after: serverAlive,
  };
}

const normalizeVerdict = (v) => (v === true ? "PASS" : v === false ? "FAIL" : v);

async function runSession(sess, facPort, sutPort) {
  for (const f of Object.values(paths(sess))) { try { unlinkSync(f); } catch {} try { unlinkSync(`${f}.summary`); } catch {} }

  const facEnv = {
    FAC_PORT: String(facPort),
    FAC_LEDGER: paths(sess).facilitator,
    ...(sess.facilitator ?? {}),
  };
  const fac = startChild(process.execPath, [FACILITATOR], facEnv, "fac");
  try {
    await waitForHttp(`http://127.0.0.1:${facPort}/health`);
  } catch (e) {
    await stopChild(fac);
    return { session: sess.id, matrix: sess.matrix, preflight: !!sess.preflight, verdict: "HARNESS_ERROR", error: `facilitator failed to start: ${e.message}; stderr=${fac.err().slice(0, 300)}` };
  }

  const serverEnvBase = {
    LENS_PORT: String(sutPort),
    LENS_FACILITATOR_URL: `http://127.0.0.1:${facPort}`,
    LENS_NETWORKS: EVM_NET,
    LENS_PAY_TO: EVM_ADDR,
    LENS_ROUTES: JSON.stringify([{ route: "GET /weather", price: "$0.001" }]),
    LENS_EVENTS_FILE: paths(sess).events,
    LENS_HANDLER_LEDGER: paths(sess).handlers,
    ...(sess.server ?? {}),
  };

  try {
    if (sess.kind === "config") return await runConfigSession(sess);
    if (sess.kind === "probe" && sess.server_variants) return await runCorsSession(sess, fac, facPort);
    if (sess.kind === "probe") return await runProbeSession(sess, fac, facPort, sutPort, serverEnvBase);
    if (sess.id === CLI_SESSION.id) return await runCliSession(sess, fac, facPort, sutPort, serverEnvBase);
    return await runClientSession(sess, fac, facPort, sutPort, serverEnvBase);
  } catch (e) {
    return { session: sess.id, matrix: sess.matrix, preflight: !!sess.preflight, verdict: "HARNESS_ERROR", error: String(e?.message ?? e) };
  } finally {
    await stopChild(fac);
  }
}

async function runClientSession(sess, fac, facPort, sutPort, serverEnvBase) {
  const server = startChild(process.execPath, [SERVER], serverEnvBase, "sut");
  try {
    await waitForHttp(`http://127.0.0.1:${sutPort}/health`);
    const clientRuns = [];
    const nClients = sess.clients ?? 1;
    if (nClients === 2) {
      const env = (tag) => ({
        RESOURCE_SERVER_URL: `http://127.0.0.1:${sutPort}`,
        CLIENT_EVENT_LOG: paths(sess, `.${tag}`).client,
        EVM_PRIVATE_KEY: `0x${randomBytes(32).toString("hex")}`,
        ...(sess.client ?? {}),
      });
      const a = startChild(process.execPath, [CLIENT], env("a"), "clientA");
      const b = startChild(process.execPath, [CLIENT], env("b"), "clientB");
      await Promise.all([a.proc, b.proc].map(p => new Promise(res => p.once("close", res))));
      for (const child of [a, b]) {
        const line = child.out().split("\n").find(l => l.startsWith("PROBE_SUMMARY:"));
        clientRuns.push(line ? JSON.parse(line.slice("PROBE_SUMMARY: ".length)) : null);
      }
    } else if (!sess.runs) {
      const res = await run(process.execPath, [CLIENT], {
        cwd: __dirname,
        env: {
          RESOURCE_SERVER_URL: `http://127.0.0.1:${sutPort}`,
          CLIENT_EVENT_LOG: paths(sess).client,
          EVM_PRIVATE_KEY: `0x${randomBytes(32).toString("hex")}`,
          ...(sess.client ?? {}),
        },
      });
      if (res.code !== 0 && res.stderr && !res.stdout.includes("PROBE_SUMMARY")) {
        throw new Error(`client failed: rc=${res.code} stderr=${res.stderr.slice(0, 300)}`);
      }
      const line = res.stdout.split("\n").find(l => l.startsWith("PROBE_SUMMARY:"));
      clientRuns.push(line ? JSON.parse(line.slice("PROBE_SUMMARY: ".length)) : null);
    }

    // grant_paths: three sequential single-client runs against one server
    if (sess.runs === "grant3") {
      for (const grant of ["allow", "deny", ""]) {
        const res = await run(process.execPath, [CLIENT], {
          cwd: __dirname,
          env: {
            RESOURCE_SERVER_URL: `http://127.0.0.1:${sutPort}`,
            CLIENT_EVENT_LOG: paths(sess, `.grant-${grant || "none"}`).client,
            EVM_PRIVATE_KEY: `0x${randomBytes(32).toString("hex")}`,
            CLIENT_GRANT_HEADER: grant,
            ...(sess.client ?? {}),
          },
        });
        const line = res.stdout.split("\n").find(l => l.startsWith("PROBE_SUMMARY:"));
        clientRuns.push(line ? JSON.parse(line.slice("PROBE_SUMMARY: ".length)) : null);
      }
    }

    const health = await fetch(`http://127.0.0.1:${sutPort}/health`).then(r => r.status).catch(() => 0);
    const batteryObs = sess.probe ? await sess.probe({
      fetch: (p, init) => fetch(`http://127.0.0.1:${sutPort}${p}`, init),
    }) : null;
    const serverAlive = health === 200;

    await stopChild(server);
    const serverEvents = readJsonl(paths(sess).events);
    const handlerEntries = readJsonl(paths(sess).handlers);
    const facilitatorEntries = readJsonl(paths(sess).facilitator);
    const clientEvents = nClients === 2 || sess.runs === "grant3"
      ? (nClients === 2
        ? [...readJsonl(paths(sess, ".a").client), ...readJsonl(paths(sess, ".b").client)]
        : ["allow", "deny", ""].flatMap(g => readJsonl(paths(sess, `.grant-${g || "none"}`).client)))
      : readJsonl(paths(sess).client);

    const facts = buildFacts({ clientRuns, clientEvents, serverEvents, handlerEntries, facilitatorEntries, batteryObs, serverAlive });
    return {
      session: sess.id, matrix: sess.matrix, preflight: !!sess.preflight,
      doc_refs: sess.doc_refs ?? [], expectation: sess.expect,
      config: { facilitator: sess.facilitator ?? {}, server: sess.server ?? {}, client: sess.client ?? {}, clients: sess.clients ?? 1, runs: sess.runs ?? null },
      observed: facts,
      verdict: normalizeVerdict(sess.match(facts)),
      client_timeline: clientEvents,
    };
  } finally {
    await stopChild(server);
  }
}

async function runProbeSession(sess, fac, facPort, sutPort, serverEnvBase) {
  const server = startChild(process.execPath, [SERVER], serverEnvBase, "sut");
  try {
    await waitForHttp(`http://127.0.0.1:${sutPort}/health`);
    const ctx = { fetch: (p, init) => fetch(`http://127.0.0.1:${sutPort}${p}`, init) };
    const batteryObs = await sess.probe(ctx);
    const health = await fetch(`http://127.0.0.1:${sutPort}/health`).then(r => r.status).catch(() => 0);
    await stopChild(server);
    const facts = buildFacts({
      clientRuns: [], clientEvents: [],
      serverEvents: readJsonl(paths(sess).events),
      handlerEntries: readJsonl(paths(sess).handlers),
      facilitatorEntries: readJsonl(paths(sess).facilitator),
      batteryObs, serverAlive: health === 200,
    });
    return {
      session: sess.id, matrix: sess.matrix, preflight: false,
      doc_refs: sess.doc_refs ?? [], expectation: sess.expect,
      config: { facilitator: sess.facilitator ?? {}, server: sess.server ?? {} },
      observed: facts,
      verdict: normalizeVerdict(sess.match(facts)),
    };
  } finally {
    await stopChild(server);
  }
}

async function runCorsSession(sess, fac, facPort) {
  const batteryObs = [];
  for (const variant of sess.server_variants) {
    const tag = variant.tag;
    const server = startChild(process.execPath, [SERVER], {
      LENS_PORT: "5030",
      LENS_FACILITATOR_URL: `http://127.0.0.1:${facPort}`,
      LENS_NETWORKS: EVM_NET,
      LENS_PAY_TO: EVM_ADDR,
      LENS_ROUTES: JSON.stringify([{ route: "GET /weather", price: "$0.001" }]),
      LENS_EVENTS_FILE: paths(sess, `.${tag}`).events,
      LENS_HANDLER_LEDGER: paths(sess, `.${tag}`).handlers,
      ...variant.env,
    }, `sut-${tag}`);
    try {
      await waitForHttp("http://127.0.0.1:5030/health");
      const res = await fetch("http://127.0.0.1:5030/weather");
      batteryObs.push(await sess.probe({ fetch: (p) => fetch(`http://127.0.0.1:5030${p}`) }));
      void res;
    } finally {
      await stopChild(server);
    }
  }
  const facts = buildFacts({
    clientRuns: [], clientEvents: [],
    serverEvents: [], handlerEntries: [],
    facilitatorEntries: readJsonl(paths(sess).facilitator),
    batteryObs, serverAlive: true,
  });
  return {
    session: sess.id, matrix: sess.matrix, preflight: false,
    doc_refs: sess.doc_refs ?? [], expectation: sess.expect,
    config: { variants: sess.server_variants.map(v => v.tag) },
    observed: facts,
    verdict: normalizeVerdict(sess.match(facts)),
  };
}

async function runConfigSession(sess) {
  const results = [];
  for (const sc of sess.scenarios) {
    const res = await run(process.execPath, [CONFIG_PROBE], {
      cwd: SUT_ROOT,
      env: { PROBE_SCENARIO: sc.scenario },
    });
    const line = res.stdout.trim().split("\n").filter(Boolean).pop() ?? "{}";
    let parsed;
    try { parsed = JSON.parse(line); } catch { parsed = { scenario: sc.scenario, threw: true, name: "ProbeCrash", message: res.stderr.slice(0, 200) }; }
    parsed.expectThrew = sc.expectThrew;
    parsed.messageIncludes = sc.messageIncludes;
    parsed.scenario_ok = parsed.threw === sc.expectThrew
      && (sc.messageIncludes === null || String(parsed.message ?? "").includes(sc.messageIncludes));
    results.push(parsed);
  }
  const allOk = results.every(r => r.scenario_ok);
  return {
    session: sess.id, matrix: sess.matrix, preflight: false,
    doc_refs: sess.doc_refs ?? [], expectation: sess.expect,
    config: { probe: CONFIG_PROBE, cwd: SUT_ROOT },
    observed: { results },
    verdict: allOk ? "PASS" : "FAIL",
  };
}

async function runCliSession(sess, fac, facPort, sutPort, serverEnvBase) {
  const parseCli = (res) => {
    const start = res.stdout.indexOf("{");
    if (start < 0) return { unparsable: res.stdout.slice(0, 200), stderr: res.stderr.slice(0, 200) };
    try { return JSON.parse(res.stdout.slice(start)); } catch { return { unparsable: res.stdout.slice(0, 200) }; }
  };
  const inspects = [];
  for (const variant of sess.variants) {
    const server = startChild(process.execPath, [SERVER], {
      ...serverEnvBase,
      ...variant.env,
      LENS_EVENTS_FILE: paths(sess, `.${variant.tag}`).events,
      LENS_HANDLER_LEDGER: paths(sess, `.${variant.tag}`).handlers,
    }, `sut-${variant.tag}`);
    try {
      await waitForHttp(`http://127.0.0.1:${sutPort}/health`);
      const inspect = await run(process.execPath, [CLI, "inspect", `http://127.0.0.1:${sutPort}/weather`, "--json"], { cwd: SUT_ROOT });
      inspects.push({ tag: variant.tag, json: parseCli(inspect), rc: inspect.code });
    } finally {
      await stopChild(server);
    }
  }
  const doctor = await run(process.execPath, [CLI, "doctor", "--facilitator", `http://127.0.0.1:${facPort}`, "--network", EVM_NET, "--json"], { cwd: SUT_ROOT });
  const doctorJson = parseCli(doctor);
  const [def, on] = inspects;
  const facts = buildFacts({
    clientRuns: [], clientEvents: [],
    serverEvents: readJsonl(paths(sess, ".default").events),
    handlerEntries: [],
    facilitatorEntries: readJsonl(paths(sess).facilitator),
    batteryObs: { inspects, doctor: doctorJson, doctor_rc: doctor.code },
    serverAlive: true,
  });
  const defOk = def.rc === 1 && def.json.status === 402 && def.json.headerPresent === true
    && def.json.paymentRequired?.x402Version === 2
    && Array.isArray(def.json.conformance) && def.json.conformance.length === 0
    && def.json.cors?.exposesPaymentRequired === false;
  const corsOnOk = on.rc === 0 && on.json.exitCode === 0 && on.json.cors?.exposesPaymentRequired === true;
  const doctorOk = doctorJson.exitCode === 0 && doctor.code === 0;
  return {
    session: sess.id, matrix: sess.matrix, preflight: false,
    doc_refs: sess.doc_refs ?? [], expectation: sess.expect,
    config: { cli: CLI, variants: sess.variants.map(v => v.tag) },
    observed: facts,
    verdict: defOk && corsOnOk && doctorOk ? "PASS" : "FAIL",
  };
}

/* --------------------------------- main ----------------------------------- */

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const only = process.env.XC_ONLY;
  const skipPreflight = process.env.SKIP_PREFLIGHT === "1";
  const sessions = SESSIONS
    .filter(s => (skipPreflight ? !s.preflight : true))
    .filter(s => (only ? s.id.includes(only) : true));

  const labCommit = (() => { try { return execSync("git rev-parse HEAD", { cwd: LAB_ROOT }).toString().trim(); } catch { return "unresolved"; } })();
  const upstreamCommit = (() => { try { return execSync("git rev-parse HEAD", { cwd: UPSTREAM }).toString().trim(); } catch { return "unresolved (copy without .git)"; } })();
  const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
  const fileHashes = {
    "package.json": sha(path.join(SUT_ROOT, "package.json")),
    "packages/express/src/index.ts": sha(path.join(SUT_ROOT, "packages/express/src/index.ts")),
    "packages/core/src/config.ts": sha(path.join(SUT_ROOT, "packages/core/src/config.ts")),
    "packages/express/dist/index.js": sha(path.join(SUT_ROOT, "packages/express/dist/index.js")),
    "packages/cli/dist/index.js": sha(path.join(SUT_ROOT, "packages/cli/dist/index.js")),
  };
  const docRegistrySha = sha(DOC_REGISTRY);
  const npmLs = (() => { try { return execSync("npm ls --depth=0", { cwd: path.join(SUT_ROOT, "argus-battery") }).toString().trim(); } catch { return "unresolved"; } })();

  const layer1 = (() => {
    if (!existsSync(LAYER1_LOG)) return { note: "log not found" };
    const text = readFileSync(LAYER1_LOG, "utf-8");
    const files = text.match(/Test Files\s+(\d+ passed)/)?.[1] ?? null;
    const tests = text.match(/Tests\s+(\d+ passed[^)]*\))/)?.[1] ?? null;
    const rc = text.match(/layer1 exit: (-?\d+)/)?.[1] ?? null;
    return { command: "npm test (workspace root) — the SUT's own suite, verbatim, no network", test_files: files, tests: tests, exit_code: Number(rc), log: LAYER1_LOG };
  })();

  const results = [];
  let facPort = 4930;
  let sutPort = 5030;
  for (const sess of sessions) {
    process.stdout.write(`[lens-a10] ${sess.id} ... `);
    const rec = await runSession(sess, facPort++, sutPort++);
    results.push(rec);
    console.log(rec.verdict);
  }

  const sealed = results.filter(r => !r.preflight);
  const fixture = {
    rig: "x402-lens @ 1a99549 — server-side battery: lab-owned mock facilitator + honest lab buyer vs the built @x402-lens/express middleware (battery-lens-a10.mjs, Layer 2)",
    attribution: {
      lab: "Argus Agent Test Lab",
      operator: "igor-vii (run executed in the lab sandbox on the operator's behalf)",
      repo: "github.com/igor-vii/Argus-Agent-Test-Lab",
      lab_commit: labCommit,
      topology_note: "TOPOLOGY INVERSION vs sealed cycles 0018/0019: the SUT is the resource-server middleware, so the S-BS-06 stand is REPLACED by the SUT; the lab controls the facilitator (mock, fault-injection point) and the buyer (sealed client perimeter lineage). Block-B money-fault mapping documented in doc-registry 'Out-of-scope mapping'.",
      sut: {
        candidate: "Rozenberg888/x402-lens",
        upstream_commit: upstreamCommit,
        workspace_version: "0.2.0",
        artifact: "built dist (packages/*/dist) driven through the workspace symlinks; server harness = argus-battery/server_lens.mjs (no decision logic, env-configured)",
        file_sha256: fileHashes,
      },
      harness: "sut-x402-lens/argus-battery/ (orchestrator battery-lens-a10.mjs; client client_lens.mjs base = sealed client_v5 perimeter lineage; lab facilitator adapters/mock_facilitator.mjs)",
    },
    provenance: {
      tasking: "run the candidate through the whole lab battery WITH its documentation accounted for: behaviors described in the candidate's docs are pre-registered and verdicted DOCUMENTED, not FAIL",
      doc_registry: { file: "sut-x402-lens/doc-registry.md", sha256: docRegistrySha, note: "D-01..D-21 + out-of-scope mapping; every session cites its IDs in doc_refs" },
      layer1_run: layer1,
      pre_registration: "session matrix + matchers fixed in battery-lens-a10.mjs before the run; candidate = the variable; harness/facilitator/client = lab constants",
    },
    addendum: {
      repetitions: "1 canonical run per session; re-run only as documented deviation",
      window: "single battery run session",
      node_version: process.version,
      battery_npm_ls: npmLs,
      session_lifecycle: "fresh facilitator + fresh SUT process + fresh client process per session; no state crosses sessions (R2-equivalent)",
      evidence_discipline: {
        established: "HTTP responses at the SUT boundary, the SUT's own event stream, the handler ledger, and the facilitator call ledger",
        not_established: "an on-chain transfer: settlement is mocked; per-session throwaway unfunded wallets",
        redaction: "no private keys, no signatures; payment nonces shortened; replay header captured in process memory only",
      },
      client_perimeter: "plain honest @x402/fetch buyer — NO spendControls, NO quote-control, NO fence: the client is lab equipment, the SUT (middleware) is the variable",
    },
    sessions: sealed,
    preflight: results.find(r => r.preflight) ?? null,
    green_zone_definition: "canonical gate green (402 -> pay -> verify -> settle -> deliver with the full event stream); zero unauthorized deliveries across all fault sessions (handler deltas exactly as documented); every documented-behavior session shows its required observability events; config refusal surface matches the documented contract; shipped CLI gates healthy against the live SUT",
    verdict_semantics: {
      PASS: "observed matches the pre-registered expectation",
      DOCUMENTED: "observed matches a pre-registered doc-registry claim (NOT a bug by tasking); the claim's required guarantees (events/guards) all held",
      FAIL: "observed contradicts the expectation or breaks a documented guarantee — a defect",
      HARNESS_ERROR: "lab equipment failed; no verdict",
    },
  };

  writeFileSync(FIXTURE_OUT, JSON.stringify(fixture, null, 2) + "\n");
  const fails = sealed.filter(r => r.verdict !== "PASS" && r.verdict !== "DOCUMENTED");
  const documented = sealed.filter(r => r.verdict === "DOCUMENTED");
  console.log(`\n[lens-a10] sealed sessions: ${sealed.length}, PASS: ${sealed.length - fails.length - documented.length}, DOCUMENTED: ${documented.length}, not-PASS: ${fails.length}`);
  for (const f of fails) console.log(`[lens-a10]   not-PASS: ${f.session} (${f.verdict}) — ${f.error ?? ""}`);
  console.log(`[lens-a10] fixture: ${FIXTURE_OUT}`);
  if (fails.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`[lens-a10] fatal: ${e.message}`);
  process.exit(1);
});
