/**
 * SUT server harness for the x402-lens battery (Argus Agent Test Lab).
 *
 * Runs the REAL shipped `@x402-lens/express` (built dist, workspace symlink)
 * inside a minimal Express app. This file contains NO decision logic of its
 * own — configuration, grant wiring, and sinks come entirely from env, and
 * everything observable is written to ledgers:
 *   LENS_EVENTS_FILE     the SUT's own event stream (jsonlFileSink)
 *   LENS_HANDLER_LEDGER  one line per protected-handler invocation
 *
 * Evidence discipline: no keys, no signatures here — the server never signs.
 *
 * Env:
 *   LENS_PORT                    listen port (127.0.0.1)
 *   LENS_FACILITATOR_URL         facilitator base URL (required — D-02 no defaults)
 *   LENS_NETWORKS                csv of CAIP-2 networks (first = primary)
 *   LENS_PAY_TO                  single payTo address, OR
 *   LENS_PAY_TO_MAP              JSON map network -> address (multi-network)
 *   LENS_ROUTES                  JSON array [{route:"GET /weather", price:"$0.001", scheme?, paymentFlow?}]
 *   LENS_GRANT_MODE              none (default) | demo  — demo: x-argus-grant
 *                                "allow" -> unpaid true, "deny" -> 403 reason string
 *   LENS_SINK_THROW              1 = append an extra sink that throws on every event (D-11)
 *   LENS_CORS                    off (default) | on | merge (app-level CORS layer first)
 *   LENS_READABLE_BODY           0 = readableBody:false (default 1)
 *   LENS_EVENTS_FILE             SUT event jsonl sink path
 *   LENS_HANDLER_LEDGER          handler-call jsonl ledger path
 *   LENS_FACILITATOR_TOKEN       bearer token forwarded to the facilitator (D-17)
 *   LENS_FACILITATOR_TIMEOUT_MS  facilitator timeout (D-12)
 */
import express from "express";
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";
import { paymentLens } from "@x402-lens/express";

const PORT = Number(process.env.LENS_PORT || 5030);
const NETWORKS = (process.env.LENS_NETWORKS || "eip155:84532").split(",").map(s => s.trim()).filter(Boolean);
const PAY_TO_MAP = process.env.LENS_PAY_TO_MAP ? JSON.parse(process.env.LENS_PAY_TO_MAP) : null;
const PAY_TO = PAY_TO_MAP ?? process.env.LENS_PAY_TO;
const ROUTES = JSON.parse(process.env.LENS_ROUTES || '[{"route":"GET /weather","price":"$0.001"}]');
const GRANT_MODE = process.env.LENS_GRANT_MODE || "none";
const SINK_THROW = process.env.LENS_SINK_THROW === "1";
const CORS_MODE = process.env.LENS_CORS || "off";
const READABLE_BODY = process.env.LENS_READABLE_BODY !== "0";
const EVENTS_FILE = process.env.LENS_EVENTS_FILE || "";
const HANDLER_LEDGER = process.env.LENS_HANDLER_LEDGER || "";
const FACILITATOR_TIMEOUT = process.env.LENS_FACILITATOR_TIMEOUT_MS ? Number(process.env.LENS_FACILITATOR_TIMEOUT_MS) : undefined;

const primaryNetwork = NETWORKS[0];

const appendLedger = (entry) => {
  if (!HANDLER_LEDGER) return;
  try { appendFileSync(HANDLER_LEDGER, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, "utf-8"); } catch { /* never fatal */ }
};

const lens = paymentLens({
  facilitatorUrl: process.env.LENS_FACILITATOR_URL,
  network: NETWORKS.length === 1 ? primaryNetwork : undefined,
  networks: NETWORKS.length > 1 ? NETWORKS : undefined,
  payTo: PAY_TO,
  routes: ROUTES.map(r => ({ ...r })),
  ...(FACILITATOR_TIMEOUT !== undefined ? { facilitatorTimeoutMs: FACILITATOR_TIMEOUT } : {}),
  ...(process.env.LENS_FACILITATOR_TOKEN
    ? { facilitatorHeaders: process.env.LENS_FACILITATOR_HEADERS_FLAT === "1"
      // deliberate WRONG shape (flat object) for the l_facilitator_flat_headers probe (D-17)
      ? { authorization: `Bearer ${process.env.LENS_FACILITATOR_TOKEN}` }
      : { verify: { authorization: `Bearer ${process.env.LENS_FACILITATOR_TOKEN}` }, settle: { authorization: `Bearer ${process.env.LENS_FACILITATOR_TOKEN}` }, supported: { authorization: `Bearer ${process.env.LENS_FACILITATOR_TOKEN}` } } }
    : {}),
  ...(GRANT_MODE === "demo"
    ? { grant: ({ header }) => {
        const value = header("x-argus-grant");
        if (value === "allow") return true;
        if (value === "deny") return "denied by lab grant probe";
        return undefined;
      } }
    : {}),
  readableBody: READABLE_BODY,
  ...(CORS_MODE !== "off" ? { cors: true } : {}),
  sinks: { console: false, ...(EVENTS_FILE ? { jsonlPath: EVENTS_FILE } : {}) },
  ...(SINK_THROW ? { extraSinks: [{ name: "lab-throwing-sink", write() { throw new Error("lab sink boom"); } }] } : {}),
});

const app = express();

if (CORS_MODE === "merge" || process.env.LENS_APP_CORS === "1") {
  // Stands in for an app that already runs its own CORS layer (D-08 merge case).
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Expose-Headers", "X-Custom-Header");
    next();
  });
}

app.use(lens.middleware);

for (const route of ROUTES) {
  const spaceAt = route.route.indexOf(" ");
  const method = route.route.slice(0, spaceAt).toLowerCase();
  const path = route.route.slice(spaceAt + 1);
  app[method](path, (_req, res) => {
    appendLedger({ type: "handler_call", route: route.route });
    res.json({ ok: true, route: route.route, served_by: "x402-lens battery harness" });
  });
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", harness: "x402-lens battery" });
});

const server = createServer(app);
server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`${JSON.stringify({ type: "sut_up", port: PORT, routes: ROUTES.map(r => r.route), networks: NETWORKS, grant_mode: GRANT_MODE, cors: CORS_MODE })}\n`);
});

const shutdown = () => {
  lens.close().catch(() => {}).finally(() => {
    try { server.close(() => process.exit(0)); } catch { process.exit(0); }
    setTimeout(() => process.exit(0), 800).unref();
  });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
