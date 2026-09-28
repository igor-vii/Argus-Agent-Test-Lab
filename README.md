# Argus Agent Test Lab

**AI Agent Testing & Reliability**

> **Test whether AI agents and agent-based systems behave correctly when the world goes wrong.**

Argus is an external testing laboratory for AI agents and agent-based systems. It runs controlled scenarios against observable targets, captures evidence, evaluates explicit assertions, and produces evidence-backed verdicts.

**Agent → Scenario → Target → Evidence → Verdict**

## What Argus tests

Argus focuses on failure boundaries that ordinary happy-path tests often miss:

- payment and transaction flows
- retries, duplicates, and idempotency
- timeouts, crashes, and delayed responses
- execution and delivery failures
- ambiguous outcomes and missing observations
- adversarial participant behavior
- protocol and economic invariants
- evidence, reconciliation, and recovery behavior

The central question is:

> **What happens when payment, execution, delivery, and participant observations diverge?**

## Evidence boundary

Argus tests systems from the **outside**.

Evidence is collected from observable target boundaries rather than undocumented internal state. A missing observation is not automatically treated as a failure.

This distinction is fundamental:

**UNKNOWN ≠ FAILURE**

An unresolved outcome is a test result that may require reconciliation or additional evidence.

## Current target: Zeus Secretariat

The first external target is **Zeus Secretariat**, the execution and payment-orchestration layer of the Zeus system.

Argus tests the boundary:

```
Request
  ↓
Payment
  ↓
Settlement
  ↓
Execution
  ↓
Delivery
  ↓
Evidence
  ↓
Resolution
```

The goal is not to assume that payment proves execution or that a successful transport response proves delivery. The test system observes the available evidence and evaluates the target's declared invariants.

Argus remains target-agnostic: Secretariat is the first target, not the architectural limit.

## MVP model

```
Agent → Scenario → Target Adapter → Evidence → Assertions → Verdict
```

An Agent is a reusable participant type. Its role, behavior profile, and controlled faults are scenario parameters.

Example participant behaviors include:

- honest buyer
- impatient buyer
- duplicate/retrying buyer
- adversarial buyer
- slow seller
- broken seller
- delivery-loss conditions
- seller crash after execution

Scenarios are controlled and reproducible rather than random chaos.

## Public documentation

- [What is Argus?](docs/what-is-argus.md)
- [AI Agent Testing](docs/agent-testing.md)
- [Evidence and Verdicts](docs/evidence-and-verdicts.md)

## Commercial direction

The first commercial form is intended to be a **managed external audit**:

```
Client system
    ↓
Controlled failure scenarios
    ↓
Observable evidence
    ↓
Evidence-backed report
```

Self-service and continuous testing are longer-term possibilities. They are deliberately separated from the current minimal engineering path.

## Repository boundary

Argus lives in a separate repository from the Zeus production system.

It interacts with targets through defined external interfaces and observable behavior rather than depending on undocumented internal implementation details.

This makes Argus useful for testing:

- payment systems
- AI-agent applications
- agent protocols
- execution and delivery systems
- economic workflows
- other external targets

## Status

Argus is in active engineering development. Public case studies and production-capability claims will be added only when supported by verified run evidence.

---

**Argus Agent Test Lab — AI Agent Testing & Reliability.**

