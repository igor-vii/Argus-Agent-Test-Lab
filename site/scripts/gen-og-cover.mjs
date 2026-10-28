/**
 * OG cover generator — reads the VERIFIED registry, renders public/og-cover.png (1200×630).
 * Numbers are pulled from the registry itself (record count + chain head after verify),
 * so the cover can never drift from attestations/records.
 *
 * Env: REGISTRY_ROOT (default: auto-detect — repo root, cwd, or cwd/..).
 * Run locally: npm run gen:og   (inside site/)
 * In CI: node site/scripts/gen-og-cover.mjs from the repo root (latest-seal job).
 * Output is always <site>/public/og-cover.png regardless of cwd.
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const SITE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))); /* …/site */

function resolveRegistryRoot() {
  if (process.env.REGISTRY_ROOT) return process.env.REGISTRY_ROOT;
  for (const base of [ROOT, path.join(ROOT, ".."), path.join(ROOT, "repo")]) {
    if (fs.existsSync(path.join(base, "attestations", "records"))) return base;
  }
  return path.join(ROOT, "repo");
}

const REGISTRY_ROOT = resolveRegistryRoot();

/* 1 — verify first; a red registry must never produce a cover */
const out = execFileSync("node", [path.join("tools", "registry", "verify-registry.mjs")], {
  cwd: REGISTRY_ROOT,
  encoding: "utf8",
});
console.log(out.trim());

const headMatch = out.match(/chain head ([0-9a-f]{16})/);
const countMatch = out.match(/(\d+) records/);
if (!headMatch || !countMatch) {
  console.error("cannot parse verify output");
  process.exit(1);
}
const HEAD = headMatch[1];
const COUNT = countMatch[1];

/* 2 — render */
const P = {
  bg: "#070B0A",
  panel: "#1C2B26",
  text: "#D7E5DE",
  muted: "#5C7168",
  accent: "#34D399",
  ink: "#E9E7E2",
  bright: "#F2F4F1",
};
const MONO = '"DejaVu Sans Mono"';
const SANS = '"DejaVu Sans"';

const sign = `
  <path d="M14 50 L32 12 L50 50" stroke="${P.ink}" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M22 34.5 Q32 26 42 34.5 Q32 43 22 34.5 Z" fill="none" stroke="${P.ink}" stroke-width="3"/>
  <circle cx="32" cy="34.5" r="3.4" fill="${P.accent}"/>`;

const W = 1200, H = 630;
const grid = `
    <defs>
      <pattern id="g" width="56" height="56" patternUnits="userSpaceOnUse">
        <path d="M56 0 H0 V56" fill="none" stroke="${P.panel}" stroke-width="1" opacity="0.55"/>
      </pattern>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>`;

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${P.bg}"/>
  ${grid}
  <!-- wordmark -->
  <g transform="translate(72,54) scale(${44 / 64})">${sign}</g>
  <text x="132" y="86" font-family=${MONO} font-size="22" letter-spacing="6" fill="${P.bright}">ARGUS·LAB</text>
  <text x="1128" y="86" text-anchor="end" font-family=${MONO} font-size="14" letter-spacing="2" fill="${P.muted}">argus-lab.tech</text>
  <!-- pre-domain placeholder (until 2026-10-29): "adversarial verification · x402" -->
  <line x1="72" y1="118" x2="1128" y2="118" stroke="${P.panel}" stroke-width="1"/>
  <!-- headline -->
  <text x="72" y="252" font-family=${SANS} font-size="70" font-weight="bold" fill="${P.bright}">We sign our findings,</text>
  <text x="72" y="338" font-family=${SANS} font-size="70" font-weight="bold" fill="${P.bright}">not our opinions.</text>
  <text x="72" y="394" font-family=${SANS} font-size="23" fill="${P.muted}">Black-box adversarial batteries against the SDKs that move agentic money —</text>
  <text x="72" y="426" font-family=${SANS} font-size="23" fill="${P.muted}">x402 payment flows, credit and settlement handling, idempotency guarantees.</text>
  <!-- footer: registry facts -->
  <line x1="72" y1="478" x2="1128" y2="478" stroke="${P.panel}" stroke-width="1"/>
  <text x="72" y="526" font-family=${MONO} font-size="23" fill="${P.text}">chain head ${HEAD.slice(0, 8)}…</text>
  <text x="352" y="526" font-family=${MONO} font-size="23" fill="${P.muted}">·</text>
  <text x="386" y="526" font-family=${MONO} font-size="23" fill="${P.text}">${COUNT} records</text>
  <text x="556" y="526" font-family=${MONO} font-size="23" fill="${P.muted}">·</text>
  <text x="590" y="526" font-family=${MONO} font-size="23" fill="${P.text}">Ed25519</text>
  <text x="754" y="526" font-family=${MONO} font-size="23" fill="${P.muted}">·</text>
  <text x="788" y="526" font-family=${MONO} font-size="23" fill="${P.accent}">verify in one command</text>
  <text x="72" y="572" font-family=${MONO} font-size="17" fill="${P.muted}">$ node tools/registry/verify-registry.mjs</text>
  <text x="1128" y="572" text-anchor="end" font-family=${MONO} font-size="17" fill="${P.muted}">github.com/igor-vii/Argus-Agent-Test-Lab</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(path.join(SITE_ROOT, "public", "og-cover.png"));
/* local convenience: keep the brand package in sync; in CI (fresh checkout)
   download/argus-brand does not exist — the cover in site/public/ is what ships. */
const brandDir = path.join(REGISTRY_ROOT, "..", "download", "argus-brand");
if (fs.existsSync(path.join(REGISTRY_ROOT, "..", "download"))) {
  fs.mkdirSync(brandDir, { recursive: true });
  fs.writeFileSync(path.join(brandDir, "og-cover.png"), await sharp(Buffer.from(svg)).png().toBuffer());
  console.log("brand copy synced → download/argus-brand/og-cover.png");
}
console.log(`og-cover.png written — head ${HEAD}, ${COUNT} records`);
