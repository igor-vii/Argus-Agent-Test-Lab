# AgentRun Evidence & Evaluation Packet

## Purpose

This packet is intended as the first external-facing attachment when approaching an agent/payment infrastructure team with Argus test results.

It is deliberately conservative: it presents reproducible observations and asks the system owner to validate the interpretation against their intended contract.

## What we tested

Argus is a black-box adversarial tester.

NaN

The tester does not require access to the SUT's internal state.

## Evidence package

The underlying raw evidence is preserved in Argus PR #60:

- ClawRouter dynamic CR1–CR6 run;
- Franklin static audit and documented dynamic-run limitation;
- BlockRun deterministic mock boundary;
- raw JSON runs;
- logs;
- manifests;
- reproducibility harness.

## Initial observations

### ClawRouter

1. Wallet/x402 flow successfully completed the tested 402 → sign → retry → 200 path.
2. When the gateway accepted payment but did not deliver a response, the caller eventually received a generic `TypeError: fetch failed` / `Premature close`. The client-visible error did not expose the economic state of the request.
3. A repeated paid request resulted in a second payment and second execution. No idempotency identity was observed in the tested requests.

NaN

### Franklin

Static source inspection identified explicit 402/payment/retry and spending-policy behavior.

Dynamic black-box execution was blocked because the tested configuration used hardcoded hosts and could not be redirected to the local test boundary without modifying the upstream clone.

No dynamic failure verdict is issued.

### BlockRun boundary

The deterministic resource-server mock demonstrated:

- payment accepted + response lost can leave the client with a timeout while the server-side execution completed;
- retry after an unresolved result can create a second payment/execution;
- an explicit idempotency replay can safely return the original execution;
- a non-idempotent repeated request can produce a second execution even though the current generic completion assertion still returns PASS.

The mock ledger is hidden experiment ground truth, not black-box evidence.

## Why this matters

The main question is not whether an agent can make a payment.

The harder question is what the system does when payment, execution, response delivery, retry, and idempotency stop lining up cleanly.

The evidence package makes that question concrete without assuming access to internal state.

## What we would like the system owner to validate

1. Is the observed behavior expected by design?
2. What economic state is intended to exist after the observed transport failure?
3. What public evidence is the caller expected to use to distinguish payment accepted, execution started, execution completed, execution failed, and delivery unknown?
4. What retry/idempotency contract should a client follow after an unresolved result?
5. Which externally observable response should be treated as authoritative?

## Methodological note

Argus intentionally creates adverse conditions. A test run that ends in a timeout or transport failure is not automatically a failed Argus test.

NaN

This distinction is central to interpreting the attached results.

## Proposed next step

We would like the system owner to reproduce the smallest relevant scenario against their own environment and tell us whether the observed reaction matches the intended contract.

The goal is not to publish a score prematurely. The goal is to establish a shared, evidence-backed definition of correct behavior under adverse agent-payment conditions.