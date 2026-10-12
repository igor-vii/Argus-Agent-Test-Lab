# 01 — Hook API and Safety Analysis (Stage A2)

Subject: `@blockrun/franklin` **3.49.6**, upstream commit `45b026c4ee93a4a34cb15cfa8a008ae6b89becd6`
(branch `main`, cloned 2026-10-12T06:53Z from https://github.com/BlockRunAI/Franklin).
All file/line citations below refer to THIS revision (verified by reading the files at this checkout).

## 1. How hook configuration is discovered and loaded

`src/hooks/loader.ts`:
- Lines 28–34: two sources — user scope `~/.blockrun/hooks/*.json` (`userHooksDir()`, via `BLOCKRUN_DIR = path.join(os.homedir(), '.blockrun')`, `src/config.ts:43`) and project scope `<workDir>/.franklin/hooks/*.json`.
- Lines 50–65 (`loadHooks`): user hooks always load; project hooks load ONLY when the project dir appears in `~/.blockrun/trusted-projects.json` (`isProjectTrusted`, lines 37–48).
- Lines 67–140: `.json` files parsed; malformed files warn+skip (79–83); unknown event names silently ignored (90); matcher regex on lifecycle events rejected (117–122); handler must be `{type:"command", command:"..."}` (133–137).
- `src/hooks/runner.ts:36–44`: hooks are read ONCE at `HookEngine` construction (session start), not per event.

## 2. Documented `PreSpend` event name and blocking semantics

- Event list: `src/hooks/types.ts:15–23`; `PreSpend` present.
- Blocking set: `src/hooks/types.ts:26–29` — `PreToolUse` and `PreSpend` are the only veto-capable events.
- Docs agree: `docs/examples/hooks/README.md:28` — "`PreSpend` | **yes** | before a tool that moves real money executes".
- Dispatch semantics: `src/hooks/runner.ts:59–84` — handlers run sequentially, first deny short-circuits; for blocking events a deny returns immediately; non-blocking events always resolve `allow` (lines 70–83).

## 3. Exact JSON envelope delivered on stdin

Type: `src/hooks/types.ts:81–94` (`HookInput`). Written to child stdin as a single JSON line: `src/hooks/runner.ts:156–157` (`child.stdin.write(JSON.stringify(input))`).
Fields: `hookEventName, sessionId, cwd, timestamp`, optional `toolName`, `toolInput`, and for spend events `spend {estimatedUsd, tool, params}`.
Constructed for PreSpend in `src/agent/streaming-executor.ts:89–106` (`hookInput()`): `spend.estimatedUsd = estimateSpendUsd(name,input)` (null when unpriceable), `spend.tool = invocation.name`, `spend.params = invocation.input`.
Env vars additionally exported to the handler: `FRANKLIN_HOOK_EVENT`, `FRANKLIN_SESSION_ID`, `FRANKLIN_CWD` (`runner.ts:112–118`).

## 4. PreSpend fields in this revision

Present as documented: `spend.estimatedUsd` (`number | null`), `spend.tool` (`string`), `spend.params` (`Record<string,unknown>`) — `src/hooks/types.ts:88–93`. Estimator table: `src/tools/spend-tools.ts:79–95` (`SPEND_TOOLS`: JupiterSwap, Base0xSwap, Base0xGaslessSwap, PolymarketBet, BuyPhoneNumber=5, RenewPhoneNumber=5, VoiceCall=null, agent_talent, ImageGen, VideoGen, MusicGen). `isSpendTool()` = membership in that map (lines 108–110).

## 5. Supported deny mechanism

`src/hooks/runner.ts:120–139` + header comment 4–8:
- stdout JSON `{"decision":"deny","reason":"..."}` → deny **regardless of exit code** (parseDecision scans lines from the end, 162–179);
- exit code `2` → deny (reason defaults to `denied by <file> (exit 2)`);
- exit `0` without deny JSON → allow.
Docs match: `docs/examples/hooks/README.md:37`.

## 6. Timeout / crash / missing executable / malformed output handling

- Default timeout 5 s (`runner.ts:29`), per-handler override (`types.ts:55`).
- Timeout, crash, spawn failure, other non-zero exit codes, malformed stdout → **FAIL OPEN** (allow) + warn log (`runner.ts:141–145`; types.ts:8–12; README.md:38). Only an *explicit* deny blocks.
- Official test confirms fail-open behavior: `test/hooks.local.mjs:132–148` (timeout fails open; missing binary fails open).
- EPIPE on stdin write tolerated (`runner.ts:149–155`).
- Safety model statement: "hooks are a convenience layer, not a security boundary" (`types.ts:8`).

## 7. Where the hook runs relative to tool execution / wallet / signing / payment submission

`src/agent/streaming-executor.ts`, method `executeWithPermissions` (private, starts line 179). Observed order for a spend tool:
1. Handler resolution + schema canonicalization (179–235) — no side effects.
2. `PreToolUse` hook dispatch (236–248) — blocking.
3. `SessionToolGuard.beforeExecute` — trade-plan gate (249–255; `src/agent/tool-guard.ts:251+`).
4. Permission check / prompt (256–277; `src/agent/permissions.ts:107+`).
5. **`PreSpend` hook dispatch (303–312)** — blocking. On deny: `guard.cancelInvocation` and return error text `"Spend blocked by a user hook: …"` — **before** step 6.
6. `handler.execute(invocation.input, progressScope)` (line 315) — this is where any spend tool implementation (wallet access, authorization signing, gateway/payment submission) would first run.
7. After success: notify-only `PostToolUse` / `PostSpend` (320–324).

Therefore a PreSpend deny provably prevents `handler.execute` from ever being called for that invocation. Whether a given spend handler itself signs/submits is internal to the handler and was NOT exercised (see §9).

## 8. Denial recording

`src/hooks/runner.ts:71–79`: every blocking deny calls `appendApprovalRecord({kind:'hook', decision:'deny', by:'hook:<file>', reason, sessionId, subject})`.
`src/audit/approvals.ts:25–36`: append-only JSONL at `~/.blockrun/approvals.jsonl` (path derived from `os.homedir()`, so it follows `HOME`; best-effort write). Applies to this revision (code present and invoked).

## 9. Disabling / bypassing

- `FRANKLIN_HOOKS=0` → `hookEngine` is `undefined` in the agent loop: `src/agent/loop.ts:659–661`. Docs match: `README.md:42`.
- No hooks configured for an event → `hasHooks()` fast-path skips dispatch (`runner.ts:47–49`; call sites guard with it).
- Project-scope hooks never load unless project trusted (`loader.ts:54–63`).

## 10. Can PreSpend be triggered WITHOUT a payment path? — YES (locally)

Two faithful mechanisms exist in the repo itself:
- `HookEngine.dispatch('PreSpend', input)` is a public method of the built artifact (`dist/hooks/runner.js`); the official local test suite drives it exactly this way with synthetic envelopes and asserts "No network, no wallet" (`test/hooks.local.mjs:1–21`, esp. 158–172 which dispatches a synthetic `PreSpend` for `JupiterSwap`). HOME is redirected to a temp dir before import so `~/.blockrun` is never touched (lines 16–17).
- The full pipeline position (§7) is source-verified; the executor's dispatch call site is `streaming-executor.ts:303–304`.
Running the real agent CLI to reach PreSpend would require a model turn (network/gateway) and a real spend-tool invocation whose handler could touch wallet/signing code if allowed — therefore the CLI path is deliberately NOT used for the deny test. The runner-level test uses the same production code (`dispatch` → `runHandler` → child process → deny enforcement inside `dispatch` → `appendApprovalRecord`), differing from the CLI only in who constructs the envelope.

## 11. Documentation vs implementation discrepancies

None material found for the tested contract (event names, blocking set, deny semantics, fail-open, approvals.jsonl, FRANKLIN_HOOKS=0 all match between `docs/examples/hooks/README.md` and `src/hooks/*`). One nuance: README says PreSpend fires "before a tool that moves real money executes"; implementation additionally places PreSpend AFTER PreToolUse, trade-plan guard, and permission checks (`streaming-executor.ts:236–312`) — i.e., a spend can also be stopped earlier by those gates; docs do not state the ordering explicitly. Noted, not contradictory.

## 12. Official examples inspected

- `docs/examples/hooks/daily-spend-cap.json` (+`.sh`): PreSpend deny via stdout JSON + exit 2 above a daily cap — matches the §5 contract.
- `docs/examples/hooks/session-spend-log.json` (+`.sh`): PostSpend notify-only ledger append.
- `docs/examples/hooks/token-blacklist.json` (+`.sh`): PreToolUse matcher on swap tools.
- Install location per README: copy json+script into `~/.blockrun/hooks/` (README.md:9–15).

## 13. Stage A3 safety gate decision (written BEFORE running anything)

Proposed trigger: build the upstream tree unchanged (`npm ci --ignore-scripts` + `npm run build`), then run a test-only script OUTSIDE `src/` that imports the real compiled `dist/hooks/runner.js` + `dist/hooks/loader.js` + `dist/tools/spend-tools.js`, sets `HOME` to a disposable temp dir, installs a test-only deny hook JSON in `$HOME/.blockrun/hooks/` (the documented user-scope location), constructs a synthetic `PreSpend` envelope for `JupiterSwap` exactly as `streaming-executor.ts:89–106` does, and calls `engine.dispatch('PreSpend', input)`.

Why safe:
- No agent loop, no model request, no gateway URL is contacted (module closure verified: `src/hooks/*`, `src/audit/approvals.ts`, `src/tools/spend-tools.ts`, `src/logger.ts`, `src/config.ts`, `src/tools/subprocess-env.ts` import only `node:*` built-ins — verified by grep, see 03-hook-test.log appendix).
- No wallet keys exist in the sandbox env; no signing library is imported by these modules; nothing invokes `handler.execute`.
- The deny hook makes the dispatch return before any further step could occur; even the hypothetical allow-path here executes no handler at all (there is no handler in this harness).
- Side-effect surface: writes confined to temp `$HOME` (approvals.jsonl, hook-state) — disposable.
This exercises Franklin's REAL dispatch/enforcement/recording code path (`HookEngine.dispatch`), not just a hook script, satisfying the "direct hook-script test alone is insufficient" requirement at the engine level. The remaining gap (executor wiring around `handler.execute`) is covered by source inspection (§7) and marked STATIC_CONFIRMED.

Gate result: PASS — proceed to Stage B with the runner-level test only. CLI live-path remains unexercised and will be reported as such.
