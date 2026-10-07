# A1 — External Subjects Manifest (ClawRouter / Franklin / BlockRun)

Focus of this package: **how the external agents react** at the payment → execution → outcome
boundary. Argus engine internals are documented separately in ../runs/MANIFEST.md.

Provenance SHAs:
- Argus baseline: e7bba2aa62cacaf2d2377826797e90ef00c0235c (canonical src unmodified)
- ClawRouter clone: b758e036bbd1290c0997ad14c9812a106ef8d72b (unmodified upstream)
- Franklin clone: ef942bd1519b318fac21900e1619ef2a945caa92 (unmodified upstream)
  (note: supersedes earlier-recorded eebfb7c9…; ef942bd is the actual HEAD of the clean clone used)
- No mainnet funds used anywhere. Throwaway local EVM key, mock settlement only.

## clawrouter/ — DYNAMIC RUN COMPLETED (exit 0, CR1–CR6 all executed)
Wire format: real x402 v2 header scheme (PAYMENT-REQUIRED / PAYMENT-SIGNATURE /
PAYMENT-RESPONSE), ClawRouter @b758e03 vendored @x402/fetch against mock-gateway-claw.mjs (:8766).
Observed CLIENT reactions (raw evidence: CLAWROUTER_probe.json):
- CR1 startup OK; api-key mode reported; health endpoint verified.
- CR2 api-key rail: passes through gateway 402 body `{"x402Version":2,"error":"X-PAYMENT header is required"}`
  to client as HTTP 402. Ledger empty. NOTE recorded: do NOT infer wallet-rail behavior from this path.
- CR3 wallet/x402 dance: 402 → signs "Payment signed on Base (EVM) (eip155:84532) — $0.010000" →
  retries with PAYMENT-SIGNATURE → 200 + artifact + PAYMENT-RESPONSE consumed. Ledger: pay_1/exec_1.
- CR4 timeout-after-payment (mode B): ClawRouter waited ~300 s, then surfaced
  `TypeError: fetch failed` ("Premature close") to its caller. Payment was already signed+recorded.
  REACTION FINDING: no client-visible distinction between "paid but timed out" and plain transport error.
- CR5 execution-failure-after-payment (mode D): ClawRouter transparently relays HTTP 500 with
  executionId/paymentId in body. Payment retained by seller. REACTION: passthrough, no refund logic visible.
- CR6 retry (same user action, sequential requests): produced pay_1+exec_1 AND pay_2+exec_2 —
  two independent economic executions. No idempotency key present in any ClawRouter request.
  REACTION FINDING: retries are new economic actions at the payer side too.
Reproduce: run-clawrouter-probe.sh (needs node 22, clone at b758e03, npm i; probe = clawrouter-probe.mts).

## franklin/ — STATIC AUDIT ONLY; dynamic run BLOCKED (documented, not hidden)
franklin-static-audit.md records source-level reactions (proxy/server.ts 402→sign→retry;
trading/providers/blockrun/client.ts free-path refuses unexpected 402; fallback.ts invariants incl.
BlockRun's own probe note that Base settles image-to-text-only retries before upstream rejection).
BLOCKER: x402 host URLs hardcoded (config.ts KEY_API_URL); no env override → pointing at local mock
would require patching upstream clone (prohibited). Classified HARNESS/ENVIRONMENT limitation.
franklin-install.log / franklin-build.log: dependency install + tsc build evidence for reproducibility.

## blockrun/ — canonical Argus-pipeline runs vs mock x402 boundary (modes A–F)
Raw JSON per scenario + full-run.log + extra.log + mock-gateway.log.
Reaction summary of the resource-server under test (ground truth via /__ledger):
- P3 happy: pay=1 exec=completed → engine PASS.
- S1 timeout: pay accepted, exec started, silent → engine FAIL('timeout').
- S2 lost-response: pay accepted, exec COMPLETED internally, response destroyed → engine FAIL('timeout');
  server-side completion invisible black-box (expected boundary, NO RECEIPT ≠ PROVEN FAILURE).
- S3 failure: pay accepted, exec failed, explicit 500 → engine FAIL('failure') (correct SUT attribution).
- S4 retry-after-unknown: second attempt pays AGAIN (pay=2, exec_1+exec_2) → duplicate economics observed.
- S5 idempotent (mode F): replayed:true, same exec_1, no second execution → safe-retry shape confirmed.
- EXTRA[1]: adapter observes payment_required_received (HTTP 402 parsed) but ScenarioEngine early-return
  drops it from canonical evidence (only payment_required_no_resolver survives) — evidence plumbing gap.
- EXTRA[3] DUP mode A: same idempotencyKey → two payments/two executions, both runs PASS under current
  assertion — assertion-scope finding, not engine fault.

## Reading rules (contract)
- FAIL verdict = "SUT violated the assertion as written", never "Argus broke".
- Where ground truth is not externally observable (S2 completion, settlement), the package states
  NOT OBSERVED / NOT PROVEN instead of interpreting.
- Cross-run duplicate detection across independent processes: NOT CLAIMED (out of scope).
