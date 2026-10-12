# TASK F1-VERIFY — Independent forensic verification of the Franklin PreSpend evidence

Mode: **read-only**. No Franklin process was launched, no hook test re-run, no existing files or
Git state were modified (re-verified at the end: `git diff --name-status` empty; index untouched;
the only writes were new artifacts under this directory).

Subject: the `TASK F1-RETRY` claims for `@blockrun/franklin` v3.49.6 @ commit
`45b026c4ee93a4a34cb15cfa8a008ae6b89becd6`.

---

## 0. Scope note on the artifact path

The task directed verification to
`/workspace/sandbox-franklin-f1-retry/franklin-prespend-deny-2026-10-12-retry/`.
That directory **exists** and contains all eight required files plus three `.copy` files.
However, the F1-RETRY turn's own summary cited a *different* evidence location
(`/tmp/sandbox-franklin`, `/workspace/franklin-prespend-deny-2026-10-12-retry`). Both sets exist:

| Set | Location | Timestamps (UTC) | Pinned revision claim |
|---|---|---|---|
| E1 (task-directed) | `/workspace/sandbox-franklin-f1-retry/franklin-prespend-deny-2026-10-12-retry/` | 06:30–06:34 | 45b026c…, clone in `sandbox-franklin-f1-retry/franklin` |
| E2 (summary-consistent) | `/workspace/franklin-prespend-deny-2026-10-12-retry/` + `/tmp/sandbox-franklin/franklin` | 06:54–06:58 | 45b026c…, same HEAD verified live |

All six mandatory documents differ byte-for-byte between E1 and E2 (independent SHA256
recomputation of each pair). This is a **duplicate-inconsistent-artifact finding**, recorded as-is;
neither set was altered by this audit. Verification below covers both.

---

## A. Artifact integrity — verdicts

| Check | Verdict | Evidence |
|---|---|---|
| All 8 required files present in the task-directed dir | CONFIRMED | `ls`: 00-environment-and-provenance.txt, 01-hook-api-and-safety.md, 02-install-build.log, 03-hook-test.log, 04-signing-payment-safety-evidence.md, 05-report.md, f1_prespend_event.jsonl, SHA256SUMS.txt (+3 `.copy`) |
| E1 SHA256SUMS matches actual files | CONFIRMED | `sha256sum -c SHA256SUMS.txt` → 10/10 OK, exit 0 |
| E1 manifest completeness vs mandatory list | PARTIALLY_CONFIRMED | hashes all 7 mandatory content files + 3 copies; does **not** hash `SHA256SUMS.txt` itself (self-hash absent) |
| E2 dir: files present + manifest verifies | CONFIRMED | `sha256sum -c` → 10/10 OK, exit 0; same self-hash omission |
| E1 vs E2 content consistency | NOT_VERIFIED / anomaly | six numbered docs have different hashes across E1/E2; internally consistent but mutually divergent |
| Staged index blobs == worktree files | CONFIRMED | `git show :<path> \| sha256sum` == `sha256sum <path>` for SHA256SUMS.txt, f1_prespend_event.jsonl, approvals.jsonl, .gitignore |

## B. Dynamic-evidence checks

1. **Commands / exit codes / version pinned** — CONFIRMED.
   E1 `00-environment-and-provenance.txt` lines 20–41 record remote, branch=main,
   HEAD=45b026c4…, package `@blockrun/franklin 3.49.6`, engines node>=20.19.0, lockfileVersion 3;
   `02-install-build.log` lines 7–25 record `npm ci --no-audit --no-fund` exit 0 and
   `npm run build` exit 0. E2 `03-hook-test.log` line 26 records `RUN_TEST_EXIT=0`.
   Live re-check (read-only): `/workspace/sandbox-franklin-f1-retry/franklin` → remote
   `https://github.com/BlockRunAI/Franklin`, HEAD `45b026c4…`, package.json `@blockrun/franklin 3.49.6`;
   `/tmp/sandbox-franklin/franklin` → same HEAD. Node v20.20.2 / npm 10.8.2 recorded in both.

