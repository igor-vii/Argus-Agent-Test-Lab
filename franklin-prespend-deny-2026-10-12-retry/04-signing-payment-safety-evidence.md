# 04 — Signing / Payment Safety Evidence

Subject: `@blockrun/franklin` 3.49.6 @ `45b026c4ee93a4a34cb15cfa8a008ae6b89becd6`.
Tested trigger: `node /tmp/f1-testkit/run-test.mjs` (see `03-hook-test.log`, exit 0).

## What the executed code path was

The test imported ONLY these compiled upstream modules (hashes recorded in `03-hook-test.log`):
`dist/hooks/runner.js`, `dist/hooks/loader.js`, `dist/tools/spend-tools.js` (+ transitive
`dist/audit/approvals.js`, `dist/logger.js`, `dist/config.js`, `dist/tools/subprocess-env.js`).

Module-closure proof (appended to `03-hook-test.log`): every import specifier in the corresponding
`src/` files is either a `node:*` built-in or a repo-relative path. No third-party package
(`viem`, `@solana/web3.js`, `@polymarket/*`, `axios`, etc.) is reachable from this closure, and no
HTTP client exists anywhere in it. Therefore the executed code cannot contact any payment gateway,
wallet keystore, or signing library.

## Observations establishing the safety of THIS run

1. **No handler executed.** The harness never constructs a `StreamingExecutor`, never resolves a
   `CapabilityHandler`, and never calls `handler.execute` (`src/agent/streaming-executor.ts:315` is
   the only place spend-tool implementations run; it was not entered — no such object existed in
   the process). Wallet access, authorization signing, and payment submission live exclusively
   inside handlers, which were absent by construction.
2. **Deny enforced before any further step.** `engine.dispatch('PreSpend', …)` returned
   `{decision:"deny", reason:"ARGUS_F1_PRESPEND_DENY_TEST"}` after exactly ONE hook child-process
   invocation (captured envelope in `03-hook-test.log`). In the production pipeline the deny return
   happens at `streaming-executor.ts:303–312`, i.e. BEFORE `handler.execute` (line 315) — verified
   statically.
3. **No credentials present.** Sandbox real `$HOME` contains no `.blockrun` directory (listing in
   `03-hook-test.log`); no wallet session files (`.session`, `.solana-session`, per
   `src/config.ts:85–86`) exist; environment contained no `BLOCKRUN_API_KEY`,
   `BLOCKRUN_WALLET_KEY`, `BASE_CHAIN_WALLET_KEY`, or `SOLANA_WALLET_KEY` (the names enumerated in
   `src/tools/subprocess-env.ts:2–7`). Additionally, for spend/tool events the engine strips those
   names from the hook child env (`runner.ts:102` → `sanitizeSubprocessEnv`).
4. **Side effects confined.** All writes went to a disposable temp `HOME` created by the harness
   (`hook-invocations.jsonl`, `.blockrun/hooks/*`, `.blockrun/approvals.jsonl`). The user's real
   home was untouched because `process.env.HOME` was redirected BEFORE importing dist modules —
   the same isolation pattern as the upstream test itself (`test/hooks.local.mjs:16–17`).
5. **No paid request issued.** No model/gateway call occurred (no network client in the module
   closure; no agent loop started). Negative control: with the deny hook removed, dispatch returns
   allow without invoking anything else — confirming the deny outcome came from Franklin's engine
   running the hook, not from an incidental error.

## Classification of the specific claims

| Claim | Status | Basis |
|---|---|---|
| Franklin's HookEngine dispatched PreSpend to the configured deny hook and enforced its denial | **DYNAMIC_OBSERVED** | 03-hook-test.log: dispatch→deny, one captured stdin envelope, approvals.jsonl record written by engine code |
| A PreSpend deny stops the operation before `handler.execute` (i.e., before any tool implementation runs) | **STATIC_CONFIRMED** | streaming-executor.ts:303–315 ordering; executor path itself was not exercised dynamically |
| No payment authorization was signed during this test | **DYNAMIC_OBSERVED (scoped to this run)** | No signing library reachable from executed closure; no handler ran; no keys present. This establishes absence *within the tested process*, not a general product guarantee |
| No payment was submitted during this test | **DYNAMIC_OBSERVED (scoped to this run)** | Same closure argument: no HTTP/gateway client executed; deny short-circuited dispatch |
| In a real CLI session, PreSpend fires and denies end-to-end (model turn → tool_use → executor → handler blocked) | **NOT_VERIFIED** | Would require a live model/gateway request; deliberately not attempted |
| Real payment, settlement, post-payment delivery, gateway behavior, repeat payments, production fallback | **NOT_VERIFIED** | Out of scope; no scenario exercised them |
| Fail-open on timeout/crash/malformed output | **DYNAMIC_OBSERVED via upstream suite** | test/hooks.local.mjs 13/13 pass in this sandbox (log appended), including fail-open cases |

## Limits of the evidence

- The synthetic envelope was constructed by the harness following `streaming-executor.ts:89–106`;
  faithfulness to the production call site is source-verified, not observed through the executor.
- Deny enforcement at the ENGINE level is what was dynamically observed. Enforcement at the
  EXECUTOR level (cancelInvocation + "Spend blocked by a user hook" message) is static inference.
- Absence of signing/submission is proven for the tested process by construction (module closure +
  no keys + no handler), NOT by inspecting a gateway ("no transaction receipt" arguments are not used).
