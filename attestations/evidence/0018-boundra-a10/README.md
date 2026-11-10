# Evidence stand 0018 — boundra-a10

Pre-registered A10a/A10b identical-offer race (x402 #4198, Run №1) against the
Boundra candidate, executed on the unchanged S-BS-06 harness.

- Candidate pin: boundra @ `fb09284434b85f824b099ade4430e1b77b4c4086` (PR boundra#2 excluded)
- Harness (constant): `sut-x402-pr3920/battery-pr3920-c3.mjs` + `client_v5.ts` — unmodified
- Adapter: `sut-boundra-a10/` (minimal HTTP↔Python wrapper over the pinned Gateway+SpendLedger)
- Fixture: `docs/block-b/fixtures/S-BS-06/s-bs-06-boundra-a10.fixture.json`
- Registry draft: `tools/registry/drafts/0018-s-bs-06-boundra-a10-fb09284-identical-offer-race-a10a-a10b-10-10-pass.seal.draft.json` (pending offline signature)

## Contents

Published:

- `export-hashes.json` — export manifest v1: sha256 of every artifact exported from the run
- `manifest.sha256` — publication-time sha256 of ALL stand files, both public and kept-private
- `runs/<session>.stand.json` — S-BS-06 stand verdict output (`--json`): scenario verdicts, counters, timings
- `runs/<session>.jsonl.summary` — PROBE_SUMMARY: signer_call_count, per_slot, per_cycle

Kept private (hash-pinned in both manifests above, not published):

- `runs/<session>.jsonl` — client event ledger (raw session transcript)
- `runs/<session>.adapter.jsonl` — transport-only adapter verdict log (raw)
- `runs/<session>.state/` — per-session fresh reservation state (audit.jsonl + spend.db, wallet/ledger materials)

Sessions: `als_preflight` + 5 cases × 2 modes (`b_a10a_*`, `b_a10b_*`).

Raw session transcripts, adapter logs and per-run state stay private per boundary
#0013; their sha256 pins travel with this stand.

run wallet keys burned, not published
