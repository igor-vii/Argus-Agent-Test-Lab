# Argus External Black-Box Test Protocol

**Protocol status:** working v1.0  
**Date:** 2026-10-07  
**Reference evidence:** PR #60 (`8aac0097...`)

## 1. Objective

Determine how an opaque system under test (SUT) behaves when exposed to deliberately adverse, incorrect, repeated, delayed, or incomplete interactions.

The protocol answers: what did the tester deliberately do, what did the SUT externally expose, what evidence exists, and did that response satisfy the predefined test assertion?

The protocol does not require Argus to understand the SUT's internal economic semantics.

## 2. Black-box boundary

The SUT is treated as opaque.

Permitted evidence includes HTTP/API responses, protocol observations, payment headers or public payment responses, execution identifiers returned externally, externally visible timing/transport outcomes, and other public economic evidence explicitly exposed by the SUT.

Not permitted as production-test evidence: SUT database state, private internal queues, hidden execution state, internal logs unavailable to the external tester, or mock-server ground truth presented as if it were observed from the SUT.

A harness may use hidden ground truth to validate the experiment itself. Such ground truth must be labelled separately.

## 3. Tester behavior

Argus is an adversarial tester, not a normal participant.

NaN

### ATTACK
Argus may intentionally withhold a resource, send malformed/invalid protocol input, terminate a connection, cause a timeout, retry after an unresolved result, replay an idempotency key, repeat a paid request, provide an invalid signature, or otherwise create a predefined adverse condition.

The fact that the tester causes a failure is not itself a tester failure.

### OBSERVE
Record only externally observable behavior.

### RECORD
Preserve enough context to associate scenario, exact tester action, technical outcome, external response/evidence, and identifiers/timing where available.

### ASSERT
Evaluate the predefined SUT contract. The assertion must state what the SUT is expected to do, not merely what Argus's transport engine calls the result.

## 4. Interpretation layers

| Layer | Question |
| --- | --- |
| Argus action | What did the tester intentionally do? |
| Technical outcome | What happened to the interaction? |
| Observable evidence | What facts did the SUT expose? |
| Assertion | What behavior was expected? |
| Test conclusion | Did the SUT satisfy that assertion? |

Example: Argus deliberately causes a response to be lost after payment. Technical outcome = timeout. Observable evidence = payment response plus no response body. Hidden ground truth may show execution completed, but that is not black-box evidence. The conclusion is determined by the externally observable contract and assertion.

## 5. Verdict rules

### PASS
The observed SUT behavior satisfies the predefined assertion.

### FAIL
The observed SUT behavior violates the predefined assertion. A FAIL must never be described merely as “Argus failed.”

### INCONCLUSIVE / NOT PROVEN
Use when available black-box evidence is insufficient to establish the required fact.

### NOT OBSERVED
Use when a fact is outside the observation boundary.

Do not convert absence of evidence into PROVEN_FAILURE.

## 6. Technical outcome vs SUT verdict

A technical engine may produce timeout, transport failure, HTTP 500, or completed response. These are interaction outcomes, not automatically economic conclusions.

NaN

NaN

NaN

## 7. Scenario design

Each scenario should specify:

1. Scenario ID
2. SUT role
3. Tester role
4. Preconditions
5. Intentional adverse action
6. Expected SUT behavior
7. Observable evidence required
8. Technical outcomes that may occur
9. Assertion
10. Verdict rule
11. Known observation limitations

## 8. Retry and idempotency testing

Retries are first-class adversarial actions. Argus must not suppress a retry merely because it may cause duplicate economics when the purpose is to test whether the SUT handles the retry safely.

Two properties must be tested separately:

- **Safe replay:** same idempotency identity → same economic execution / replay response.
- **Duplicate execution:** repeated economic request → multiple executions.

A generic “request completed” assertion is insufficient to prove idempotency.

## 9. Evidence integrity

Evidence should be traceable to scenario ID, action, timestamp/order, source, raw or normalized response, and relevant identifiers.

If an observation exists in an adapter/exchange layer but disappears before EvidenceCollector, classify it as an **evidence plumbing gap**.

Do not repair such a gap by introducing semantic inference into Core.

## 10. Ground truth policy for deterministic mocks

Mock gateways may expose a private ledger to the experiment harness. The ledger answers whether the mock actually did what the test author intended.

It must not be represented as black-box evidence.

Reports must distinguish:

- **Observed by Argus**
- **Known by test harness**
- **Not observed**

This is mandatory for claims such as “execution completed after response loss.”

## 11. Settlement claims

Unless settlement is independently observed through a permitted public mechanism, the report must state:

NaN

A payment header, signed authorization, or HTTP success response is not by itself proof of on-chain settlement.

## 12. Reproducibility

Every published test package should include Argus revision, SUT revision/version where available, scenario definitions, harness revision, mock boundary/version, raw run artifacts, logs, runtime where relevant, explicit limitations, and exit status.

A dynamic test blocked by environment constraints must be recorded as blocked—not silently omitted and not converted into a behavioral verdict.

## 13. Classification taxonomy

Every finding receives one primary class:

1. **SUT behavior** — externally observable behavior of the tested system.
2. **Assertion gap** — evidence exists, but the current assertion does not test the required property.
3. **Evidence plumbing gap** — the system observed a fact but the canonical evidence path dropped it.
4. **Harness/environment limitation** — the experiment could not be executed without violating its test constraints.
5. **Black-box boundary** — required fact is not externally observable.
6. **Argus defect** — Argus failed to perform or record the test action/evidence correctly.

The last category requires evidence that the tester itself violated its contract. A SUT timeout, lost response, or deliberate duplicate payment is not sufficient.

## 14. Protocol conclusion

NaN

Economic interpretation should be introduced only where a specific assertion/reporting requirement needs it. Do not turn the Core execution engine into a general economic semantics engine merely to make adversarial results look familiar to a normal agent.