2. **Franklin's real dispatch path, not a standalone script** — CONFIRMED (both runs).
   E1 harness (`f1-prespend-deny-test.mjs.copy` lines 25–28, 50–58) imports compiled upstream
   `dist/hooks/runner.js`, `dist/hooks/loader.js`, `dist/tools/spend-tools.js`,
   `dist/agent/streaming-executor.js` and calls `StreamingExecutor.collectResults([invocation])`
   (line 58) — production gate verified in source at `src/agent/streaming-executor.ts:303-311`
   (compiled equivalent `dist/agent/streaming-executor.js:257-262`). The hook was spawned by
   Franklin's own `HookEngine.runHandler` (`execFile('/bin/sh', …)`, `runner.ts:106-119`), loaded by
   Franklin's own loader from `$HOME/.blockrun/hooks` (`loader.ts:28-30,50-65`; log step [2]
   `loaded: ['PreSpend:f1-deny.json:user']`). The deny audit row was written by Franklin's code
   (`runner.ts:70-79` → `appendApprovalRecord`, `approvals.ts:29-32`).
   E2 drives `HookEngine.dispatch('PreSpend', …)` directly with `estimatedUsd=10` computed by the
   official estimator module. Cross-check: the executed dist-file hashes recorded in E2 log
   (lines 52–55) match my independent recomputation of the same files inside the E1 clone
   byte-for-byte (e.g. `dist/hooks/runner.js = 9ab8f80a…508065`) — both runs used identical
   compiled artifacts of the pinned revision.

3. **Event / unique reason / result / audit coherence** — CONFIRMED.
   `f1_prespend_event.jsonl`: `hookEventName:"PreSpend"`, session `f1-prespend-deny-session`,
   `spend:{estimatedUsd:7.5, tool:"JupiterSwap", params:{input_mint:"USDC", amount:7.5}}` —
   matches envelope schema `types.ts:81-93` and spend-field construction
   `streaming-executor.ts:88-105`. Executor output (`03-hook-test.log` line 28) equals the
   production template at `streaming-executor.ts:308` and embeds `ARGUS_F1_PRESPEND_DENY_TEST`.
   `approvals.jsonl` row (log lines 34/48; file still present at
   `test-home/.blockrun/approvals.jsonl`) carries the same reason with `kind:"hook"`,
   `by:"hook:f1-deny.json"` — exactly the shape produced by `runner.ts:71-79`. Installed hook
   files are byte-identical to their `.copy` evidence twins (`diff` → identical). E2 shows the
   same pattern (amount 10, `hook:f1-prespend-deny.json`, control `allow`).

4. **Negative control semantics** — PARTIALLY_CONFIRMED.
   E1 step [8] (harness lines 89–100): same pipeline with `hooks: undefined` → stub handler DID
   execute; enforcement is attributable to the hook engine. Caveats: (a) it models
   `FRANKLIN_HOOKS=0` by omitting the engine rather than setting the env var (`loop.ts:660-661`);
   (b) the control runs against the **same disposable HOME where the deny hook is installed**, so
   it does not demonstrate that a real JupiterSwap handler "runs normally without the hook" — only
   that the stub executes when no engine is wired. Report phrasing slightly overstates this.

5. **Test handler did not execute** — CONFIRMED within test scope.
   `handlerExecuted=false` after denial (`03-hook-test.log` line 30; assertion harness line 69);
   the stub returns `"SHOULD NEVER RUN"` if called (line 48) — observed output instead is the
   production block message. Note: instrumented handler is a stub, not the real spend tool.

6. **No signing / payment submission** — mixed:
   * Within the executed test path: CONFIRMED by construction — deny returns before
     `handler.execute` (`streaming-executor.ts:305-311` vs line 315); wallet files
     `.session`/`.solana-session` absent from test HOME (`find test-home` lists only
     hooks + approvals; config expects them under `BLOCKRUN_DIR`, `config.ts:85-86`); spend-hook
     env sanitized (`subprocess-env.ts:2-13`, applied at `runner.ts:102`).
   * For REAL handlers: STATIC_CONFIRMED only (call ordering at `streaming-executor.ts:302-317`);
     no real handler was ever invoked dynamically.

7. **No network egress** — PARTIALLY_CONFIRMED.
   I independently re-ran the static closure check: modules on the executed path import only
   `node:*` built-ins and repo-relative files (grep over `src/hooks/*`, `spend-tools.ts`,
   `approvals.ts`, `logger.ts`, `config.ts`, `subprocess-env.ts`: no http/fetch/axios/got).
   However, no proxy capture, syscall trace, or firewall log exists in either evidence set.
   "No network request occurred" is therefore an inference from code inspection + absence of
   credentials, not a direct observation. Absence of a recorded request ≠ proof of absence.

