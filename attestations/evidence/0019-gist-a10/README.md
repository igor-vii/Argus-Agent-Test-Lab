# Evidence stand 0019 — gist-a10

Pre-registered A10a/A10b identical-offer race (x402 #4198, Run №2) against the
pinned gist candidate (pre-sign owner fence), executed on the unchanged
S-BS-06 harness.

- Candidate pin: gist `e319a833` @ `df69c25fac01f68f6b71981e57b71699c12fd1b2` (gist FILE itself unmodified; file sha256 recorded in the fixture)
- Harness (constant): `sut-x402-pr3920/battery-pr3920-c3.mjs` + `client_v5.ts` — unmodified
- Adapter: `sut-gist-a10/` (v5-boundary client + sidecar server over the pinned gist runner)
- Fixture: `docs/block-b/fixtures/S-BS-06/s-bs-06-gist-a10.fixture.json`
- Registry draft: `tools/registry/drafts/0019-s-bs-06-gist-a10-df69c25-owner-fence-identical-offer-race-10-10-pass.seal.draft.json` (pending offline signature)

## Contents

Published:

- `export-hashes.json` — export manifest v1: sha256 of every artifact exported from the run
- `manifest.sha256` — publication-time sha256 of ALL stand files, both public and kept-private
- `gist-runner-scaffold.package.json` — runner scaffold manifest (dependency pins of the run environment)
- `runs/<session>.stand.json` — S-BS-06 stand verdict output (`--json`): scenario verdicts, counters, timings
- `runs/<session>.jsonl.summary` — PROBE_SUMMARY: signer_call_count, per_slot, per_cycle

Kept private (hash-pinned in both manifests above, not published):

- `runs/<session>.jsonl` — client event ledger (raw session transcript)
- `runs/<session>.sidecar.jsonl` — transport-only sidecar log (raw `reserve()` decisions)
- `runs/<session>.state/` — per-session fresh fence root (immutable reservation records)
- `layer1-verbatim-run.log` — Layer 1 verbatim gist run console log (raw stdout)

Sessions: `als_preflight` + 5 cases × 2 modes (`g_a10a_*`, `g_a10b_*`).

Raw session transcripts, sidecar logs and per-run state stay private per boundary
#0013; their sha256 pins travel with this stand.

run wallet keys burned, not published
