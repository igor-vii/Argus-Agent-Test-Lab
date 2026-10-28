# argus-lab.dev — site

Static-first Next.js landing for **Argus Agent Test Lab**. Deployed on Vercel
with **Root Directory = `site`** — the Vercel build runs inside this folder while
the attestation registry it renders from lives one level up (`../attestations/`)
in the same checkout.

## Build-time seal injection (no client-side fetch)

`package.json → "prebuild": "node scripts/gen-latest-seal.mjs"` runs before every
build and does two things:

1. **Verifies the whole registry** (`node tools/registry/verify-registry.mjs` —
   Ed25519 signatures + hash chain + evidence hashes). Any failure exits non-zero
   and the **build turns red**. CI-as-verification: a tampered seal is a publicly
   observable failed deployment, never a silent UI.
2. **Renders the newest record** into `src/data/latest-seal.json`, which
   `src/components/latest-seal.tsx` (server component) turns into static,
   indexable HTML. GPTBot / ClaudeBot / PerplexityBot do not execute JS — the
   LATEST SEAL block must exist in the served HTML, hence build-time, hence here.

## Scripts

| command | what it does |
|---|---|
| `npm run dev` | local dev server |
| `npm run build` | prebuild (verify registry → latest-seal.json) + `next build` |
| `npm run gen:og` | regenerate `public/og-cover.png` from the verified registry (needs `sharp`, included) |

`REGISTRY_ROOT` env overrides the registry location (defaults: repo root, cwd,
or `cwd/..` — whichever contains `attestations/records`).

## Deploy

- **Vercel**: import `igor-vii/Argus-Agent-Test-Lab`, set **Root Directory = `site`**,
  framework Next.js (auto-detected). Every push to `main` re-verifies the registry
  and redeploys.
- Domain: `argus-lab.dev` (+ `www` → apex redirect), DNS per Vercel dashboard.

## Content sources

- `src/lib/lab-data.ts` — public facts (registry, contacts, one-pager path). Every
  entry must mirror a sealed record; do not invent numbers.
- `public/` — brand pack (favicon set, `og-cover.png`, `logo.svg`), `llms.txt`,
  `robots.txt`, `argus-lab-onepager.pdf`.
- Palette (owner-final, 2026-10-28): bg `#070B0A`, panels `#1C2B26`, text `#D7E5DE`,
  muted `#5C7168`; accent `#34D399` reserved for statuses/verdicts and the sign pupil.
