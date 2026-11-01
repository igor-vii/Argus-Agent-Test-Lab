/**
 * SEALS CATALOG — build-time generation from the sealed registry.
 *
 * The chain explorer (site catalog) used to be a hand-maintained SEALS array
 * in src/lib/lab-data.ts: every new seal meant a manual copy-paste entry, and
 * the site could silently drift from attestations/records/. This script makes
 * the registry itself the single source of truth:
 *
 *   1. Runs tools/registry/verify-registry.mjs (same gate as gen-latest-seal.mjs):
 *      a tampered / broken seal fails the build, never silently renders.
 *   2. Maps every non-correction record into a Seal-shaped entry.
 *   3. Merges optional editorial overrides from src/data/seals-editorial.json
 *      (object keyed by seq — title/summary/verdicts/findings/links/evidence;
 *      omitted fields fall through to the registry-derived defaults).
 *   4. Writes src/data/seals-catalog.json, imported by lab-data.ts.
 *
 * Consequences:
 *   - A newly sealed record reaches the public site catalog with ZERO manual
 *     site edits: sign → build-index → verify → commit → push is the whole job.
 *     CI (latest-seal.yml) regenerates this file after verification and commits
 *     the result with [skip ci]; "prebuild" also runs it locally.
 *   - The output is deterministic (no timestamps) so CI regeneration is
 *     idempotent — a commit only happens when a record actually changed.
 *
 * Corrections (type "correction") stay out of the catalog: they surface as the
 * one-line pointer on the LATEST SEAL card (see gen-latest-seal.mjs).
 *
 * Env: REGISTRY_ROOT (default: auto-detect — repo root, cwd, or cwd/..; the
 * site lives at <repo>/site, the registry at <repo>/attestations).
 * Wired via package.json "prebuild" and .github/workflows/latest-seal.yml.
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
const REPO_URL = "https://github.com/igor-vii/Argus-Agent-Test-Lab";

/* 1 — verify the whole registry (signatures + hash chain + evidence hashes) */
try {
  const verifyOut = execFileSync("node", [path.join("tools", "registry", "verify-registry.mjs")], {
    cwd: REGISTRY_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  console.log(String(verifyOut).trim());
} catch (err) {
  console.error("\n[SEALS CATALOG] registry verification FAILED — refusing to generate.\n");
  if (err.stdout) console.error(err.stdout);
  process.exit(1);
}

/* 2 — editorial overlay (optional overrides, keyed by seq) */
const overlayPath = path.join(ROOT, "src", "data", "seals-editorial.json");
const overlay = fs.existsSync(overlayPath)
  ? JSON.parse(fs.readFileSync(overlayPath, "utf8"))
  : {};

const toneOf = (verdict) => {
  const v = String(verdict).toUpperCase();
  if (v.startsWith("PASS")) return "pass";
  if (v.startsWith("FAIL")) return "fail";
  if (v.startsWith("HOLD")) return "hold";
  if (v.startsWith("OBSERVED")) return "observed";
  if (v.startsWith("DX")) return "dx";
  return "info";
};

/* 3 — registry → Seal-shaped entries */
if (!fs.existsSync(RECORDS_DIR)) {
  console.error(`[SEALS CATALOG] records dir not found: ${RECORDS_DIR}`);
  process.exit(1);
}
const files = fs.readdirSync(RECORDS_DIR).filter((f) => f.endsWith(".json")).sort();
const entries = [];
let editorialCount = 0;

for (const f of files) {
  const rec = JSON.parse(fs.readFileSync(path.join(RECORDS_DIR, f), "utf8"));
  if (rec.type === "correction") continue; // renders on the LATEST SEAL card, not the catalog

  const raw = {
    seq: rec.seq,
    date: String(rec.issued_at ?? "").slice(0, 10),
    type: rec.type, // "seal" | "finding"
    title: rec.title,
    subject: rec.subject?.repo ?? (typeof rec.subject === "string" ? rec.subject : ""),
    summary: rec.notes ?? "",
    verdicts: (rec.scenarios ?? []).map((s) => ({
      id: s.id,
      verdict: s.verdict,
      tone: toneOf(s.verdict),
    })),
    findings: (rec.findings_summary ?? []).map((x) => ({
      id: x.id,
      severity: x.severity ?? "info",
      text: x.title ?? "",
    })),
    evidence: (rec.evidence ?? []).filter((e) => e.kind === "file" && e.path).length,
    links: [
      {
        label: `record #${rec.seq}`,
        href: `${REPO_URL}/blob/main/attestations/records/${f}`,
      },
    ],
  };

  const ed = overlay[rec.seq];
  if (ed) editorialCount++;
  const merged = ed ? { ...raw, ...ed } : raw;

  /* normalize field order to the Seal interface; drop empty links */
  entries.push({
    seq: merged.seq,
    date: merged.date,
    type: merged.type,
    title: merged.title,
    subject: merged.subject,
    summary: merged.summary,
    verdicts: merged.verdicts,
    findings: merged.findings,
    evidence: merged.evidence,
    ...(Array.isArray(merged.links) && merged.links.length ? { links: merged.links } : {}),
  });
}

/* 4 — write the catalog (deterministic: sorted by filename == seq order) */
const outPath = path.join(ROOT, "src", "data", "seals-catalog.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(entries, null, 2) + "\n");
console.log(
  `[SEALS CATALOG] ${entries.length} entries → ${path.relative(ROOT, outPath)} ` +
    `(${editorialCount} editorial, ${entries.length - editorialCount} registry-derived)`
);
