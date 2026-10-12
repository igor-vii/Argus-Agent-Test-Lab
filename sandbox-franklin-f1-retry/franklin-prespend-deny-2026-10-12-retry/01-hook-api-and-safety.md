# F1-RETRY Stage A2 — Hook API and safety analysis (primary evidence)

Subject: `@blockrun/franklin` v3.49.6, upstream commit `45b026c4ee93a4a34cb15cfa8a008ae6b89becd6`
(repo https://github.com/BlockRunAI/Franklin, branch `main`, clean tree). All citations are to
files at that exact revision in `/workspace/sandbox-franklin-f1-retry/franklin`.

## 1. Hook discovery & loading
- `src/hooks/loader.ts:4-8` — sources in load order: `~/.blockrun/hooks/*.json` (user scope, always trusted), `<project>/.franklin/hooks/*.json` (project scope, only if project is in `trusted-projects.json`).
- `src/hooks/loader.ts:28-34` — `userHooksDir()` = `BLOCKRUN_DIR/hooks`; `BLOCKRUN_DIR` = `path.join(os.homedir(), '.blockrun')` (`src/config.ts:43`) → **redirectable via `HOME`**.
- `src/hooks/loader.ts:50-65` — `loadHooks(workDir)`; malformed files/unknown events are warned and skipped (`loader.ts:10-12`).
- Config schema (`src/hooks/types.ts:50-68`): `{ "hooks": { "<Event>": [ { "matcher"?: regex-on-tool-name, "hooks": [ { "type":"command", "command", "timeout?", "env?" } ] } ] } }`.
- Engine construction: `src/agent/loop.ts:660-661` — `process.env.FRANKLIN_HOOKS === '0' ? undefined : new HookEngine({ workDir })`. Hooks loaded once per session (`runner.ts:36-38`).

## 2. PreSpend event name & blocking semantics
- Event list incl. `'PreSpend'`: `src/hooks/types.ts:15-23`.
- `BLOCKING_EVENTS = { PreToolUse, PreSpend }`: `src/hooks/types.ts:26-29`. All other events notify-only.
- Dispatch decision logic: `src/hooks/runner.ts:59-84` — sequential handlers per event; first deny short-circuits (blocking events only).

## 3. stdin JSON envelope
- `HookInput` shape: `src/hooks/types.ts:81-94` — `{ hookEventName, sessionId, cwd, timestamp, toolName?, toolInput?, spend? }`.
- Written to handler stdin: `src/hooks/runner.ts:156-157` (`child.stdin.write(JSON.stringify(input))`).
- Reserved env vars injected: `FRANKLIN_HOOK_EVENT`, `FRANKLIN_SESSION_ID`, `FRANKLIN_CWD` (`runner.ts:112-118`).

## 4. PreSpend fields (`spend.*`)
- Built at `src/agent/streaming-executor.ts:88-105` (`hookInput`): for `PreSpend`/`PostSpend`, `base.spend = { estimatedUsd: estimateSpendUsd(name,input), tool: name, params: input }`.
- `estimatedUsd` is `null` when unpriceable at call time (`src/tools/spend-tools.ts:12-16`, types `types.ts:88-93`).
- Spend-tool registry (`src/tools/spend-tools.ts:79-95`): JupiterSwap, Base0xSwap, Base0xGaslessSwap, PolymarketBet, BuyPhoneNumber, RenewPhoneNumber, VoiceCall, agent_talent, ImageGen, VideoGen, MusicGen. `isSpendTool` = membership test (`spend-tools.ts:110-112`).

## 5. Deny mechanism
Documented (`docs/examples/hooks/README.md` "Semantics") AND implemented (`src/hooks/runner.ts:4-8, 120-146`):
- stdout `{"decision":"deny","reason":"..."}` → deny regardless of exit code (`runner.ts:121-126`; tolerant line-scan `runner.ts:162-180`).
- exit code 2 → deny (`runner.ts:133-139`).
- exit 0 / no decision → allow.
- timeout (default 5s, `runner.ts:29,87`), crash, spawn failure, other non-zero exits → **fail open** (allow + warn log) (`runner.ts:141-145`; design note `types.ts:8-12`).

## 6. Position of PreSpend relative to execution/wallet/payment
- Gate site: `src/agent/streaming-executor.ts:302-311` inside `executeWithPermissions`:
  `if (isSpendTool(name) && hooks.hasHooks('PreSpend')) { dispatch; on deny → return error result WITHOUT calling handler.execute }`.
  `handler.execute(...)` runs only afterwards (`streaming-executor.ts:317`).
- Therefore a PreSpend deny occurs **before the spend tool's handler executes** — i.e., before any wallet access, authorization signing, or payment submission performed inside that handler. Ordering vs. PreToolUse/guard/permission gates: hooks fire first (`streaming-executor.ts:236-247`), then guard, permissions, then PreSpend gate immediately before execute.

## 7. Denial recording
- Every blocking deny appends an audit record: `runner.ts:71-79` → `appendApprovalRecord({kind:'hook', decision:'deny', by:'hook:<file>', ...})`.
- Log path `~/.blockrun/approvals.jsonl` (`src/audit/approvals.ts:25-27`), best-effort append (`approvals.ts:29-36`). Applies to this revision (code present at pinned commit).

## 8. Disable / bypass
- `FRANKLIN_HOOKS=0` disables the engine entirely (`src/agent/loop.ts:660-661`; README "disable all hooks with FRANKLIN_HOOKS=0").
- No matching hook registered for an event → fast-path skip (`runner.ts:46-49,60-61`).

## 9. Env sanitization for spend hooks
- `runner.ts:98-103`: when `toolInput` or `spend` present, inherited env is passed through `sanitizeSubprocessEnv()` which drops wallet/account keys; hook's own configured `env` still applies. (Relevant safety property: a model-influenced hook invocation does not receive wallet secrets in its environment.)

## 10. Official examples inspected
- `docs/examples/hooks/daily-spend-cap.json` + `.sh` — PreSpend deny via stdout JSON + exit 2; uses `jq -r '.spend.estimatedUsd // empty'`.
- `docs/examples/hooks/session-spend-log.json` + `.sh` — PostSpend ledger (non-blocking).
- `docs/examples/hooks/token-blacklist.json` + `.sh` — PreToolUse matcher example.
- README table matches implementation on every point checked (events, blocking flags, exit-2/stdout deny, fail-open, 5s default timeout, approvals.jsonl, FRANKLIN_HOOKS=0, spend fields). **No doc-vs-code discrepancies found.**

## 11. Can PreSpend be triggered without any payment path?
Yes, via two supported routes:
1. **Real dispatch code, synthetic event**: the repo's own deterministic local test suite imports the built `dist/hooks/*` modules with `HOME` redirected to a temp dir (`test/hooks.local.mjs:1-16`, "No network, no wallet"). Constructing a real `HookEngine` and dispatching a synthetic `PreSpend` exercises Franklin's actual dispatch/enforce/audit code without invoking any tool handler, gateway, or wallet.
2. Full agent-loop trigger would require a model-driven tool invocation → paid LLM request → **not allowed** by task constraints; not used.

## Stage A3 — Safety gate decision (written before executing anything)
Proposed test: after `npm ci` + `npm run build` (documented commands), create a test-only deny hook **outside the source tree** under `$TEST_HOME/.blockrun/hooks/`, then run a Node script that imports the compiled official modules (`dist/hooks/runner.js`, `dist/hooks/loader.js`, `dist/tools/spend-tools.js`, `dist/agent/streaming-executor.js`) and:
- verifies `isSpendTool('JupiterSwap')` and `estimateSpendUsd('JupiterSwap', {...})` (pure functions);
- builds a real `HookEngine` from the temp HOME (official loader path);
- constructs a real `StreamingExecutor` with a stub handler whose `execute()` records that it was called, then invokes the executor's own `executeWithPermissions` pipeline so the **production PreSpend gate** (`streaming-executor.ts:302-311`) dispatches a synthetic `PreSpend` envelope;
- asserts the returned result is the "Spend blocked by a user hook" error and that the stub handler never executed;
- reads `$TEST_HOME/.blockrun/approvals.jsonl` for the recorded deny.

Why safe: no network calls by these modules on this path; no wallet exists in `TEST_HOME`; the spend tool itself is a local stub, so neither signing nor payment-submission code is reachable; nothing in the flow contacts BlockRun endpoints; no paid model request is made. No upstream file is modified; the hook config/script live outside the repo.
Gate status: **PASS** — proceed to Stage B.
