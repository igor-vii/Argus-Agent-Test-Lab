# Argus External Subject Test Report

**Status:** Evidence report — not a production certification  
**Date:** 2026-10-07  
**Argus baseline:** `e7bba2aa62cacaf2d2377826797e90ef00c0235c`  
**Evidence package:** PR #60, head `8aac0097a5e183c0c714476ba4788428e1e8dbfe`  
**Canonical Argus source modified for this report:** No

## 1. Purpose

This report records black-box experiments against three external agent/payment systems or boundaries:

1. ClawRouter — client/payer reaction to an x402 resource server.
2. Franklin — autonomous agent/payer source audit; dynamic execution was blocked by the available test harness/environment.
3. BlockRun boundary — deterministic local x402 mock resource server exercised through the canonical Argus pipeline.

The purpose is to record observable reactions at the payment → execution → outcome boundary and distinguish what Argus deliberately did, what the SUT exposed, what evidence was observable, and what the current assertion actually tested.

## 2. Black-box test model

Argus is an adversarial tester:

NaN

Argus may deliberately create incorrect, adverse, repeated, delayed, or incomplete conditions. A technical failure returned by the Argus engine therefore does not automatically mean Argus failed its own task.

The interpretation chain is:

NaN

Hidden mock-server ledger state is experimental ground truth only; it is not treated as evidence available to a real black-box tester.

## 3. Provenance

| Subject | Revision / provenance | Method |
| --- | --- | --- |
| Argus | `e7bba2aa62cacaf2d2377826797e90ef00c0235c` | canonical source, unmodified |
| ClawRouter | `b758e036bbd1290c0997ad14c9812a106ef8d72b` | dynamic CR1–CR6 run |
| Franklin | `ef942bd1519b318fac21900e1619ef2a945caa92` | static source audit; dynamic run blocked |
| BlockRun boundary | local deterministic mock, modes A–F | canonical Argus pipeline |

No mainnet funds were used. The experiments used a throwaway local EVM key and mock settlement/signing boundaries.

## 4. ClawRouter findings

### CR1 — startup / health
Startup completed and the health endpoint was verified.

### CR2 — API-key rail
The gateway returned HTTP 402 with an x402 error body. ClawRouter passed the 402 through to the caller. No payment was recorded.

NaN

### CR3 — wallet/x402 payment dance
Observed sequence: `402 → payment signed on Base/EVM → PAYMENT-SIGNATURE retry → 200`. The payment response was consumed and the mock ledger recorded payment/execution.

NaN

### CR4 — timeout after payment
After payment had already been signed and recorded, the test gateway did not return a normal response. ClawRouter eventually surfaced a generic `TypeError: fetch failed` with `Premature close` after approximately five minutes.

NaN

NaN

### CR5 — execution failure after payment
The resource server returned HTTP 500 with execution/payment identifiers in the response body. ClawRouter relayed the HTTP 500.

NaN

### CR6 — repeated paid request
Two sequential paid requests resulted in two payments and two independent executions. No idempotency key was present in the observed requests.

NaN

NaN

## 5. Franklin findings

Franklin was inspected at revision `ef942bd1519b318fac21900e1619ef2a945caa92`.

The static audit identified source-level payment reactions including 402 → sign → retry behavior, explicit handling of unexpected 402 responses, spending/account invariants, and provider-specific retry behavior.

NaN

NaN

No dynamic behavioral verdict is issued for Franklin.

## 6. BlockRun boundary findings

The deterministic mock resource server was exercised through the real canonical Argus path:

NaN

### P3 — happy path
Payment accepted, execution completed, response delivered. **Canonical result: PASS.**

### S1 — execution becomes silent
Payment accepted; execution started; no response was returned. **Canonical result: FAIL (timeout).** This is a technical interaction result under the current S8 assertion, not by itself a claim that the resource server definitively failed its economic obligation.

### S2 — response lost after execution
Payment accepted; the mock execution completed; the response was deliberately destroyed before reaching the client. **Canonical result: FAIL (timeout).** Hidden ledger ground truth confirms completion, but completion is not black-box evidence available to Argus.

NaN

The current assertion maps terminal timeout to FAIL because it asks whether the buyer-side interaction completed. It does not answer whether the SUT completed the underlying economic obligation.

NaN

### S3 — explicit execution failure
Payment accepted; execution failed; HTTP 500 returned. **Canonical result: FAIL.** This is the cleanest case where the observed response itself exposes an explicit execution failure.

### S4 — retry after unknown outcome
Attempt 1 ended without a usable response. Argus then intentionally retried. The mock recorded two payments and two executions. Attempt 1: FAIL/transport outcome. Attempt 2: PASS/delivered response.

NaN

### S5 — idempotent replay control
Two requests used the same idempotency key. The second response was marked `replayed:true` and referenced the same execution. Hidden ground truth: two payment records, one execution.

NaN

### EXTRA[1] — 402 evidence plumbing
The adapter raw exchange metadata contained `http_response_received` + `payment_required_received` with HTTP 402 and parsed payment-required state. Canonical Evidence did not retain `payment_required_received`; only `payment_required_no_resolver` survived the ScenarioEngine early-return path.

NaN

### EXTRA[3] — duplicate execution assertion scope
Two independent runs used the same idempotency key against the non-idempotent mock mode. Both runs received PASS, while the hidden ledger recorded two payments and two executions. The response body itself contained distinct execution IDs.

NaN

NaN

## 7. Cross-cutting findings

### 7.1 Technical status is not the final economic verdict
The current Argus engine can legitimately emit conventional statuses such as COMPLETED, FAILED, TIMEOUT and transport failure. For adversarial testing, those statuses describe the test interaction. They do not necessarily describe whether the SUT fulfilled its economic contract.

The higher-level interpretation should preserve action context and evidence before producing a client-facing conclusion.

### 7.2 Settlement was not proven
No on-chain settlement observation was established in these runs.

NaN

### 7.3 computeB6BVerdict() is not part of the canonical verdict path
The report-only B6B model produced UNKNOWN even for the happy path because its vocabulary does not match evidence emitted by the canonical engine. It is a parallel/dead verdict model in this experiment.

NaN

## 8. Findings classification

| Finding | Classification | Action now |
| --- | --- | --- |
| 402 observation dropped at PAYMENT_REQUIRED early return | Evidence plumbing gap | record; repair later |
| S2 timeout despite hidden completed execution | Assertion/test-scope limitation | define better assertion later |
| S4 duplicate economics after unknown retry | SUT/mock behavior intentionally elicited | retain as test scenario |
| S5 safe replay | positive control | retain |
| DUP passes despite duplicate execution | Missing idempotency assertion | add targeted test later |
| Settlement not observed | Black-box boundary | no defect claim |
| B6B verdict diverges | Architecture debt / parallel model | do not wire now |
| Franklin dynamic run blocked | Harness/environment limitation | no behavioral verdict |
| ClawRouter CR4 generic fetch failure after payment | External reaction finding | retain with timing limitation |
| ClawRouter CR6 new paid execution on repeat | External reaction finding, limited by absent idempotency identity | retain without overclaim |

## 9. Overall conclusion

The experiments demonstrate that Argus can already perform meaningful adversarial black-box testing without embedding the economic semantics of the SUT into its Core.

The strongest evidence is not that Argus can label a timeout as a particular economic state. It is that Argus can deliberately create an adverse condition, preserve the observable reaction, and expose where the tested system's externally visible behavior differs from the expected contract.

NaN

No Core rewrite, B6B integration, or economic-semantics engine is justified by this evidence package alone.