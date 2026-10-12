# F1-RETRY — Signing / payment-submission safety evidence

Question: in the Stage B dynamic test, was any payment authorization signed or submitted?

## Positive observations (from the run itself)
1. **Tool handler never executed.** The production gate returns before `handler.execute()`
   (`src/agent/streaming-executor.ts:302-311`; execute at line 317). The test's stub handler sets
   `handlerExecuted = true` only if called; observed value after the denied call: **false**
   (`03-hook-test.log`, step [5]). All wallet/signing/submission logic lives inside real spend-tool
   handlers (Jupiter/Base0x/Polymarket code paths), which were never reached.
2. **No wallet existed anywhere on the tested path.** Test `HOME` was a disposable directory created
   minutes earlier containing only `.blockrun/hooks/f1-deny.{json,sh}`; post-run listing shows no
   `.session`, `.solana-session`, key files, or `api-key` (config checks at `src/config.ts:85-86`).
   Nothing to sign with.
3. **Hook subprocess environment is sanitized by design for spend events**: `runner.ts:98-103` drops
   `BLOCKRUN_API_KEY`, `BLOCKRUN_WALLET_KEY`, `BASE_CHAIN_WALLET_KEY`, `SOLANA_WALLET_KEY`
   (`src/tools/subprocess-env.ts:2-13`). Confirmed incidentally during the first run attempt: even our
   own harness env var did not reach the hook until declared in the hook config's explicit `env` grant.
4. **No network egress on the tested path.** The invoked modules perform only local work before the
   deny return: pure registry lookups (`spend-tools.ts`), file loads (`loader.ts`), one `/bin/sh`
   child process (`runner.ts:106`), one audit append (`approvals.ts:29-36`). No HTTP client is
   constructed anywhere between `collectResults` entry and the deny return (source inspection of the
   exact lines executed). The synthetic event used fake tool params; no gateway host was contacted.
5. **Franklin's own result confirms prevention**: output string produced by the production code path —
   `"Spend blocked by a user hook: ARGUS_F1_PRESPEND_DENY_TEST..."` with `isError=true`, plus the
   machine-readable deny record appended to `approvals.jsonl` by Franklin itself.
6. **Negative control proves the gate caused the stop**: identical pipeline without the HookEngine let
   the stub handler execute (step [8]) — so the non-execution in the test case is attributable to the
   PreSpend dispatch/enforcement, not to harness misconfiguration.

## Limits of these observations (stated honestly)
- The test drove Franklin's **production executor + hook engine** with a **synthetic invocation and a
  stub handler**, not a live agent session driven by a model against real Jupiter/Base0x handlers.
  For the REAL handlers we can state from source (`STATIC_CONFIRMED`) that the deny return happens
  strictly before their `execute()` bodies — hence before any signing/submission code inside them —
  but we did not dynamically observe a real handler being stopped.
- "No payment occurred" is established by construction (no wallet keys exist, handler not executed,
  no network calls on the executed path), NOT by querying any gateway for transaction receipts
  (not attempted — would itself be an external request).
- Full end-to-end loop behavior (model-driven trigger, x402 402-challenge flow, settlement, delivery
  after payment, retries, production fallbacks) remains **NOT_VERIFIED** — out of scope and unsafe here.

## Verdicts on the specific claims
| Claim | Status | Basis |
|---|---|---|
| PreSpend deny stops execution before the tool handler runs | DYNAMIC_OBSERVED | steps [3]–[5], negative control [8] |
| No authorization was signed during the test | DYNAMIC_OBSERVED (within test scope) | handler not executed; zero wallet material present |
| No payment was submitted during the test | DYNAMIC_OBSERVED (within test scope) | submission code unreachable pre-execute; no network on path |
| Real-world gateway behavior after a deny | NOT_VERIFIED | not exercised by design |
| Deny-before-sign holds for real spend handlers | STATIC_CONFIRMED | streaming-executor.ts:302-317 ordering |