8. **Citations match the pinned revision** — PARTIALLY_CONFIRMED.
   Verified at 45b026c: events incl. `PreSpend` `types.ts:15-23` ✔; `BLOCKING_EVENTS`
   `types.ts:26-29` ✔; `HookInput` `types.ts:81-94` ✔; deny logic `runner.ts:59-84,120-146,162-180` ✔;
   stdin write `runner.ts:156` ✔; reserved env `runner.ts:115-117` ✔; loader `loader.ts:4-8,28-34,50-65` ✔;
   `BLOCKRUN_DIR` `config.ts:43` ✔; approvals `approvals.ts:25-36` ✔; `FRANKLIN_HOOKS=0`
   `loop.ts:660-661` ✔; `SPEND_TOOLS`/`isSpendTool` `spend-tools.ts:79-110` ✔; docs README
   semantics lines 28/37/39/41/42 ✔. Minor off-by-one drift found: E1 cites the gate as
   `streaming-executor.ts:302-311` (actual `if` at 303; 301–302 are comments), `handler.execute`
   at 317 (actual 315), `isSpendTool` at 110–112 (actual 108–110); E1 `05-report.md` cites the
   block-message template as line 307 (actual 308). Semantics unaffected.

### Lineage caveat (provenance gap)
Clone reflogs show a single `clone:` entry dated 2026-10-12 with no later fetch/reset; HEAD equals
the claimed commit; tracked trees clean (only untracked `node_modules/`, `dist/`). But no
cryptographic binding ties the local checkout to GitHub's current main (re-cloning and comparing
tree hashes would close this; out of scope for read-only audit). Local checkout identity:
CONFIRMED. Identity with today's upstream HEAD: NOT_VERIFIED.

## C. Argus repository state (verbatim snapshot: `argus-git-state.txt`)

* HEAD `e7bba2aa62cacaf2d2377826797e90ef00c0235c`, branch `qwen-code-4bc672ac-…`, single-commit
  history (reflog: clone + checkout at 06:03 UTC; HEAD never moved).
* Index: `M .gitignore` + **31 staged additions** — full E1 set (incl. gitlink mode `160000`
  `sandbox-franklin-f1-retry/franklin` pinned at 45b026c…), full E2 set, and the 5 original-F1
  files under `franklin-prespend-deny-2026-10-12/`.
* Worktree vs index: clean (`git diff --name-status` empty); every spot-checked staged blob equals
  its file on disk. All staged files exist in the working tree.
* Original F1 (BLOCKED) artifacts preserved intact (mtimes 06:06–06:07, contents match the initial
  inventory) — not overwritten retroactively: CONFIRMED.
* `.gitignore` anomaly: worktree+index now contain `*.log\n` (6 bytes) vs 24-line rules at HEAD.
  E2's `06-completion-checks.txt` (line 6) described it as the 7-byte string `(empty` at
  06:58:17, while the file's mtime is 06:58:55 — i.e. it changed again after the RETRY turn ended.
  **Origin of the staged modifications cannot be established from saved snapshots** (no pre-work
  index snapshot exists anywhere; reflog proves only that HEAD didn't move). Flagged; nothing
  repaired.
* Risk note: the staged `*.log` ignore rule interacts with staged artifacts named
  `02-install-build.log` / `03-hook-test.log` — a future `git add .` would silently skip such
  files (already-staged entries remain committable).

## D. Final answers

1. **Dynamic invocation & enforcement of the deny hook** — CONFIRMED. Franklin's own loader,
   HookEngine, executor gate (E1) and dispatch/audit code (E2) produced the recorded outputs; two
   independent runs agree; executed-dist hashes cross-match between the clones.
2. **Test handler did not execute** — CONFIRMED within test scope (instrumented stub + negative
   control attributing causality to the engine). Does not extend to real spend handlers.
3. **Strength of no-signing / no-submission evidence** — STRONG within the tested path
   (pre-execute return + zero wallet material + sanitized env), partly by construction/static
   argument; for real handlers only STATIC_CONFIRMED; no gateway-side confirmation attempted.
   Overall as a general statement: PARTIALLY_CONFIRMED.
4. **Checksums verified?** — CONFIRMED: E1 10/10 OK, E2 10/10 OK; manifests cover the mandatory
   list except their own self-hash.
5. **Actual Argus index state** — dirty: 1 staged modification (`.gitignore`) + 31 staged
   additions (all F1/F1-RETRY artifacts, incl. a gitlink to the Franklin clone); worktree matches
   index; HEAD unchanged; no commits/pushes/PRs.
6. **Separate index-cleanup operation required?** — Recommended yes (decide keep-vs-unstage for
   the 32 staged entries, resolve the `.gitignore` `*.log` interaction, reconcile duplicate E1/E2
   evidence sets). **Not performed here** per read-only constraint.

No overall PASS for Franklin is asserted. Still NOT_VERIFIED (unchanged): model-driven end-to-end
trigger, real-handler interruption, x402/settlement/delivery, repeat payments, production
fallbacks, fail-open behaviors exercised dynamically.

## Files in this verification bundle
* `argus-git-state.txt` — verbatim read-only Git snapshot (Section C inputs).
* `00-f1-verify-report.md` — this report.
