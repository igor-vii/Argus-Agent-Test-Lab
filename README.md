# Argus Agent Test Lab

**AI Agent Testing & Reliability**

> **Test whether AI agents and agent-based systems behave correctly when the world goes wrong.**

Argus is an independent black-box testing laboratory for AI agents and agent-based systems. It runs controlled scenarios against observable systems under test (SUTs), captures evidence, evaluates explicit assertions, and produces evidence-backed verdicts.

**Agent → Scenario → SUT → Evidence → Verdict**

## Local Setup and Validation

### Prerequisites

- Git installed.
- Node.js and npm installed.
- A terminal opened in the repository root.

The project uses TypeScript and Vitest. Dependencies and available commands are declared in `package.json`, with dependency versions recorded in `package-lock.json`.

### Installation

Clone the repository and enter its directory:

```bash
git clone https://github.com/igor-vii/Argus-Agent-Test-Lab.git
cd Argus-Agent-Test-Lab
```

Install dependencies using the committed lockfile:

```bash
npm ci
```

### Validation Commands

Run these commands from the repository root.

**Run the test suite:**

```bash
npm test
```

This runs Vitest in single-run mode.

**Build the TypeScript project:**

```bash
npm run build
```

This runs the TypeScript compiler using the project's `tsconfig.json`.

**Type-check without emitting output:**

```bash
npm run typecheck
```

This runs the TypeScript compiler with `--noEmit`.

**Run the configured lint script:**

```bash
npm run lint
```

### Current Lint Limitation

The `lint` script in `package.json` invokes:

```bash
eslint src/**/*.ts
```

In the audited Windows environment, `npm run lint` could not run because the `eslint` command was not recognized. ESLint is not listed among the project's declared dependencies in `package.json`.

Linting is therefore blocked in the audited environment. This documentation change does not add ESLint, change dependencies, or introduce a lint configuration.

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

## Black-box SUT boundary

Argus tests systems from the **outside**.

A SUT is not assumed to be a particular product, implementation, or internal architecture. Argus determines the applicable interaction model from observable protocol and economic behavior and then applies scenarios from the **opposite participant role**.

Conceptually:

```
                 Black-box SUT
                       │
              observable behavior
                       ↓
              role / capability probe
                  ↙           ↘
             CLIENT       RESOURCE_SERVER
                │               │
       seller-side tests   buyer-side tests
                ↘               ↙
                  Evidence
                     ↓
                   Verdict
```

If the observable evidence does not establish a unique role, Argus must preserve **UNKNOWN / AMBIGUOUS** rather than guessing.

This is fundamental:

**UNKNOWN ≠ FAILURE**

An unresolved outcome is a test result that may require reconciliation or additional evidence.

## Secretariat is one SUT, not the target definition

**Zeus Secretariat is one example of a SUT that Argus can test. It is not Argus's architectural target or product dependency.**

Argus must be useful against unrelated external systems: agent clients, resource servers, payment services, execution systems, and other agent protocols. Historical Secretariat integration work remains useful as a concrete interoperability case study, but it must not define the product boundary.

For any given SUT, Argus should be able to operate as the required counterparty:

- when the SUT is a **CLIENT / BUYER**, Argus can exercise the resource-server / seller side;
- when the SUT is a **RESOURCE_SERVER / SELLER**, Argus can exercise the client / buyer side;
- when the role cannot be established from observable behavior, Argus does not guess.

## MVP model

```
SUT → Role/Capability Discovery → Scenario Selection
                              ↓
                    Counterparty Adapter
                              ↓
                         Evidence
                              ↓
                         Assertions
                              ↓
                           Verdict
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

- [Argus Product Boundary](docs/argus-product-boundary.md)
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

Self-service and continuous testing are longer-term possibilities.

## Repository boundary

Argus lives in a separate repository from the systems it tests.

It interacts with SUTs through defined external interfaces and observable behavior rather than depending on undocumented internal implementation details.

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
