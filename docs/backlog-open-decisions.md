# B0 — Open Decisions & Audit Backlog

**Repository:** `igor-vii/Argus-Agent-Test-Lab`  
**Canonical branch:** `main`  
**Purpose:** authoritative decision register for unresolved, deferred, and unverifiable findings across the Argus audit phases.

> **Core rule:** no finding disappears silently, and no finding is invented silently.
>
> This document records what is verified in the canonical repository, what exists only in prior reports, what exists only in conversation, and what cannot currently be traced to evidence.

---

## 1. Objective

Maintain a single authoritative register of findings and decisions originating from:

- L0-S — S1–S7 semantic audit
- L0-F — fault/event contract audit
- L0-F2 — fault dispatch contract
- L0a — participant live wiring
- L0-T / B3 — topology and multi-participant runtime
- B4 — scenario semantic cleanup
- B5 — infrastructure / repository hygiene

B0 does **not** implement the unresolved architecture.

B0 establishes the audit trail and makes every known item explicit as one of:

- `RESOLVED`
- `DEFERRED-TO-PHASE`
- `WONTFIX-WITH-REASON`
- `DECISION-REQUIRED`

---

## 2. Evidence and No-Change Rule

### Evidence hierarchy

Each backlog item must identify its source type:

- **REPO** — directly verifiable in the current canonical `main`
- **REPORT** — present in a prior Qwen/agent report, but not necessarily committed to `main`
- **CONVERSATION** — stated in the project conversation / prior session, without a corresponding report or repository artifact
- **UNKNOWN** — mentioned but no reliable source can currently be located

Do not silently promote REPORT, CONVERSATION, or UNKNOWN evidence into REPO evidence.

### No-code-change rule

B0 is a research/register phase.

Do not modify:

- `src/**`
- tests
- runtime behavior
- adapters
- scenario definitions
- configuration
- `.gitignore`
- CI configuration

The only intended repository artifact of B0 is this document.

### No backlog cleanup

Do not re-classify an existing backlog item without new evidence.

If a prior item's status must change, create a separate row containing:

`REVISED-FROM: <old-status>`

and record the new evidence and rationale.

Do not silently overwrite prior decisions.

---

## 3. Backlog Schema

Every finding must be represented with the following fields:

| ID | Problem / Decision | Category | Source Type | Source | Current Status | Why Deferred / Status Rationale | Owner Phase | Decision Owner |
|---|---|---|---|---|---|---|---|---|

Additional evidence notes may be added below the table where necessary.

### Status semantics

- **RESOLVED** — resolution is directly verifiable from current canonical `main`.
- **DEFERRED-TO-PHASE** — intentionally not solved in the current phase; the owning phase is explicit.
- **WONTFIX-WITH-REASON** — intentionally rejected with an explicit reason.
- **DECISION-REQUIRED** — a decision or missing evidence is required before the item can legitimately be marked resolved or deferred.

A missing source document is **not** evidence of resolution.

---

## 4. Current Backlog

