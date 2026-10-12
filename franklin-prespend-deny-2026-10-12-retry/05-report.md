# 05 — F1-RETRY Final Forensic Report

## Verdict table

| # | Claim | Status |
|---|---|---|
| 1 | Official source acquired, revision pinned | **DYNAMIC_OBSERVED** (clone verified): https://github.com/BlockRunAI/Franklin, branch `main`, commit `45b026c4ee93a4a34cb15cfa8a008ae6b89becd6` (2026-10-11T17:04:30 -0500), package `@blockrun/franklin` **3.49.6**, lockfile v3, Node >=20.19 required / v20.20.2 used. Identity confirmed (NOT the unrelated npm `franklin`). No revision switch during test; worktree clean before and after (0 tracked modifications). |
| 2 | Install/build result | **DYNAMIC_OBSERVED**: `npm ci --ignore-scripts` exit 0; `npm run build` (`tsc && node scripts/copy-plugin-assets.mjs`) exit 0; `dist/` produced. Build success is NOT evidence of runtime behavior — runtime claims below are separate. |
| 3 | PreSpend API documented and source-verified | **STATIC_CONFIRMED** with file/line citations (see `01-hook-api-and-safety.md` §1–§9). Docs and implementation agree on the tested contract; one ordering nuance noted (§11). |
| 4 | Test-only hook script itself denies | **DYNAMIC_OBSERVED**: captured stdin envelope + engine-visible deny reason `ARGUS_F1_PRESPEND_DENY_TEST` (`03-hook-test.log`). |
| 5 | Franklin actually dispatches and enforces the denial | **DYNAMIC_OBSERVED at engine level**: real compiled `HookEngine.dispatch('PreSpend', …)` loaded the user-scope hook via Franklin's own loader, spawned it once, parsed its stdout deny (and exit 2), short-circuited, returned `{decision:"deny",reason:"ARGUS_F1_PRESPEND_DENY_TEST"}`, and wrote the audit record to `$HOME/.blockrun/approvals.jsonl`. Negative control (hook removed) → `allow`, proving the outcome came from the hook through Franklin's code. |
| 6 | Operation stopped before tool execution | **STATIC_CONFIRMED**: in production flow the deny return precedes `handler.execute` (`src/agent/streaming-executor.ts:303–312` vs line 315). The executor path itself was not exercised dynamically (would require a live model turn). |
| 7 | Whether signing was entered | **Not entered in the tested process — DYNAMIC_OBSERVED by construction** (no handler ran; no signing library reachable from executed module closure; no keys present anywhere in sandbox). Not a general product guarantee. |
| 8 | Whether payment submission was entered | Same as #7: not entered in the tested process; no network client in the executed closure. |
| 9 | Whether any real payment occurred | **No payment occurred in this test (established by #7/#8 evidence).** Real-payment behavior end-to-end remains **NOT_VERIFIED**. |

Overall: **the PreSpend deny path is dynamically observed at Franklin's hook-engine level in a safe local run.** This is NOT an overall PASS for Franklin.

## What exactly was run

1. `git clone https://github.com/BlockRunAI/Franklin.git` into `/tmp/sandbox-franklin/franklin` (isolated, disposable; outside Argus sources).
2. Read-only inspection of `src/hooks/*`, `src/agent/streaming-executor.ts`, `src/tools/spend-tools.ts`, `src/audit/approvals.ts`, `src/tools/subprocess-env.ts`, `docs/examples/hooks/*`, `docs/live-e2e-checklist.md`, `test/hooks.local.mjs`.
3. `npm ci --ignore-scripts` (exit 0) → `npm run build` (exit 0). No upstream file modified (git status 0 lines after build/test).
4. Stage B harness `node /tmp/f1-testkit/run-test.mjs` (exit 0): synthetic PreSpend envelope for `JupiterSwap` (`spend.estimatedUsd=10` computed by Franklin's own estimator), dispatched through real `HookEngine`; unconditional deny hook installed in documented user-scope location inside a redirected temp `HOME`; hook invocation log; approvals.jsonl check; negative control.
5. Upstream's own deterministic suite re-run independently: `node --test test/hooks.local.mjs` → 13/13 pass, exit 0.
Commands & exit codes recorded verbatim in `02-install-build.log` and `03-hook-test.log`.

## What was NOT run (deliberately)

The interactive/headless CLI agent loop, any model request, anything touching the BlockRun gateway, any spend-tool handler, any wallet operation, any paid E2E (`RUN_PAID_E2E` never set). The safety gate (`01-hook-api-and-safety.md` §13) was written before execution and limited the dynamic test to the runner-level path whose module closure contains no network/signing capability.

## Evidence directory

`/workspace/franklin-prespend-deny-2026-10-12-retry/`:
- `00-environment-and-provenance.txt` — env, clone provenance, identity check
- `01-hook-api-and-safety.md` — Stage A2/A3 with file:line citations and pre-written safety gate
- `02-install-build.log` — install/build commands + exit codes
- `03-hook-test.log` — Stage B stdout/stderr, exit codes, hook envelope capture, approvals record, negative control, module-closure proof, dist hashes, upstream suite reproduction
- `04-signing-payment-safety-evidence.md` — per-claim classification incl. scoped "no signing/no submission" argument
- `run-test.mjs`, `deny-hook.sh`, `f1-prespend-deny.json` — the exact test kit (no secrets)
- `SHA256SUMS.txt` — hashes of the above
Previous F1 artifacts (`/workspace/franklin-prespend-deny-2026-10-12/`) preserved untouched.

## Remaining gaps / NOT_VERIFIED

End-to-end CLI dispatch through `StreamingExecutor` (needs a live model turn); real payment; settlement; post-payment delivery; real gateway behavior; repeat payments; production fallback; multi-session serve wiring. Documentation-vs-implementation discrepancy list: none material (§11 of doc 01).

## Constraints honored

No Argus modification/commit/push/PR/merge; no Franklin upstream or dependency modification; no funded wallet, keys, tokens, or credentials used or recorded; no paid request sent; fixed BlockRun endpoints not overridden; no mock substitution into upstream code; no claim of "no signature/no payment" beyond what the executed-process evidence establishes.
