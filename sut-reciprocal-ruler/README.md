# sut-reciprocal-ruler

Trial-tier evaluation harness for reciprocal-ruler (base-buzz/paystage#315),
pre-registered as draft 0029 (`tools/registry/drafts/0029-reciprocal-ruler-quote-lock-reconcile.seal.draft.json`).

- `ruler_trial_battery.py` — checker committed pre-run (RUNBOOK P1). Stdlib only.
- Trial quota: 3 calls per `X-Trial-Client` id; one id per row (`argus-0029-<row>`), all ids disclosed in the run pack.
- Deferred to the paid x402 cycle: A1 (ledger-backed quote-lock determinism) and A7 (third-party recompute over the audit ledger).
- Labeling (verbatim per #315 answer): `SETTLED_OK`/`COMPENSATED` are deterministic arithmetic/policy judgments over caller-attested inputs; the seal asserts run validity, not on-chain finality.

Usage: `python3 sut-reciprocal-ruler/ruler_trial_battery.py --dry-run` (plan only) / without the flag on operator go. Artifacts land in `work/ruler-trial-battery/`, then are pinned into the run pack `attestations/evidence/0029-reciprocal-ruler-trial/`.

## v0.2 A0 battery (freeze-0030, draft 0030)

- `ruler_a0_battery.py` — checker for the agreed A0 free battery (#315 comment
  7101307979: persist → replay 200 → intent-mismatch 409 → 403/404 receipt
  handling → overpayment pair 0.1.0/0.2.0 → /health). Stdlib only, committed
  pre-run (RUNBOOK P1). Usage: `python3 sut-reciprocal-ruler/ruler_a0_battery.py
  --dry-run` (plan only) / without the flag on operator go. Artifacts land in
  `work/ruler-a0-battery-0030/`, then are pinned into the run pack
  `attestations/evidence/0030-reciprocal-ruler-v02-a0/`.
- `freeze-0030.signed.json` — the freeze wrapper: draft 0030 nested verbatim +
  detached Ed25519 signature by the agent session key
  `argus-agent-session-20261121-migration` over canonical(draft); pubkey at
  `attestations/agent/keys/`. Canonical sha256 of the wrapper (prereg hash):
  `786f04ee24cca3ad631d30ded106339be028752383a162d639d0d9726110fec6`.
- `recon-v02/` — pre-freeze recon snapshots (sha256s pinned in the draft):
  /health, /.well-known/x402, /openapi.json captured 2026-11-24T04:31Z.
- Pin commit `75867aa` is pinned as declared in #315 comment 7101307979; it is
  not resolvable via the public GitHub API (service source repo appears
  private) — the verifiable pin is the recon snapshot set plus live /health.
- Budget: $0.00. Quota: `argus-0030-a0c1` 3 POST, `argus-0030-a0c2` 2 POST;
  GET /v1/ledger reads are free per the author's spec.