| ID | Problem / Decision | Category | Source Type | Source | Current Status | Why Deferred / Status Rationale | Owner Phase | Decision Owner |
|---|---|---|---|---|---|---|---|---|
| B0-001 | L0-S findings cannot currently be verified from canonical main because the prior L0-S document is absent from `main`. | Audit evidence | CONVERSATION | Prior session; source document not present in repo | DECISION-REQUIRED | Do not reconstruct the four L0-S findings from memory. Original evidence is required before resolution can be verified. | B0 / evidence recovery | Architect |
| B0-002 | L0-F findings cannot currently be verified from canonical main because the prior L0-F document is absent from `main`. | Audit evidence | CONVERSATION | Prior session; source document not present in repo | DECISION-REQUIRED | Do not reconstruct L0-F findings from memory. | B0 / evidence recovery | Architect |
| B0-003 | L0-F2 fault-dispatch contract is present in canonical main, including contract documentation and tests. | Fault contract | REPO | `docs/l0-f2-fault-dispatch-contract.md`; `src/tests/core/FaultDispatchContract.test.ts` | RESOLVED | Contract implementation was merged into main. Remaining coverage gaps are tracked separately and are not silently treated as contract failures. | B1.1 | Architect |
| B0-004 | Four L0-F2 coverage gaps remain distinct from contract holes: infrastructure-target validation, lifecycle no-dispatch spy coverage, end-to-end positive fault application, and explicit S1/S5 structure assertions. | Test coverage | REPORT | Prior Qwen audit/report; not committed as a source document in main | DEFERRED-TO-PHASE | These are coverage gaps, not evidence that the frozen L0-F2 contract itself is invalid. | B1.1 | Architect |
| B0-005 | Lifecycle trigger semantics must be decided: evidence-only, separate non-recursive dispatch, or bounded recursive dispatch. | Architecture | CONVERSATION | Prior L0-F2 decision record / project discussion | DEFERRED-TO-PHASE | Current frozen state is evidence/declaration only; no recursive active-fault dispatch is implemented. | B1.2 | Architect |
| B0-006 | Edge/infrastructure fault targets, including S7 `lost_delivery`, need an explicit runtime decision. | Architecture | CONVERSATION | Prior L0-F2 discussion | DEFERRED-TO-PHASE | Current L0-F2 supports active participant/action dispatch only; edge/infrastructure targets remain declarative-only. | B1.3 | Architect |
| B0-007 | `respond` remains a separate baseline responder path rather than an active fault-dispatch path. | Type / contract boundary | REPO | L0-F2 implementation and tests | DEFERRED-TO-PHASE | Current compatibility behavior is intentionally retained; future type separation is a bounded decision. | B1.4 | Architect |
| B0-008 | Participant live wiring must be audited: participant → controller → adapter, including the current multi-participant registration behavior. | Runtime wiring | CONVERSATION | Prior L0a analysis | DEFERRED-TO-PHASE | No live wiring redesign belongs in B0. | B2 | Architect |
| B0-009 | Topology / multi-participant runtime semantics are not yet established as an execution model. | Architecture | CONVERSATION | Prior L0-T / B3 planning | DEFERRED-TO-PHASE | Current runtime is primarily actor/controller driven. B3 must determine whether explicit topology runtime is required or whether participant-aware wiring is sufficient. | B3 | Architect |
| B0-010 | S1–S7 scenario semantic cleanup and migration from mock/declarative assumptions to live semantics remain open. | Scenario semantics | CONVERSATION | Prior B4 planning | DEFERRED-TO-PHASE | B0 records the debt; it does not change scenario behavior. | B4 | Architect |
| B0-011 | Repository / CI hygiene requires investigation of generated artifacts, `.gitignore`, explicit commit paths, and related index hygiene. | Infrastructure | CONVERSATION | Prior B5 planning | DEFERRED-TO-PHASE | No infrastructure cleanup is performed by B0. | B5 | Architect |
| B0-012 | Audit documents and decisions are fragmented between repository, reports, and conversation. | Process / audit trail | REPO + CONVERSATION | Current main inspection + prior session history | DECISION-REQUIRED | The repository does not currently provide a complete historical audit trail. Future audit documents require an explicit persistence rule. | B5 / audit-process decision | Architect |
| B0-013 | PR #47 containing the first real external Sitecheck behavioral test is merged into main. The exact historical “W7” finding linkage is not independently recoverable from the current source set. | Audit traceability | REPO + CONVERSATION | PR #47; prior W7 reference | DECISION-REQUIRED | Merge is verified, but the original W7 finding document/evidence is not present in main, so the finding itself must not be declared resolved solely from the merge. | B0 / evidence recovery | Architect |

---

## 5. L0-S Evidence Rule

The prior L0-S audit document is not present in the current canonical `main`.

Therefore:

1. Record that fact explicitly.
2. Do not reconstruct the four L0-S findings from memory.
3. If the original report becomes available, re-enter each finding with its actual source.
4. Until then, each unresolved L0-S item remains `DECISION-REQUIRED`, not `RESOLVED`.
5. A prior-session statement may be recorded as `Source Type = CONVERSATION`, but it must not be represented as repository evidence.

This prevents both:

