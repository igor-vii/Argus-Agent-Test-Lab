/**
 * LATEST SEAL — build-time injection (ТЗ п.4, strictly NOT client-side).
 *
 * 1. Runs tools/registry/verify-registry.mjs against REGISTRY_ROOT.
 *    Non-zero exit (broken signature / broken chain / missing evidence) → this script
 *    exits non-zero → the build turns red. CI-as-verification: a tampered seal is a
 *    publicly observable failed build, not a silent UI.
 * 2. Reads the highest-seq record from attestations/records/ and writes
 *    src/data/latest-seal.json, which the LATEST SEAL server component renders as
 *    static, indexable HTML (GPTBot/ClaudeBot/PerplexityBot never execute JS).
 *
 * Env: REGISTRY_ROOT (default: auto-detect — repo root, cwd, or cwd/..; the site
 * lives at <repo>/site and the registry at <repo>/attestations, same checkout).
 * Wired via package.json "prebuild".
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();

function resolveRegistryRoot() {
  if (process.env.REGISTRY_ROOT) return process.env.REGISTRY_ROOT;
  for (const base of [ROOT, path.join(ROOT, ".."), path.join(ROOT, "repo")]) {
    if (fs.existsSync(path.join(base, "attestations", "records"))) return base;
  }
  return path.join(ROOT, "repo");
}

const REGISTRY_ROOT = resolveRegistryRoot();
const RECORDS_DIR = path.join(REGISTRY_ROOT, "attestations", "records");

/* 1 — verify the whole registry (signatures + hash chain + evidence hashes) */
let verifyOut;
try {
  verifyOut = execFileSync("node", [path.join("tools", "registry", "verify-registry.mjs")], {
    cwd: REGISTRY_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
} catch (err) {
  console.error("\n[LATEST SEAL] registry verification FAILED — refusing to build.\n");
  if (err.stdout) console.error(err.stdout);
  process.exit(1);
}
console.log(verifyOut.trim());

const headMatch = verifyOut.match(/chain head ([0-9a-f]{16})/);
const countMatch = verifyOut.match(/(\d+) records/);
if (!headMatch || !countMatch) {
  console.error("[LATEST SEAL] cannot parse verify output");
  process.exit(1);
}
const CHAIN_HEAD = headMatch[1];
const RECORD_COUNT = parseInt(countMatch[1], 10);

/* 2 — pick the latest record */
if (!fs.existsSync(RECORDS_DIR)) {
  console.error(`[LATEST SEAL] records dir not found: ${RECORDS_DIR}`);
  process.exit(1);
}
const files = fs.readdirSync(RECORDS_DIR).filter((f) => f.endsWith(".json")).sort();
if (files.length === 0) {
  console.error("[LATEST SEAL] no records found");
  process.exit(1);
}
/* The block renders a SEAL. Corrections (type "correction", e.g. #0010 amending
 * #0009) are also chain records, but they have no scenarios/verdicts — rendering
 * the highest-seq record blindly would show a correction as if it were a seal. */
let latestFile = null;
for (let i = files.length - 1; i >= 0; i--) {
  const parsed = JSON.parse(fs.readFileSync(path.join(RECORDS_DIR, files[i]), "utf8"));
  if (parsed.type === "seal") {
    latestFile = files[i];
    break;
  }
}
if (!latestFile) {
  console.error("[LATEST SEAL] no seal-type record found");
  process.exit(1);
}
const rec = JSON.parse(fs.readFileSync(path.join(RECORDS_DIR, latestFile), "utf8"));

/* 3 — normalize into render-ready fields */
const toneOf = (verdict) => {
  const v = String(verdict).toUpperCase();
  if (v.startsWith("PASS")) return "pass";
  if (v.startsWith("FAIL")) return "fail";
  if (v.startsWith("HOLD")) return "hold";
  if (v.startsWith("OBSERVED")) return "observed";
  if (v.startsWith("DX")) return "dx";
  return "info";
};

const scenarios = (rec.scenarios ?? []).map((s) => ({
  id: s.id,
  verdict: s.verdict,
  tone: toneOf(s.verdict),
}));
const counts = {};
for (const s of scenarios) counts[s.tone] = (counts[s.tone] ?? 0) + 1;

const evidence = (rec.evidence ?? [])
  .filter((e) => e.kind === "file" && e.path)
  .map((e) => ({ path: e.path, sha256: e.sha256 ?? null }));

const payload = {
  generated_at: new Date().toISOString(),
  verify: {
    command: "node tools/registry/verify-registry.mjs",
    records: RECORD_COUNT,
    chain_head: CHAIN_HEAD,
  },
  record: {
    seq: rec.seq,
    record_id: rec.record_id,
    type: rec.type,
    issued_at: rec.issued_at,
    date: String(rec.issued_at ?? "").slice(0, 10),
    title: rec.title,
    subject: rec.subject?.repo ?? rec.subject ?? "",
    prev_record_hash: rec.prev_record_hash ?? null,
    chain_head: CHAIN_HEAD,
    scenarios,
    counts,
    evidence,
  },
};

const outPath = path.join(ROOT, "src", "data", "latest-seal.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
console.log(
  `[LATEST SEAL] #${payload.record.seq} (${payload.record.date}) → ${path.relative(ROOT, outPath)} · ` +
  `chain ${String(rec.prev_record_hash ?? "null").slice(0, 8)} → ${CHAIN_HEAD.slice(0, 8)} · ` +
  `${RECORD_COUNT} records verified`
);
