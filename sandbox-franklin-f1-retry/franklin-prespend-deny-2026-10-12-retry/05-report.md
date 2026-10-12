# TASK F1-RETRY — Final forensic report (Franklin PreSpend deny path)

## Verdict table

| # | Claim | Status |
|---|---|---|
| 1 | Official source acquired, revision pinned (`45b026c4…`, `@blockrun/franklin` v3.49.6, main, clean tree) | DYNAMIC_OBSERVED (clone/inspection commands ran; provenance in `00`) |
| 2 | Install/build succeed with documented commands (`npm ci`, `npm run build`, both exit 0) | DYNAMIC_OBSERVED (`02-install-build.log`) |
| 3 | PreSpend hook API documented and source-verified (envelope, spend fields, deny semantics, ordering, audit log, FRANKLIN_HOOKS=0) | STATIC_CONFIRMED + cited (`01-hook-api-and-safety.md`) |
| 4 | Test-only hook script denies unconditionally | DYNAMIC_OBSERVED (hook event log; stdout JSON + exit 2) |
| 5 | **Franklin's real dispatch path invokes the deny hook and enforces the denial** | **DYNAMIC_OBSERVED** (`03-hook-test.log` steps [2],[3],[4],[7]) |
| 6 | Operation stopped before tool execution | DYNAMIC_OBSERVED (stub handler `handlerExecuted=false`; negative control proves causality) |
| 7 | Signing entered? | NO — within test scope: DYNAMIC_OBSERVED (handler never executed; no wallet material existed). For real handlers: STATIC_CONFIRMED pre-execute ordering. |
| 8 | Payment submission entered? | NO — same basis as #7 (`04-signing-payment-safety-evidence.md`) |
| 9 | Any real payment occurred | None observed; gateway-side confirmation NOT_VERIFIED by design (no receipt query attempted) |

No overall "PASS for Franklin" is claimed. This tests one hook path only.

## What was run
- Clone: `git clone https://github.com/BlockRunAI/Franklin` → `/workspace/sandbox-franklin-f1-retry/franklin`
  (upstream files never modified: post-run `git diff` = 0 tracked changes; only untracked `node_modules/`, `dist/` from documented install/build).
- `npm ci --no-audit --no-fund` (exit 0, 1176 pkgs), `npm run build` = `tsc && node scripts/copy-plugin-assets.mjs` (exit 0). Node v20.20.2, npm 10.8.2, Linux.
- Stage B harness (test-only, outside upstream tree): `HOME=<disposable test-home> node f1-prespend-deny-test.mjs` → exit 0, all assertions passed. It imports the compiled official modules and drives the production pipeline `StreamingExecutor.collectResults → executeWithPermissions → isSpendTool gate → HookEngine.dispatch('PreSpend') → /bin/sh hook → deny enforcement → approvals.jsonl audit`.
- Trigger choice: synthetic `PreSpend` invocation through the real executor (repo's own supported pattern: its deterministic local suite `test/hooks.local.mjs` does exactly this — "No network, no wallet"). A live model-driven trigger would require a paid LLM request → deliberately not used.

## What was observed (key artifacts)
- Hook received envelope: `{"hookEventName":"PreSpend","sessionId":"f1-prespend-deny-session",...,"spend":{"estimatedUsd":7.5,"tool":"JupiterSwap","params":{"input_mint":"USDC","amount":7.5}}}`.
- Franklin result: `isError=true`, output `"Spend blocked by a user hook: ARGUS_F1_PRESPEND_DENY_TEST. Do not retry the same call — …"` (production string from `streaming-executor.ts:307`).
- Franklin audit record written by its own code: `{"kind":"hook","subject":"JupiterSwap","decision":"deny","by":"hook:f1-deny.json","reason":"ARGUS_F1_PRESPEND_DENY_TEST"}` in `<test-home>/.blockrun/approvals.jsonl`.
- Negative control (no HookEngine, equivalent of `FRANKLIN_HOOKS=0` per `loop.ts:660-661`): stub handler DID execute → enforcement is attributable to the PreSpend gate.
- Docs-vs-code discrepancies: none found at this revision (README semantics match `runner.ts`/`types.ts` line-by-line).

## Evidence directory
`/workspace/sandbox-franklin-f1-retry/franklin-prespend-deny-2026-10-12-retry/`:
`00-environment-and-provenance.txt`, `01-hook-api-and-safety.md`, `02-install-build.log`,
`03-hook-test.log`, `04-signing-payment-safety-evidence.md`, `05-report.md`,
`f1_prespend_event.jsonl` (raw hook stdin log), `SHA256SUMS.txt`.
Previous attempt's artifacts preserved untouched at `/workspace/franklin-prespend-deny-2026-10-12/`.
No secrets/keys/tokens present or recorded (none existed anywhere in the sandbox).

## Still only static / still NOT_VERIFIED
- Real end-to-end session (model emits an actual JupiterSwap/Base0xSwap call): NOT_VERIFIED (would need paid LLM).
- Real spend-tool handlers being halted mid-wallet-flow: STATIC_CONFIRMED only (code ordering), not dynamically observed.
- Gateway/x402 behavior, settlement, post-payment delivery, duplicate-payment protection, production fallbacks: NOT_VERIFIED — no separate scenarios run.
- Fail-open behaviors (timeout/crash/malformed output → allow): STATIC_CONFIRMED from `runner.ts:141-145`; not exercised dynamically in this minimal test.

## Safety statement
No commits, pushes, PRs, merges; Argus working tree untouched; no funded wallet, keys, or credentials used or created; no paid requests sent; fixed BlockRun endpoints untouched; no upstream patching to inject mocks (the mock/stub exists only in the test harness at the registry boundary, mirroring the repo's own supported test architecture).
