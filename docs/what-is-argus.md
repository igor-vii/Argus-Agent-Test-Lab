# What is Argus?

Argus is an AI agent testing and reliability laboratory for controlled failure scenarios.

It is designed to answer a practical question:

> **Does an agent-based system remain correct when the world does not behave as expected?**

Argus runs a configured agent through a scenario against an external target, observes what can be established at the target boundary, evaluates explicit assertions, and records the resulting evidence and verdict.

## The model

```
Agent → Scenario → Target → Evidence → Verdict
```

### Agent

A participant with a defined role, behavior profile, and configurable fault behavior.

### Scenario

A reproducible test definition describing the interaction and the conditions under which it should be exercised.

### Target

The external system being tested. Argus should interact with it through an explicit adapter rather than relying on undocumented internals.

### Evidence

Observable facts collected during the run: requests, responses, payment observations, receipts, timing, and other externally visible events supported by the target boundary.

### Verdict

The result of evaluating explicit assertions against the collected evidence. Argus distinguishes proven outcomes from states that remain unresolved because an expected observation is missing.

## What makes the testing model different

Traditional API tests often verify that an expected request produces an expected response. Argus is intended for systems where correctness depends on a sequence of participants, payments, execution, delivery, retries, and recovery.

Examples include:

- a payment settles but the delivery response disappears;
- a client retries after an uncertain outcome;
- the same request arrives twice;
- a seller crashes after an externally observable settlement;
- a timeout occurs without enough evidence to classify the operation as failed.

The purpose is not to create random chaos. The purpose is to create **controlled, observable, and reproducible failure conditions** that exercise specific system invariants.

## Current scope

The first Argus target is Zeus Secretariat. The architecture is intended to remain target-agnostic so the same testing model can later be applied to other agent-based systems and protocols.

Argus is currently an engineering-stage project. Public examples and test reports describe what has actually been implemented or observed; future capabilities are identified as future work rather than current product claims.
