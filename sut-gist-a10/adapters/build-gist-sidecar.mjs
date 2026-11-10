#!/usr/bin/env node
// build-gist-sidecar.mjs — assemble sut-gist-a10/adapters/gist_sidecar_server.mjs
// with the reserve()/digest() mechanism copied VERBATIM (byte-for-byte) from the
// pinned gist file, then byte-verify the fragment against the pinned source.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUT_ROOT = path.resolve(__dirname, "..");
const GIST = process.env.GIST_FILE || "/home/z/my-project/work/gist-run/pre-sign-owner-replay.mjs";

const gistBytes = readFileSync(GIST, "utf8");
const gistLines = gistBytes.split("\n");
// Fragment = lines 14..38 (1-based) of the pinned revision df69c25:
//   14  const sha = value => createHash('sha256').update(value).digest('hex');
//   ...
//   38  }
// (ends with the closing brace of reserve())
const FRAG_START = 14, FRAG_END = 38;
const fragment = gistLines.slice(FRAG_START - 1, FRAG_END).join("\n");
if (!fragment.startsWith("const sha = value =>") || !fragment.trimEnd().endsWith("}")) {
  throw new Error("fragment extraction drifted — pinned gist changed?");
}
// sanity anchors from the pinned revision
if (!fragment.includes("await link(staging, key);")) throw new Error("anchor missing: link()");
if (!fragment.includes("return await readFile(key, 'utf8') === intent ? 'held' : 'conflict';")) {
  throw new Error("anchor missing: held/conflict");
}

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const header = `// gist_sidecar_server.mjs — transport-only sidecar for the Argus battery "gist-a10"
// (pre-registered A10a/A10b identical-offer race, x402 #4198, run #2 candidate 2).
//
// HARD RULE (lab discipline): the decision path below is the pinned gist's
// reservation mechanism, VERBATIM — byte-for-byte between the FRAGMENT markers
// (verified programmatically at build time against the pinned file):
//     gist e319a833e1be184a0df16ec69f474b72, revision df69c25fac01f68f6b71981e57b71699c12fd1b2
//     file sha256 d4395716de9feef0288288ac89b9b326569cf06c97dae50ac148bdb2e40dc6e6
//     fragment = pinned lines ${FRAG_START}-${FRAG_END} (sha/canonical/digest/reserve)
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

`;

const transport = `
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
`;

const finalFile = header
  + `// ---- FRAGMENT-BEGIN (verbatim from pinned gist df69c25, lines ${FRAG_START}-${FRAG_END}) ----\n`
  + fragment + "\n"
  + `// ---- FRAGMENT-END ----\n`
  + transport;
const OUT = path.join(SUT_ROOT, "adapters", "gist_sidecar_server.mjs");
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, finalFile);

// ---------------- byte verification ----------------
const built = readFileSync(OUT, "utf8");
const begin = built.indexOf("// ---- FRAGMENT-BEGIN");
const end = built.indexOf("// ---- FRAGMENT-END");
const inner = built.slice(built.indexOf("\n", begin) + 1, end);
const fragmentInFile = inner.replace(/\n$/, "");
const byteEqual = fragmentInFile === fragment;
console.log(JSON.stringify({
  built: OUT,
  gist_file_sha256: sha256(gistBytes),
  fragment_sha256: sha256(fragment),
  fragment_byte_equal_to_pinned_slice: byteEqual,
  fragment_lines: `${FRAG_START}-${FRAG_END}`,
}, null, 2));
if (!byteEqual) process.exit(1);
