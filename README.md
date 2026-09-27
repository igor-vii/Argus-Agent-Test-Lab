# Argus Agent Test Lab

**AI Agent Testing & Reliability**

> **Test whether AI agents and agent-based systems behave correctly when the world goes wrong.**

Argus runs controlled failure scenarios against external targets, captures observable evidence, evaluates explicit assertions, and produces evidence-backed verdicts.

**Agent → Scenario → Target → Evidence → Verdict**

Most agent testing focuses on whether the expected path works. Argus focuses on what happens when **payment, execution, delivery, network behavior, retries, or participant behavior diverge**.

### What Argus tests

- payment and transaction flows
- retries, duplicates, and idempotency
- timeouts, crashes, and delayed responses
- delivery loss and ambiguous outcomes
- adversarial participant behavior
- protocol and economic invariants
- evidence and recovery behavior under failure

### Evidence boundary

Argus is designed to test systems from the **outside**. Evidence is collected from observable target boundaries rather than undocumented internal state. A missing observation is not automatically treated as a failure.

### Current focus

The first target is **Zeus Secretariat**, a payment-orchestration system. Argus is being developed as a reusable testing laboratory rather than as a Secretariat-specific test suite.

### Public documentation

- [What is Argus?](docs/what-is-argus.md)
- [AI Agent Testing](docs/agent-testing.md)
- [Evidence and Verdicts](docs/evidence-and-verdicts.md)

---


**Argus Agent Test Lab** is a modular infrastructure for testing AI-agent protocols, agent-based applications, payment flows, and trust systems under normal, degraded, adversarial, and chaotic conditions.

The first target is the **Zeus Secretariat**.

The long-term goal is to turn the laboratory into a reusable **AI Agent Testing as a Service** platform for external users.

---

## Vision

Most systems are tested against expected behavior.

Argus Agent Test Lab is designed to test what happens when agents behave badly, networks become unreliable, payments are delayed or abandoned, requests are duplicated, responses disappear, and multiple failures happen at the same time.

The laboratory should be able to create a controlled **perfect storm** and determine whether the target system preserves its economic, state, execution, and evidence invariants.

The same infrastructure should eventually be usable for:

* Zeus Secretariat
* Zeus Insurance
* Zeus Escrow
* Zeus Reputation
* other Zeus modules
* external AI-agent protocols
* external AI-agent applications

---

# Core Principle

> **Do not test only whether the system works. Test whether the system remains correct when everything goes wrong.**

---

# Architecture Principles

## 1. Modular by design

The laboratory is composed of independent modules with explicit interfaces.

Core conceptual modules:

```text
Agent Runtime
Scenario Engine
Fault Injection
Target Adapters
Chain Adapters
Payment Adapters
Observer / Evidence
Assertions / Verdicts
Reporting
Configuration
```

Adding a new target, agent type, blockchain, payment mechanism, or failure mode should not require rewriting the core.

---

## 2. Plug-and-play

The desired user experience is:

```text
Connect
    ↓
Configure
    ↓
Run
    ↓
Receive evidence-backed result
```

A new supported component should ideally be installable/configurable once and then used without manual intervention.

---

## 3. Agents are controllable failure generators

Test agents are not merely simulated users.

They must be capable of deliberately:

* delaying;
* hanging;
* timing out;
* crashing;
* disconnecting;
* refusing to pay;
* paying late;
* retrying;
* duplicating requests;
* sending concurrent requests;
* abandoning operations;
* losing responses;
* producing partial failures;
* triggering recovery paths.

Failures must be **intentional, configurable, observable, and reproducible**.

---

## 4. Perfect Storm

Individual faults must be composable.

For example:

```text
duplicate request
+
delayed payment
+
payment retry
+
RPC timeout
+
seller crash after execution
+
lost HTTP response
```

The Scenario Engine should be able to combine these behaviors into one controlled test run.

A perfect storm is not merely random chaos.

It is a reproducible combination of failure conditions designed to attack specific system invariants.

---

# User Control

The same Scenario Engine should eventually support multiple interfaces.

### Dashboard

For normal users:

* checkboxes;
* toggles;
* sliders;
* parameters;
* predefined storm levels;
* Run button.

Example:

```text
Duplicate requests       ON
Payment delay             ON
Payment abandonment       5%
Seller crash              10%
Delivery loss             15%
Random latency            1–20 sec
Duration                  15 min
```

### Command / CLI / API

For advanced users:

```text
Create a 20-minute perfect storm:
duplicate requests,
payment retries,
10% unpaid requests,
seller crash after execution,
15% delivery loss.
```

The dashboard and command/API layer must ultimately produce the same internal Scenario Definition.

---

# Target Abstraction

The laboratory must not be architected specifically around Secretariat.

Conceptually:

```text
TargetAdapter
├── Secretariat
├── Insurance
├── Escrow
├── Reputation
└── External targets
```

Secretariat is simply the first implementation.

---

# Multi-chain Architecture

Blockchain support is adapter-based.

