# A0 Re-Audit — Raw Evidence Manifest (clean-slate re-run)

**Date:** 2026-10-07
**Mode:** ANALYSIS ONLY. No canonical Argus code was modified. Harness lives outside `src/`.

## Versions / provenance

| Item | Value |
| --- | --- |
| Argus commit (canonical, unmodified) | `e7bba2aa62cacaf2d2377826797e90ef00c0235c` |
| Mock gateway | `.a0-sandbox/mock-gateway/server.mjs` (disposable local SUT boundary, modes A–F) |
| Harness | `.a0-sandbox/harness.mts` (drives real canonical pipeline: X402AgentAdapter → AgentController → ScenarioEngine → EvidenceCollector → AssertionEngine(S8) → RunOrchestrator) |
| Extras probe | `.a0-sandbox/extra.mts` ([1] 402-observation trace; [3] duplicate-execution probe) |
| Runtime | node v20.20.2, tsx |
| Wallet | throwaway sandbox key via `ARGUS_TEST_WALLET_PRIVATE_KEY`; **no RPC contacted, no funds used** (signing is local EIP-3009 typed-data only; mock accepts structurally) |
| ClawRouter clone | NOT present in this environment at re-run time (previous `/tmp/argus-sandbox` was wiped; see "Data integrity" below) |
| Franklin clone | same as above |

## Data integrity note

The previous session's `/tmp/argus-sandbox/runs/*.json`, `full-run.log`, `extra.log` and the
upstream clones were **not preserved by the environment** (container `/tmp` reset). This manifest
therefore describes a **clean-slate reproduction** of the identical experiment against the same
Argus baseline commit, using the harness that exists on branch HEAD (`d542894` PR content is the
harness itself; raw runs were never committed upstream either). All numbers below come from files
in this directory, generated 2026-10-07.

## Runs (raw JSON in this directory)

| File | Subject | Mode | Scenario | Engine verdict (canonical S8) | computeB6BVerdict (report-only) | Ground truth (mock ledger) | Exit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `P3_HAPPY_PATH.json` | BlockRun mock gateway | A | happy path: pay→exec→deliver | PASS | UNKNOWN | payments=1, exec_1 | 0 |
| `S1_TIMEOUT.json` | BlockRun mock gateway | B | payment accepted, execution timeout | FAIL (`terminal status 'timeout'`) | UNKNOWN | payments=1, exec_1 started | 0 |
| `S2_RESPONSE_LOST.json` | BlockRun mock gateway | C | payment accepted, exec completed, response dropped | FAIL (`terminal status 'timeout'`) | UNKNOWN | payments=1, **exec_1 completed** | 0 |
| `S3_EXEC_FAILURE.json` | BlockRun mock gateway | D | payment accepted, exec fails, HTTP 500 | FAIL (`terminal status 'failure'`) | UNKNOWN | payments=1, exec_1 failed | 0 |
| `S4_RETRY_AFTER_UNKNOWN.json` | BlockRun mock gateway | E | attempt1 UNKNOWN, attempt2 delivered | a1 FAIL(timeout), a2 PASS | UNKNOWN both | payments=2, exec_1+exec_2 (**duplicate economics**) | 0 |
| `S5_IDEMPOTENT_RETRY.json` | BlockRun mock gateway | F | same idempotencyKey twice, seller replays | a1 PASS, a2 PASS (body shows `replayed:true`, same `exec_1`) | not run | payments=2, executions=1 | 0 |
| `EXTRA.json` [1] | BlockRun mock gateway | A | no-resolver 402 trace | FAIL ("payment not signed") | — | raw exchange observations = `[http_response_received, payment_required_received]`, statusCode 402, parsed=true; canonical evidence = only `payment_required_no_resolver` | 0 |
| `EXTRA.json` [3] | BlockRun mock gateway | A | DUP: two runs, same key `a0-DUP`, non-idempotent seller | a1 PASS, a2 PASS | — | payments=2, exec_1 + **exec_2** (second economic action); Argus saw `executionId=exec_2` in body | 0 |

Logs: `full-run.log` (all six scenarios), `extra.log` (probes [1],[3]).

## Where each finding class belongs (per black-box tester contract)

* **[1] GAP-1 re-proven precisely:** adapter DID observe `payment_required_received` (raw exchange
  metadata, in EXTRA.json); it is dropped only at the ScenarioEngine PAYMENT_REQUIRED early-return
  before the standard observation-translation loop. → EVIDENCE/OBSERVABILITY LIMITATION (plumbing),
  not a semantic failure. The S8 assertion still evaluated correctly from its own inputs.
* **S1/S2 FAIL:** produced by `assert_payment_flow_completed` mapping `terminalStatus != 'success'`
  to FAIL. That assertion answers "did the buyer-side interaction complete?", not "did the SUT
  behave per contract?". In S2 the ground-truth execution COMPLETED while Argus says FAIL —
  NO RECEIPT ≠ PROVEN FAILURE. → TEST/ASSERTION SCOPE issue; adversarial action itself succeeded.
* **S5 vs DUP:** Argus recorded everything needed externally (same `exec_1`+`replayed:true` vs new
  `exec_2`) inside the response-body evidence. Distinguishing safe replay from duplicate execution
  requires only an assertion over already-collected evidence — no new subsystem. Current S8 does
  not contain such an assertion → missing test, not missing capability.
* **computeB6BVerdict UNKNOWN everywhere incl. happy path:** its vocabulary
  (`payment_accepted`, `seller_response_received`, `timeout_no_response`) is never emitted by the
  canonical engine (which emits `payment_signed_and_retried` / `payment_retry_outcome`). It is a
  parallel model fed only by test harnesses. → do not wire into Core now.
* **Settlement:** never observed (mock exposes only an opaque `X-PAYMENT-RESPONSE`-style header;
  captured as `paymentResponseHeader` flag in EXTRA.json exchanges). Correct classification:
  NOT OBSERVED / NOT PROVEN — expected black-box boundary.
* **ClawRouter / Franklin:** raw runs from the prior session are unrecoverable in this environment;
  re-running them requires fresh clones (SHAs previously recorded: ClawRouter
  `b758e036bbd1290c0997ad14c9812a106ef8d72b`, Franklin `eebfb7c92849ec6892b18ad2464544d07fdbe5dd`).
  No verdict about them may be drawn from this manifest beyond what these files show.

## Reproduce

```bash
node .a0-sandbox/mock-gateway/server.mjs &                # port 8765
ARGUS_TEST_WALLET_PRIVATE_KEY=<throwaway-key> \
  node_modules/.bin/tsx .a0-sandbox/harness.mts ALL       # -> $A0_OUT_DIR/*.json
ARGUS_TEST_WALLET_PRIVATE_KEY=<throwaway-key> \
  node_modules/.bin/tsx .a0-sandbox/extra.mts
```
