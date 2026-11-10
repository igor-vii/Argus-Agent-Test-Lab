// gist_sidecar_server.mjs — transport-only sidecar for the Argus battery "gist-a10"
// (pre-registered A10a/A10b identical-offer race, x402 #4198, run #2 candidate 2).
//
// HARD RULE (lab discipline): the decision path below is the pinned gist's
// reservation mechanism, VERBATIM — byte-for-byte between the FRAGMENT markers
// (verified programmatically at build time against the pinned file):
//     gist e319a833e1be184a0df16ec69f474b72, revision df69c25fac01f68f6b71981e57b71699c12fd1b2
//     file sha256 d4395716de9feef0288288ac89b9b326569cf06c97dae50ac148bdb2e40dc6e6
//     fragment = pinned lines 14-38 (sha/canonical/digest/reserve)
// The ONLY non-verbatim code is transport (node:http) + logging; decisions are
// produced exclusively by the verbatim reserve() from the pinned gist.
//
// Surface:
//   GET  /health  -> {ok, root}
//   POST /reserve {account, purchase_id, intent} -> {decision, key_digest, intent_digest}
// One sidecar process per battery session with a FRESH GIST_STATE_DIR (addendum R2);
// the gist's own warning is retained: one shared filesystem is the reference owner,
// independent paths are NOT a distributed lock; the fence has no timeout/release.
import { createHash } from "node:crypto";
import { link, mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { join } from "node:path";

const ROOT = process.env.GIST_STATE_DIR;
if (!ROOT) { console.error("GIST_STATE_DIR required (fresh per session, R2)"); process.exit(1); }
const PORT = Number(process.env.GIST_SIDECAR_PORT || 4710);

const log = (event) => console.log(JSON.stringify({ at: new Date().toISOString(), ...event }));

// ---- FRAGMENT-BEGIN (verbatim from pinned gist df69c25, lines 14-38) ----
const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = value => value !== null && typeof value === 'object'
  ? Array.isArray(value) ? value.map(canonical)
    : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  : value;
const digest = value => sha(JSON.stringify(canonical(value)));

async function reserve(root, account, purchaseId, intent) {
  const key = join(root, digest([account, purchaseId]));
  const staging = join(root, `.${randomUUID()}`);
  // Publish a complete immutable record atomically. A racing reader never
  // sees an empty file, and no contender overwrites an existing reservation.
  await writeFile(staging, intent, { flag: 'wx', mode: 0o600 });
  try {
    try {
      await link(staging, key);
      return 'reserved';
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      return await readFile(key, 'utf8') === intent ? 'held' : 'conflict';
    }
  } finally {
    await unlink(staging);
  }
}
// ---- FRAGMENT-END ----

// ------------------------- transport-only glue -------------------------------

async function handleReserve(body) {
  const account = body.account;
  const purchaseId = body.purchase_id;
  const intent = body.intent; // array [method, url, sha(body), resource, selectedRequirements] (glue shape, see client_gist.ts)
  if (typeof account !== "string" || typeof purchaseId !== "string" || intent === undefined) {
    return { code: 400, payload: { error: "account, purchase_id, intent required" } };
  }
  const key = join(ROOT, digest([account, purchaseId]));
  // VERBATIM call into the pinned mechanism; only observation wraps it.
  const decision = await reserve(ROOT, account, purchaseId, JSON.stringify(intent));
  log({ type: "sidecar_reserve", account, purchase_id: purchaseId,
        decision, key_digest: sha(key), intent_digest: digest(intent) });
  return { code: 200, payload: { decision, key_digest: sha(key), intent_digest: digest(intent) } };
}

const server = http.createServer(async (req, res) => {
  const send = (code, payload) => {
    const b = Buffer.from(JSON.stringify(payload));
    res.writeHead(code, { "Content-Type": "application/json", "Content-Length": b.length });
    res.end(b);
  };
  try {
    if (req.method === "GET" && req.url === "/health") {
      await mkdir(ROOT, { recursive: true, mode: 0o700 });
      return send(200, { ok: true, root: ROOT });
    }
    if (req.method === "POST" && req.url === "/reserve") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const { code, payload } = await handleReserve(JSON.parse(raw || "{}"));
      return send(code, payload);
    }
    send(404, { error: "not found" });
  } catch (error) {
    log({ type: "sidecar_error", error: String(error && error.stack || error) });
    send(500, { error: String(error && error.message || error) });
  }
});

await mkdir(ROOT, { recursive: true, mode: 0o700 });
log({ type: "sidecar_start", root: ROOT, port: PORT,
      gist: "e319a833e1be184a0df16ec69f474b72@df69c25fac01f68f6b71981e57b71699c12fd1b2" });
server.listen(PORT, "127.0.0.1");
