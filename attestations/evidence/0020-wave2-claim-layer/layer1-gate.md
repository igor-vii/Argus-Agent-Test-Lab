# Layer-1 gate record — wave 2 run (§2 of the runner spec)

Run date: 2026-11-12 (UTC). Operator: offline battery, no network beyond the pin checkout.

## 1. Pin identification

- Repo: `cv-scvd/scvd-general-store-repo` (the repository hosting the campaign thread).
- Pin: `56d6db340505dec2fec9d89780a498ff9ba37bfb`
- Commit metadata (at checkout): author `keeper`, subject `Merge pull request #1071 from seancrecord/claude/probe-exception-handling-agz24s`, commit date `2026-10-31T10:26:02-04:00` = **2026-10-31T14:26:02Z** — exactly the timestamp @cv-scvd cited when re-verifying the pin ("fresh pin re-check unchanged … (2026-10-31T14:26:02Z)").
- Acquisition: the pin is **not** an ancestor of the current `origin/main` (`794549cf3b93434fccc61c306965e4bcb60c0661` — the active branch has moved past it). The commit was obtained by `git fetch origin 56d6db340505dec2fec9d89780a498ff9ba37bfb` (GitHub serves it by SHA) and checked out locally. All validation and the battery ran against this checkout.
- Verification cross-check: the commit page `https://github.com/cv-scvd/scvd-general-store-repo/commit/56d6db340505dec2fec9d89780a498ff9ba37bfb` returns HTTP 200; the same probe on the other 15 public repos of the account returned 404 (probe log retained in the work directory).

## 2. Pinned files — sha256 at the pin (gate time; re-checked after the run: identical)

| File | sha256 |
|------|--------|
| `src/lib/idempotency.ts` | `5eb55c019eca03789b24768b7b2c67bbea776ed2be226a9f8f91a95ccae05b13` |
| `src/services/paid-recovery.ts` | `4212ace707b3b2d7a80fe4a5e5cbf2ce9943b61ec28c351ecb5249f9b9e23c91` |
| `src/services/purchase-intent.ts` | `bd796c7bf3d6a5a006e3931ce090889086cad53a2c9f18446fc1d9635cdca965` |

## 3. Line-by-line quote verification (thread quotes → pin source)

| Element | Thread quote | Pin location | Result |
|---------|--------------|--------------|--------|
| S1 claim primitive | `claimIdempotentPurchase()` get-or-put `"idempotent-purchase"` | `src/services/paid-recovery.ts:221-228` | **verbatim match** |
| S2 caller | `beginVerifiedPurchaseIntent()`: `claimIdempotentPurchase(id)`; `owner !== id`; `existingPurchase()`; `!saved` throw `"Original purchase admission pending"`; owner/payer/path/door check; `throw new RecordedPurchase(env, original)` | `src/services/purchase-intent.ts:321-333` (consistency check `:329` throws `"Original purchase owner mismatch"`) | **verbatim match** |
| S3 recorded-body mapping | `unknown → settlement_unknown`, `settled → pending`, else `refused` | `src/services/purchase-intent.ts:163`; codes `:21-22` (`pending: "purchase_recovery_pending"`, `refused: "purchase_not_settled"`); body carries `charged_again: false, settlement_attempted: false` (`:161`) and the "This payment already has a purchase record…" text (`:162`) | **verbatim match** |
| S4 cache + slot derivation | stranger comment; `kvKeyFor`; slot name hashed again; `idempotentPurchaseSlot` + `namespace.get(namespace.idFromName(slot))`; `lookupIdempotent`/`storeIdempotent`; `idempotent_replay: true` | `src/lib/idempotency.ts:70` (comment), `:277-288` (kvKeyFor, EVM-lowercase normalization), `:290-303` (slot name = `idempotency:sha256(kvKeyFor)`), `:305-310` (idempotentPurchaseSlot; also matches the cited `idempotency.ts:312-316` region of the original pin post), `:370-392` / `:394-416` (lookup/store), `:430-438` (`replayNote`, `idempotent_replay: true`) | **verbatim match** |
| S4/C2 gating | "The read sits behind verified-payer gating before it's reachable"; payer = "the account that actually SIGNED" | `src/lib/payment-gate.ts:1328-1358` (`idempotencyPayer = payerOfVerifiedRequest(result.paymentPayload, …)`; `!idempotencyPayer` → 503 before the cache read), rationale comment `:1300-1314`; MCP door equivalent `src/routes/mcp.ts:1006-1024` (`replayFor(verifiedPayer, key)`); cache key `idem:${surface}:${payer}:${sha256(key)}` in `src/lib/kv-keys.ts:352-354` | **verbatim match** |

Gate verdict: the thread quotes are the pinned source at `56d6db3…`; no divergence found. The re-implementation proceeded.

## 4. Runner

- Source: `scripts/wave2-runner.mjs` (copy sealed as `run/runner-source.mjs`).
- sha256: `26f60fd318c60158a86549550a5e3030e97f6afebc0a4b6ae6a0500c2acd0bde`
- Runtime: Node v24.22.2, offline, deterministic (fixed clock, counter-based identities; the wall-clock race is replaced by controlled interleave at the loser's read point — per spec §3).
- Scope carried into the battery: platform single-writer-per-ID = pinned assumption (per-slot transaction mutex); settlement mocked; cache empty on the H2 claim-path rows (KV replay is a separate post-settlement mechanism, out of scope per the amended H2 scope note); C2 rows exercise the cache gating itself.

## 5. Battery result (Layer-1)

- Rows: 10 (H2: {A-wins, B-wins} × {B1, B2, B3, B4}; C2a; C2b). Asserts: 83. Failures: **0**.
- Branch mapping observed, both orders: B1 → `Original purchase admission pending`; B2 → `settlement_unknown`; B3 → `purchase_recovery_pending`; B4 → `purchase_not_settled`. Every recorded-body row: `settlement_attempted: false`, `charged_again: false`, no `idempotent_replay` key. Exactly one settlement attempt per case.
- C2a: asserted-but-unverified payer → read denied before cache consultation; P's cached entry intact. C2b: verified stranger keys on their own payer → cache miss; stranger slot ≠ P's slot (different `idempotency:` names).
- Raw artifacts: `layer1-log.jsonl`, `layer1-asserts.jsonl`, `verdicts.md`.