- silent loss of prior findings; and
- silent invention of findings from memory.

---

## 6. L0-F Evidence Rule

The same rule applies to L0-F.

If the original L0-F report/document is not present in canonical `main`:

- do not reconstruct its contents;
- record the absence;
- preserve only source-qualified references that can be traced to a REPORT or CONVERSATION;
- keep verification-dependent items at `DECISION-REQUIRED`.

---

## 7. L0-F2 Frozen Contract

The currently verified L0-F2 state is:

- active fault dispatch is action-triggered;
- active fault targets are participant targets;
- the participant target must equal the action actor;
- lifecycle triggers are evidence/declaration only;
- recursive active-fault dispatch is not implemented;
- edge/infrastructure targets are declarative-only;
- `respond` is handled by a separate baseline responder path.

The contract itself is represented in canonical main.

The four known coverage gaps remain separate backlog items and must not be conflated with a contract defect.

---

## 8. Lifecycle Decision — B1.2

The current state is intentionally frozen as evidence/declaration only.

Future decision options:

**A. Evidence-only**

Lifecycle events never dispatch active faults.

**B. Separate non-recursive dispatch**

Lifecycle events can trigger a bounded class of faults without recursively re-entering the event/fault loop.

**C. Bounded recursive dispatch**

Lifecycle events can participate in controlled depth-1 recursive dispatch.

B0 does not select A, B, or C.

The decision belongs to B1.2.

---

## 9. Edge / Infrastructure Targets — B1.3

Current L0-F2 behavior does not provide active edge/infrastructure interception.

Therefore S7-style delivery faults cannot be treated as live runtime behavior merely because a scenario declares an edge/infrastructure target.

B0 records the decision point only.

No edge runtime is implemented here.

---

## 10. Participant Wiring — B2

The next runtime question is:

`participant → controller → adapter`

The current scenario set has evidence of multi-participant registration behavior that requires explicit analysis before live execution is expanded.

B2 owns:

- participant-to-controller mapping;
- participant-to-adapter mapping;
- controller identity;
- whether one controller may safely serve multiple participants;
- first live participant execution.

The first live candidate remains S1 with an `HttpAgentAdapter` and local mock HTTP target.

No Sitecheck dependency is required for B2.

---

## 11. Topology — B3

Topology remains a declarative/runtime-boundary question.

Current evidence does not establish a requirement for a separate topology execution engine.

B3 must determine whether:

1. explicit topology runtime is necessary; or
2. participant-aware controller/adapter wiring is sufficient.

B0 does not decide this.

---

## 12. Scenario Semantics — B4

B4 owns semantic cleanup of S1–S7, including:

- live versus mock semantics;
- final outcome semantics;
- `INCONCLUSIVE` handling;
- participant identity;
- fault declarations versus actually executable faults;
- migration from declarative scenarios to observable runtime behavior.

B0 records these as open work and does not alter scenario semantics.

---

## 12a. Audit Trail Fragmentation

The Argus audit trail currently spans multiple locations:

1. **REPO** — canonical code, tests, and committed documents;
2. **REPORT** — Qwen/agent reports that may not be committed;
3. **CONVERSATION** — architectural decisions, layer maps, audit conclusions, and prior-session findings.

This fragmentation is itself a finding.

### Future persistence rule

Any future audit document that is intended to be authoritative must be committed under `docs/` as part of the phase that produces it.

Examples include:

- L0-S report
- L0-F report
- L0-F2 report
- B0 backlog
- B1.2 lifecycle decision
- other phase-level decision records

If a document is intentionally ephemeral, it must be explicitly marked **EPHEMERAL** and must not later be treated as authoritative evidence.

No future phase may silently rely on a prior conversation artifact as if it were repository evidence.

---

## 13. Infrastructure Hygiene — B5

The following remain explicitly deferred:

- generated `dist/` content and repository indexing;
- `node_modules/` indexing;
- `.gitignore` restoration / correctness;
- explicit commit-path discipline;
- CI / repository hygiene checks;
- audit-document persistence rules.

B0 does not modify these files or settings.

---

## 14. Decision Ownership

Each item must distinguish:

### Implementation decision

