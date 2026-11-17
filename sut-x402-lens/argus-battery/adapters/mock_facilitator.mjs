/**
 * LAB-OWNED mock facilitator for the x402-lens battery (Argus Agent Test Lab).
 *
 * This is NOT the SUT's own helper (test/helpers/mockFacilitator.ts) — the lab
 * must control the counterparty so that verdicts are lab-owned. Wire shape
 * mirrors the three endpoints the SDK uses (proven by the SUT's own suite):
 *   /supported  -> { kinds: [{x402Version, scheme, network}], extensions, signers }
 *   /verify     -> { isValid, invalidReason?, invalidMessage?, payer? }
 *   /settle     -> { success, errorReason?, transaction?, network?, payer? }
 *
 * Fault injection per session via env. Honest-counterparty mode (FAC_HONEST_
 * NONCES=1) deep-searches the verify body for the payment nonce and rejects a
 * second submission of the SAME nonce with `duplicate_payment_nonce` — the
 * replay-protection behavior of a well-behaved facilitator.
 *
 * Evidence discipline: the ledger logs the nonce SHORTENED and never the
 * payload signature; no real funds, no external network.
 *
 * Env:
 *   FAC_PORT             listen port (127.0.0.1)
 *   FAC_NETWORKS         csv of CAIP-2 networks to advertise   (default eip155:84532)
 *   FAC_SCHEMES          csv of schemes to advertise           (default exact)
 *   FAC_VERIFY_RESULT    JSON body for /verify                 (default isValid:true)
 *   FAC_SETTLE_RESULT    JSON body for /settle                 (default success:true, tx 0x1111…)
 *   FAC_VERIFY_STATUS    override HTTP status for /verify      (default 200)
 *   FAC_SETTLE_STATUS    override HTTP status for /settle      (default 200)
 *   FAC_VERIFY_DELAY_MS  artificial verify delay               (default 0)
 *   FAC_SETTLE_DELAY_MS  artificial settle delay               (default 0)
 *   FAC_HONEST_NONCES    1 = reject duplicate nonce submissions (default 0)
 *   FAC_REQUIRE_BEARER   token string; requests without the right
 *                        `Authorization: Bearer <token>` get 401 (default off)
 *   FAC_LEDGER           JSONL ledger path
 */
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";

const PORT = Number(process.env.FAC_PORT || 4930);
const NETWORKS = (process.env.FAC_NETWORKS || "eip155:84532").split(",").map(s => s.trim()).filter(Boolean);
const SCHEMES = (process.env.FAC_SCHEMES || "exact").split(",").map(s => s.trim()).filter(Boolean);
const VERIFY_RESULT = JSON.parse(process.env.FAC_VERIFY_RESULT || '{"isValid":true,"payer":"0x857b06519E91e3A54538791bDAbd0E22373e36b66"}');
const SETTLE_RESULT = JSON.parse(process.env.FAC_SETTLE_RESULT || `{"success":true,"transaction":"0x${"11".repeat(32)}","network":"${NETWORKS[0]}","payer":"0x857b06519E91e3A54538791bDAbd0E22373e36b66"}`);
const VERIFY_STATUS = Number(process.env.FAC_VERIFY_STATUS || 200);
const SETTLE_STATUS = Number(process.env.FAC_SETTLE_STATUS || 200);
const VERIFY_DELAY = Number(process.env.FAC_VERIFY_DELAY_MS || 0);
const SETTLE_DELAY = Number(process.env.FAC_SETTLE_DELAY_MS || 0);
const HONEST_NONCES = process.env.FAC_HONEST_NONCES === "1";
const BEARER = process.env.FAC_REQUIRE_BEARER || "";
const LEDGER = process.env.FAC_LEDGER || "";

const seenNonces = new Set();
const calls = [];

const short = (v, keep = 10) => {
  const s = String(v ?? "");
  return s.length <= keep * 2 ? s : `${s.slice(0, keep)}…${s.slice(-4)}(len${s.length})`;
};

/** Deep-search parsed JSON for the first "nonce" scalar. */
function findNonce(value, depth = 0) {
  if (depth > 8 || value === null || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findNonce(item, depth + 1);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }
  for (const [key, val] of Object.entries(value)) {
    if (key === "nonce" && (typeof val === "string" || typeof val === "number")) return String(val);
    const hit = findNonce(val, depth + 1);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

const log = (entry) => {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  calls.push(entry);
  if (LEDGER) {
    try { appendFileSync(LEDGER, `${line}\n`, "utf-8"); } catch { /* never fatal */ }
  }
};

const server = createServer((req, res) => {
  const chunks = [];
  req.on("data", c => chunks.push(Buffer.from(c)));
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    let body;
    try { body = raw ? JSON.parse(raw) : undefined; } catch { body = { unparsable: short(raw, 32) }; }
    const path = (req.url ?? "/").replace(/^\/+/, "").split("?")[0] ?? "";
    const auth = String(req.headers.authorization ?? "");
    const authOk = !BEARER || auth === `Bearer ${BEARER}`;

    const send = (status, payload) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    const respond = (status, payload, delayMs) => {
      if (delayMs > 0) { setTimeout(() => send(status, payload), delayMs); return; }
      send(status, payload);
    };

    if (path === "health") { send(200, { ok: true, facilitator: "argus-lab-mock" }); return; }

    if (!authOk) {
      log({ type: "facilitator_call", path, auth_present: auth !== "", auth_rejected: true });
      send(401, { error: "unauthenticated" });
      return;
    }

    switch (path) {
      case "supported": {
        log({ type: "facilitator_call", path, auth_present: true });
        send(200, {
          kinds: NETWORKS.flatMap(network => SCHEMES.map(scheme => ({ x402Version: 2, scheme, network }))),
          extensions: [],
          signers: {},
        });
        return;
      }
      case "verify": {
        const nonce = findNonce(body);
        if (HONEST_NONCES && nonce !== undefined && seenNonces.has(nonce)) {
          log({ type: "facilitator_call", path, auth_present: true, nonce_short: short(nonce), honest_decision: "duplicate_payment_nonce" });
          respond(VERIFY_STATUS, { isValid: false, invalidReason: "duplicate_payment_nonce", invalidMessage: "honest facilitator: this authorization nonce was already submitted" }, VERIFY_DELAY);
          return;
        }
        if (HONEST_NONCES && nonce !== undefined) seenNonces.add(nonce);
        log({
          type: "facilitator_call", path, auth_present: true,
          nonce_short: nonce === undefined ? null : short(nonce),
          honest_decision: HONEST_NONCES ? "first-submission" : null,
          verify_result: { isValid: VERIFY_RESULT.isValid, invalidReason: VERIFY_RESULT.invalidReason ?? null },
        });
        respond(VERIFY_STATUS, VERIFY_RESULT, VERIFY_DELAY);
        return;
      }
      case "settle": {
        log({
          type: "facilitator_call", path, auth_present: true,
          settle_result: { success: SETTLE_RESULT.success, errorReason: SETTLE_RESULT.errorReason ?? null },
        });
        respond(SETTLE_STATUS, SETTLE_RESULT, SETTLE_DELAY);
        return;
      }
      default:
        send(404, { error: "not_found" });
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : PORT;
  process.stdout.write(`${JSON.stringify({ type: "facilitator_up", port, networks: NETWORKS, schemes: SCHEMES, honest_nonces: HONEST_NONCES, require_bearer: !!BEARER })}\n`);
});

const shutdown = () => {
  try { server.close(() => process.exit(0)); } catch { process.exit(0); }
  setTimeout(() => process.exit(0), 500).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