```text
ChainAdapter
├── X Layer
├── Base
├── BOT Chain
└── Future chains
```

Not every chain needs to be implemented initially.

The important requirement is that adding another chain should be an isolated extension rather than a redesign of the laboratory.

---

# Payment Architecture

Payment handling must also be abstracted.

```text
PaymentAdapter
├── Direct payment
├── Zeus Reserve / sponsored mode
└── Future payment providers
```

The initial implementation should remain simple.

The architecture must not prevent future sponsored testing, prepaid balances, external payment providers, or other commercial models.

---

# Configuration Without Redeployment

Agent behavior should be configuration-driven whenever technically and securely possible.

Examples:

* retry count;
* delay;
* timeout;
* crash probability;
* duplicate probability;
* delivery-loss probability;
* payment behavior;
* concurrency;
* scenario duration;
* chain;
* target;
* test intensity.

Changing test-agent behavior should normally **not require redeploying the laboratory or any Zeus contract**.

Configuration must never be allowed to bypass security or economic invariants of the system being tested.

---

# Evidence and Reproducibility

Every test run should produce a durable and reproducible record.

Conceptually:

```text
Run
 ↓
Scenario
 ↓
Agent configuration
 ↓
Target
 ↓
Chain
 ↓
Actions
 ↓
Events
 ↓
Evidence
 ↓
Assertions
 ↓
Verdict
```

A run should have a unique identity and retain enough information to reproduce the relevant scenario.

Important properties:

* deterministic mode where possible;
* seed support for randomized scenarios;
* complete event timeline;
* expected result;
* actual result;
* evidence;
* PASS / FAIL / INCONCLUSIVE verdict.

---

# Security Boundary

Agents may deliberately break the **target interaction**.

They must not receive unrestricted control over the laboratory itself.

Fault injection must remain sandboxed and explicitly scoped.

The laboratory should be able to create aggressive behavior without turning a test agent into an uncontrolled infrastructure operator.

---

# Future Commercial Layer

The commercial product should be added **around the existing laboratory**, not baked into its core.

Future architecture:

```text
Commercial Layer
├── Accounts
├── API
├── Billing
├── Quotas
├── Client isolation
└── Dashboard
        │
        ▼
Agent Test Lab Core
        │
   ┌────┼────┐
 Agents Targets Chains
```

The goal is to allow an external user to submit a test specification, fund/select a test run, execute controlled agents, and receive an evidence-backed report.

Commercial functionality must not require rewriting the laboratory core.

---

# Repository

The Agent Test Lab lives in a **separate repository** from the Zeus production repositories.

The laboratory is an external testing system and should interact with Zeus through defined interfaces rather than depending on undocumented internal implementation details.

---

# Initial Target

The first target is:

> **Zeus Secretariat**

The first objective is to test different Secretariat blocks and failure boundaries, including:

* request identity;
* payment;
* idempotency;
* settlement;
* execution;
* recovery;
* UNKNOWN states;
* delivery uncertainty;
* evidence;
* crash/retry behavior;
* adversarial economic scenarios.

After Secretariat, the same framewor
k expands to Insurance, Escrow, and other Zeus modules.

---

# Status

**Stage:** Architecture / initial repository setup

No production test agents are considered complete yet.

The next milestone is to define and approve **Agent Test Lab Architecture V0** before implementation begins.



## MVP model

The minimal test model is:

**Agent → Scenario → Target Adapter → Evidence → Assertions → Verdict**

An Agent is a reusable participant type. Its role, behavior profile, and fault configuration are scenario parameters. A Scenario can assign different controlled faults to different participants.

Example roles include buyer and seller. Example controlled behaviors include delayed responses, duplicate requests, payment retries, crashes, and lost delivery.

## Initial economics boundary

For engineering tests, agent-to-agent payment can use testnet assets and self-funded wallets controlled by the test environment.

The commercial layer is separate: an external client can purchase a managed audit and receive an evidence-backed report.

Client billing is not part of the Scenario Definition.

## Initial engineering track

1. Minimal Agent Runtime
2. Core fault primitives
3. Secretariat Target Adapter
4. Secretariat adversarial scenario suite
5. Evidence and Verdict pipeline
6. Internal validation with verified run evidence

## Initial commercial direction

The first commercial form is intended to be a **managed audit**, not a self-service SaaS platform.

A managed audit means:

**Client system → controlled failure scenarios → observable evidence → evidence-backed report**

Self-service and continuous testing are longer-term possibilities that should follow evidence of repeatable external demand.

No pricing or market-size claim is treated as validated product evidence at this stage.

## Roadmap boundary

Post-MVP capabilities may include:

- additional external targets
- more complex fault combinations
- continuous regression/adversarial testing
- multi-chain support
- additional payment adapters
- dashboard and API
- self-service execution
- broader commercial infrastructure

These are deliberately separated from the current minimal engineering path.

## Evidence / case studies

A public case study will be added only when the underlying run evidence is verified and suitable for publication. Prototype UI output or an unverified scenario definition is not treated as proof of completed production capability.
