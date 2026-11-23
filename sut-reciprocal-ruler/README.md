# sut-reciprocal-ruler

Trial-tier evaluation harness for reciprocal-ruler v0.1 (base-buzz/paystage#315),
pre-registered as draft 0029 (`tools/registry/drafts/0029-reciprocal-ruler-quote-lock-reconcile.seal.draft.json`).

- `ruler_trial_battery.py` — checker committed pre-run (RUNBOOK P1). Stdlib only.
- Trial quota: 3 calls per `X-Trial-Client` id; one id per row (`argus-0029-<row>`), all ids disclosed in the run pack.
- Deferred to the paid x402 cycle: A1 (ledger-backed quote-lock determinism) and A7 (third-party recompute over the audit ledger).
- Labeling (verbatim per #315 answer): `SETTLED_OK`/`COMPENSATED` are deterministic arithmetic/policy judgments over caller-attested inputs; the seal asserts run validity, not on-chain finality.

Usage: `python3 sut-reciprocal-ruler/ruler_trial_battery.py --dry-run` (plan only) / without the flag on operator go. Artifacts land in `work/ruler-trial-battery/`, then are pinned into the run pack `attestations/evidence/0029-reciprocal-ruler-trial/`.