How an already-decided behavior is implemented.

### Architectural decision

What runtime or contract behavior should exist.

### Scope decision

Whether the behavior belongs in the current phase at all.

The default decision owner for Argus architectural and scope questions is the project architect.

Qwen/implementation agents may provide evidence and implementation proposals but do not silently change architectural or scope decisions through code.

---

## 15. Dependency Map

The current planned dependency order is:

```
B0  — authoritative evidence/backlog
 │
 ├── B5.1 — infrastructure/audit-trail research
 │
 ├── B1.1 — close L0-F2 coverage gaps
 │
 └── B1.2 — lifecycle decision
          │
          ▼
        B2 — participant live wiring
          │
          ├── B3 — topology decision
          │
          └── B4 — scenario semantic cleanup
```

B3 remains optional until B2 establishes whether explicit topology runtime is actually required.

---

## 16. Forbidden Outcomes

The following are explicitly forbidden:

- declaring an absent audit document resolved;
- reconstructing missing findings from memory;
- treating a conversation statement as repository evidence;
- silently changing backlog status;
- silently rewriting a prior decision;
- implementing lifecycle recursion during B0;
- implementing edge/infrastructure dispatch during B0;
- redesigning participant wiring during B0;
- modifying S1–S7 semantics during B0;
- treating a merged PR as proof that an undocumented historical finding was resolved;
- expanding B0 into a general architecture refactor.

---

## 17. Coverage Gaps vs Contract Holes

B0 must preserve the distinction:

**Contract hole**  
The frozen behavioral contract is wrong, incomplete, or internally inconsistent.

**Coverage gap**  
The contract is explicit, but tests do not yet prove an aspect of it.

The four L0-F2 items currently identified are coverage gaps unless new evidence demonstrates otherwise.

They must not be upgraded into contract holes merely because coverage is incomplete.

---

## 18. Audit Evidence Policy

For every future finding:

1. Identify the source.
2. Identify the source type.
3. Verify against canonical main where possible.
4. If verification is impossible, say so.
5. Never convert uncertainty into resolution.
6. Never convert memory into evidence.
7. Preserve prior status history when changing a status.
8. Link the item to an owner phase.

The backlog is authoritative about **status and traceability**, not a substitute for the underlying evidence.

---

## 19. Readiness Gate

B0 is complete only when all of the following are true:

- [ ] Every known finding/decision source is accounted for.
- [ ] Missing L0-S evidence is explicitly recorded.
- [ ] Missing L0-F evidence is explicitly recorded.
- [ ] L0-F2 contract state is verified against canonical main.
- [ ] L0-F2 coverage gaps are separated from contract holes.
- [ ] Lifecycle, edge/infrastructure, responder, participant wiring, topology, scenario semantics, and infrastructure items have explicit owner phases.
- [ ] Audit Trail Fragmentation is recorded.
- [ ] No finding has been silently reconstructed from memory.
- [ ] No existing status has been silently reclassified.
- [ ] `docs/backlog-open-decisions.md` exists and is readable.
- [ ] `git status --short` shows exactly one untracked or modified file: `docs/backlog-open-decisions.md`.
- [ ] `git diff --cached --stat` is empty.
- [ ] No staged changes exist in `src/`.
- [ ] No staged changes exist in `.gitignore`.
- [ ] `git ls-files | grep -E '^(dist|node_modules)/'` returns 0.
- [ ] The backlog contains all required sections: backlog table, Confirmed Resolved, Deferred, Decision Required, Wontfix, Coverage Gaps.

### Required status views

For operational use, the backlog must make it possible to identify separately:

- **Confirmed Resolved**
- **Deferred**
- **Decision Required**
- **Wontfix**
- **Coverage Gaps**

No category may be inferred only from prose.

---

## 20. Final Principle

B0 does not mean everything is solved.

It means everything currently known is accounted for, its evidence source is explicit, its status is explicit, its owner phase is explicit, and nothing important is left only in conversation memory.

A missing document is a finding.

An unverifiable resolution is not a resolution.

A coverage gap is not automatically a contract hole.

And a clean backlog is not permission to erase history.
