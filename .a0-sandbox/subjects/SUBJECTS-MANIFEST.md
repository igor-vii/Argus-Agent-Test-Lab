# Argus External Subject Evidence — Index

**Purpose:** primary evidence artifacts from the A0/A1 external black-box experiments.  
**Argus baseline:** `e7bba2aa62cacaf2d2377826797e90ef00c0235c`  
**Status:** evidence-only package; canonical `src/` unchanged.

## ClawRouter
- `clawrouter/CLAWROUTER_probe.json`
- `clawrouter/clawrouter-probe.log`
- `clawrouter/mock-gateway-claw.log`
- Upstream clone: `b758e036bbd1290c0997ad14c9812a106ef8d72b`

Dynamic CR1–CR6 evidence. Key observations: wallet/x402 payment flow completed; after payment the timeout case surfaced a generic fetch failure; repeated paid requests produced separate executions, with no idempotency key observed in the probe.

## Franklin
- `franklin/franklin-static-audit.md`
- `franklin/franklin-install.log`
- `franklin/franklin-build.log`
- Upstream clone: `ef942bd1519b318fac21900e1619ef2a945caa92`

Static audit plus install/build evidence. Dynamic testing against the local mock was blocked by hardcoded upstream hosts and is classified as a harness/environment limitation.

## BlockRun mock resource server
Raw scenario evidence:
- `blockrun/P3_HAPPY_PATH.json`
- `blockrun/S1_TIMEOUT.json`
- `blockrun/S2_RESPONSE_LOST.json`
- `blockrun/S3_EXEC_FAILURE.json`
- `blockrun/S4_RETRY_AFTER_UNKNOWN.json`
- `blockrun/S5_IDEMPOTENT_RETRY.json`
- `blockrun/EXTRA.json`
- `blockrun/full-run.log`
- `blockrun/extra.log`
- `blockrun/mock-gateway.log`

Key evidence:
- S2: payment accepted and mock execution completed, but response was lost; Argus observed timeout. NO RECEIPT ≠ PROVEN FAILURE.
- S4: retry after unknown outcome produced a second payment and second execution; the retry was deliberate test action.
- S5: same idempotency key replayed safely to the same execution.
- EXTRA: initial HTTP 402 was observed upstream but `payment_required_received` was dropped at the ScenarioEngine early-return boundary.
- DUP in EXTRA: two paid executions under the same idempotency key while current S8 passed both; assertion-scope finding, not evidence of an Argus engine defect.

## Reading rule

Interpret every run through:

**ACTION → TECHNICAL OUTCOME → OBSERVABLE EVIDENCE → ASSERTION → TEST CONCLUSION**

Hidden mock-ledger state is experimental ground truth only; it is not treated as black-box evidence available to Argus.

## Deliberately excluded

Harness source, disposable mock-server source, duplicate root copies, generated dependencies, and other execution scaffolding are intentionally excluded. The files retained in this branch are the confirmation/evidence record.