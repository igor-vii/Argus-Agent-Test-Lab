# Argus Agent Test Lab — public proof layer

[![latest-seal](https://github.com/igor-vii/Argus-Agent-Test-Lab/actions/workflows/latest-seal.yml/badge.svg)](https://github.com/igor-vii/Argus-Agent-Test-Lab/actions/workflows/latest-seal.yml)

**AI Agent Testing & Reliability** · [argus-lab.tech](https://argus-lab.tech)

This repository is the **public proof layer** of Argus: the sealed, hash-chained
evidence registry, the verification tooling, and the source of
[argus-lab.tech](https://argus-lab.tech). It exists so that every public claim
the lab makes can be checked by anyone, without trusting anyone:

```bash
git clone https://github.com/igor-vii/Argus-Agent-Test-Lab
cd Argus-Agent-Test-Lab
node tools/registry/verify-registry.mjs
# → registry intact: N records, chain head …
```

Verification uses only the Node.js standard library — no `npm install`, no
network access, no trust in this README.

## What is sealed here

Records in `attestations/records/` are Ed25519-signed and hash-chained
(`prev_record_hash` → chain head). Each record pins the sha256 of its evidence
files. A seal attests run validity and findings completeness — never
bug-freeness.

- [`attestations/INDEX.md`](attestations/INDEX.md) — human-readable index
- [`attestations/records/`](attestations/records) — the signed records
- [`attestations/keys/`](attestations/keys) — public key `argus-lab-2026q4r2`
- CI (`.github/workflows/latest-seal.yml`) re-verifies the whole registry on
  every push; a tampered or broken seal turns the build red, publicly.

## Repository boundary (record 0013)

As of sealed record **#0013**, the **product layer** — the testing engine,
scenario library, SUT harnesses, rail adapters and engagement archives — is
developed in a private repository. The public repository retains the proof
layer only. The exact moment of the split and the last public snapshot are
themselves sealed and hash-pinned:

- Record: `argus-seal-0013` (see [`attestations/records/`](attestations/records))
- Manifest: [`attestations/evidence/0013-boundary/product-layer-manifest.json`](attestations/evidence/0013-boundary/product-layer-manifest.json)
  — sha256 of every file that moved, pinned at the last public snapshot
  `efbf51ef8604040c74aa1d40593af9a08fa553de`

The split is forward-only: no history rewrite, no force-push. Versions up to
the snapshot commit remain public history, and everything referenced from
public threads (e.g. `docs/block-b/fixtures/S-BS-06/` on branch
`block-b/v1-scenarios`, referenced from x402 issue #3866) stays public and
byte-identical. Sealed evidence paths pinned by records #0000–#0012 are
permanent and were retained.

## Repository layout

```
attestations/        signed, hash-chained records + public key + index
tools/registry/      sign / verify tooling (node stdlib only)
tools/paypal-adapter/evidence/   sealed live-run evidence (records 0001–0002)
site/                argus-lab.tech source (Next.js; prebuild re-verifies the registry)
docs/block-b/        sealed fixtures and evidence (S-BS series, records 0003+)
docs/inngest-battery/  sealed evidence + repro harness (record 0005)
docs/t1-mcp-tool-idempotency/  sealed external verification (record 0009)
sut-x402-pr3920/     sealed SUT evidence, x402 PR #3920 cycles (records 0008, 0012)
src/tests/blockb/SBS19_BlockRunNano.test.ts   sealed evidence (record 0006)
.github/             CI: verify registry → OG cover → IndexNow → Vercel deploy
```

## About Argus

Argus is an independent black-box testing laboratory for AI agents and
agent-based payment systems. It runs controlled failure scenarios against
observable systems under test (SUTs), captures evidence at protocol
boundaries, evaluates explicit assertions, and produces evidence-backed
verdicts — the public ones are the sealed records above.

**Agent → Scenario → SUT → Evidence → Verdict**

- Sealed case work: x402 (#3866, PR #3920), Inngest (#5091), BlockRun
  (blockrun-nano-client #18), Nevermined, mcp-tool-idempotency
- Commercial engagements (scenario conformance runs, release verification):
  [argus-lab.tech](https://argus-lab.tech)

Argus lives in a repository separate from the systems it tests and interacts
with SUTs through defined external interfaces and observable behavior only.

## Status

Public case studies and production-capability claims are added only when
supported by verified run evidence — the registry is the source of truth, not
this README.
