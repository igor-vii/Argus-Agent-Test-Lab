# Layer-1 gate — argus-seal-0021 (Nano cross-process battery)

Gate run before the first sealed artifact. Nothing below was produced by the battery; all of it
is source-side validation at the pinned commit.

## SUT and pin

- SUT: `agent-passport-system/agent-passport-gateway`, PR #14 ("Nano payment lifecycle in source, not activated").
- Pin: `99888e8f143eb0c281ccd62759750038c1a1aa9e`, commit dated `2026-11-11 22:18:15 -0800` (= `2026-11-12T06:18:15Z`).
- Acquisition: plain `git clone` + checkout — the pin IS an ancestor of current `main` (PR #14 merged as `4784153`). No fetch-by-SHA needed, unlike wave 2. Recorded because the SUT owner explicitly asked that the test stay pinned to `99888e8` while main has moved; the battery ran against the pinned checkout only.
- Environment: Node v24.22.2, offline; dependencies installed from the vendor's lockfile (`better-sqlite3`, `nanocurrency-web`, `tsx`). No network calls at any point; the fake Nano node is in-process.

## Vendor's own suite at the pin (sanity)

`npx tsx --test test/payment-rails/wallet-ops.test.ts` in our environment before the battery was
built: **22/22 PASS** (their claim-layer suite — reserve, replay, mismatch, busy-refusal, leases).
This establishes that the pinned implementation behaves as the vendor's own tests expect in our
environment, independent of anything below.

## Thread quotes verified verbatim at the pin

| # | Thread statement (source) | Verified at pin | Result |
|---|---|---|---|
| S1 | aeoess #30: "`reserveSend` uses a `better-sqlite3` transaction with `.immediate()` for the key lookup and reservation" | `src/payment-rails/wallet-ops.ts:187-246`: `reserveSend(...)` returns `db.transaction(...).immediate()`; the key lookup (`replayOrMismatch`), account-busy refusal, pilot caps, chain-spend holds and the reservation insert all sit inside that single transaction | verbatim ✓ |
| S2 | registered R1/R2 semantics: same key + same payment returns the original; same key + different amount/recipient refused | `wallet-ops.ts:153-161` `replayOrMismatch`: same `(tenant_id, idempotency_key)` row with matching `request_fingerprint` returns the row (`replay: true`); differing fingerprint throws `WalletOpError('idempotency_mismatch', ...)`. Fingerprint = `sendFingerprint` (:115-122) over kind/tenant/agents/wallet/account/delegation/recipient/unit/amount | verbatim ✓ |
| S3 | registered R3: different keys, same wallet, first payment unfinished → second refused | `wallet-ops.ts:163-166` `refuseIfAccountBusy` + `ACTIVE` (:23 `status IN ('reserved','prepared','admitted')`): throws `WalletOpError('wallet_busy', 'another operation is in flight on this Nano account')` | verbatim ✓ |
| S4 | registered "409" expectations for R2a/R2b/R3 | `src/payment-rails/wallet-routes.ts:142-144`: `const code = e.code === 'bad_request' ? 400 : 409` — `idempotency_mismatch` and `wallet_busy` surface as HTTP 409. The battery observes `WalletOpError.code` and applies this pinned mapping (the route layer itself is not booted; recorded as scope note) | verbatim ✓ |
| S5 | registered R4: retry after publication re-publishes the same stored block, no new signature | `src/payment-rails/nano-publish.ts`: `commitAttempt` (:152-206) mints a one-shot `AttemptToken` carrying the stored block from `wallet_ops.block_json`; `publishAttempt` (:208-231) spends the token and sends exactly that block to `process`. The only signing path is `prepareOp` (:243+). The vendor's own test C3 ("a retry sends the identical block", `test/payment-rails/nano-publish.test.ts:147`) pins the same semantics | verbatim ✓ |
| S6 | cross-process claim takeover | `wallet-ops.ts:275-281` `takeOver`: expired lease (`lease_until <= now`) with ACTIVE status → increments `claim_epoch`, re-leases to the new owner; every later write by the old holder changes zero rows | verbatim ✓ |
| S7 | two OS processes against one file-backed SQLite | `src/db/schema.ts:113-121` `initDB(path)`: `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000` — the cross-process write-serialization substrate the battery exercises | verbatim ✓ |
| S8 | aeoess #26: tenant-scoped idempotency key; delegation budgets checked and reserved in the same transaction | `wallet-ops.ts:196-246`: key check + `unitChainRows`/`boundChainSpendRows`/`unitSpendViolation` + `applyUnitSpend` + both inserts inside the one IMMEDIATE transaction | verbatim ✓ |

## Pinned file hashes (sha256, at commit 99888e8)

```
5efcba3d0895240fef24785c9dc4b004b319c4a536fa47fffd76eea70bb09b7d  src/payment-rails/wallet-ops.ts
ac80f093fa6b63cc398794f64d1b014138a5fafc1e03e9ac217d8f880364ab4f  src/payment-rails/nano-publish.ts
f6e55b174bcded981ef6b58f19909518dd713bdcc4046b9d60d72317996d025d  src/payment-rails/wallet-routes.ts
69dc19167fccc351fc8fc21bdf2e7fad34ba4026767f5f118dc5879ead287775  src/payment-rails/wallet-frontier.ts
dd5ad69afaecee0309602fabc62b40c47052c59a73068326a8e29b8729989cb7  src/payment-rails/nano-block.ts
3f63330b62d63d4552641fdc13d83b91240bb3a68c31ef5c0ba62378ad647d9d  src/db/schema.ts
1372e79129b5f99a079ab5438d5980cc76b867a500b16e52cc890a4a5981a575  test/payment-rails/wallet-ops.test.ts
2fd67bedb9ac1398a06936d42572605572b4b2ba20026c6c0704eb9853af0c8e  test/payment-rails/nano-publish.test.ts
1f3dbb24a3d254cfa7b2a4709fdad1ad88b875b9ebca78627719942a89d47e91  test/payment-rails/pilot-fixtures.ts
acd7814b141e5c679b069d2b427099558b369398216b1943b775bea374324898  package.json
```

## Procedure notes (freeze discipline)

- Pre-registration: `x402-foundation/x402` issue #4198, comment 6817874244 (igor-vii, 2026-11-12T07:47:14Z). Rows frozen as of that post. Unlike the wave-2 registration, this pre-registration contains no 24-hour hold clause; the single owner question arrived before the run — aeoess comment 6829861656 (2026-11-12T16:45:19Z) asking R2's starting state — and was resolved by the R2a/R2b split in comment 6831739390 (2026-11-12T18:02:22Z), posted before the first artifact. The SUT owner separately welcomed the run ("I'd welcome the results, whatever the outcome"). The sealed record shows the original R2 and the split, so nothing is re-interpreted after the fact.
- No registered row was added, removed or re-interpreted at any point.
- Harness iterations, disclosed in full: (1) an infrastructure smoke trial (SMOKE-1, distinct key `smoke-key`, not a registered row) validated cross-process spawning, file barriers, WAL serialization; (2) the first full battery iteration exposed three harness defects — the trial `dbFile` was not passed to workers (setup DB landed in cwd), the fixture's delegation rows were not chain-linked (`parent_delegation_id` NULL, so the budget decremented only the low hop), and the R4 role-A worker fell through into the retry branch after its own publication. All three are battery-harness bugs, not SUT behavior divergences; none of the registered expectations was altered to accommodate them. The sealed verdicts are from the corrected runner; the observed SUT behavior was identical across iterations (exactly one reservation, replay/mismatch/busy branches, identical-block republish) — the failing checks were against harness-side expected fixture state (top-hop budget) and a missing worker artifact, both self-inflicted.
- Determinism: sequenced trials (mode A/B/R4) fix the interleave via file barriers; `sim` trials release both processes from a common barrier and record the observed winner (assertions order-agnostic). What is attested is the registered closed behavior set, not wall-clock race probabilities.

## Result digest

12 trials (R1×3, R2a×2, R2b×3, R3×3, R4×1) + invariant row = **13/13 rows PASS, 106/106 checks PASS, 0 divergences**. Full per-check detail in `verdicts.jsonl`; per-trial observations in `layer1-log.jsonl`; sources in `sut-nano-cross-process-battery/`.
