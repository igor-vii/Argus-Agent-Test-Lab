# Franklin F1 — PreSpend deny test report

**Date:** 2026-10-12  
**Subject:** `@blockrun/franklin@3.49.6`, upstream commit `45b026c4ee93a4a34cb15cfa8a008ae6b89becd6`  
**Evidence:** [canonical raw bundle](../../evidence/franklin-f1/)

## Executive result

**Narrow result: DYNAMIC_OBSERVED.** A synthetic `PreSpend` invocation traversed Franklin's compiled `StreamingExecutor.collectResults` path. Franklin loaded and ran a test-only deny hook, returned an error containing `Spend blocked by a user hook`, did not call the instrumented stub handler, and wrote a deny record to its own `approvals.jsonl` audit file.

This is **not** an overall PASS for Franklin, and is not a live agent/payment end-to-end test.

## Verdicts

| Claim | Verdict | What the evidence establishes |
|---|---|---|
| Upstream version and revision pinned | DYNAMIC_OBSERVED | Provenance log records v3.49.6 and commit `45b026c…`; checkout reported clean before the test |
| Install and build succeeded | DYNAMIC_OBSERVED | `npm ci --no-audit --no-fund` and `npm run build` recorded exit code 0 |
| PreSpend hook received the event | DYNAMIC_OBSERVED | Captured stdin envelope identifies `PreSpend`, `JupiterSwap`, estimated USD 7.5 |
| Franklin enforced the deny | DYNAMIC_OBSERVED | Production executor returned the deny error; Franklin wrote matching `decision:"deny"` audit record |
| Stub tool handler did not run on denied invocation | DYNAMIC_OBSERVED | Harness assertion recorded `handlerExecuted=false` |
| Control path with no HookEngine let the stub run | DYNAMIC_OBSERVED, limited | The harness omitted the HookEngine and the stub ran; it did not set `FRANKLIN_HOOKS=0` in a full CLI session |
| Deny precedes real spend handler execution in source | STATIC_CONFIRMED | Pinned source orders the PreSpend deny return before `handler.execute()` |
| No signing/payment submission in this harness | DYNAMIC_OBSERVED within test scope | The stub was not invoked and disposable test HOME had no wallet material; this is not a live-wallet test |
| No network egress | NOT_VERIFIED as a directly observed fact | Source-path inspection suggests no network call on the exercised path, but no firewall, syscall, or proxy capture was collected |
| Live model-driven agent run, settlement, delivery, retries, duplicates | NOT_VERIFIED | Not tested |

## Method

The test used Franklin's compiled modules and its own loader, HookEngine, executor and audit writer. A disposable HOME supplied a test-only unconditional deny hook. A synthetic invocation used `JupiterSwap` with `estimatedUsd=7.5`; a local stub stood in for the spend handler. No paid model request, funded wallet, real signing, payment submission, or gateway receipt query was used.

The harness and the original run logs are preserved in the evidence bundle. The harness embeds absolute sandbox paths, so it is preserved as historical evidence, not a portable one-command runner.

## Forensic qualification

A read-only verification found two internally consistent but byte-different evidence sets (E1 and E2) from the same claimed upstream commit. The bundle retained here is the task-directed E1 set, with its original checksums and raw files preserved unchanged. The verifier also found that the negative control was narrower than the original report wording implied, and that absence of network traffic was inferred from the code path rather than captured directly. This report narrows those claims accordingly.

No overall product verdict is made. This single hook scenario says nothing conclusive about Franklin's behavior during real payment, settlement, or delivery.
