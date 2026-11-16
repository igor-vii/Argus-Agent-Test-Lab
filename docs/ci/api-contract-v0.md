# Argus CI API contract — v0

The API between the GitHub Action (consumer, public) and the Argus console
backend (producer, private). Companion to `result-contract-v0.md`: this
document defines **who is allowed to run a battery and who pays**; the result
contract defines **what the run returns**. The backend is the sole owner of
accounts, keys and balances; the Action is a thin client.

Status: **contract, backend implementation pending** (the backend is the
private product repo; this document is the interface it must satisfy).

## Decisions (fixed for v0)

- **Unit of balance**: 1 credit = 1 battery run = 1 full battery (e.g. the
  14-scenario x402 core). Credits are integers; everything in the funnel
  ("welcome runs", beta packs, Starter credits) is already denominated in
  the same unit — no conversion layer.
- **Key scope**: one api-key per account (GitHub org), one shared balance.
  Per-repo or per-team keys are post-v0; the key format below leaves room
  for them without a breaking change.
- **Overdraft**: an advisory credit of **3 runs**. A run is allowed while
  the pre-debit balance is ≥ `-2` (so the balance can dip to `-3`); below
  the floor the API returns `402 insufficient_balance`. The rationale: a
  zeroed balance must not hard-break a live pipeline mid-day; the debt is
  reported in every affected check run annotation and in console history.
- **Payment rails stay as-is**: crypto top-up to the lab wallet credits
  runs exactly as today. This contract adds only **unit debiting on
  automated runs** and the sufficiency check — a thin layer over the
  existing ledger.

## Authentication

`Authorization: Bearer <api-key>` on every call. The key maps 1:1 to an
account and is resolved server-side to `account_id` + current balance;
the key itself never carries identity. Keys are issued and rotated in the
console (Settings → API keys); users store them as GitHub Actions secrets
(`ARGUS_API_KEY`). A leaked key is revoked, not re-scoped.

## `POST /api/v1/runs`

```json
{ "commit_sha": "40-hex", "battery_id": "x402-core", "idempotency_key": "64-hex" }
```

- `idempotency_key` = `sha256("argus.idem.v1:" + commit_sha + ":" +
  battery_id)` — mirrors the CI seed formula by design: one commit + one
  battery is the same run, economically and probabilistically. If the
  client omits it, the server derives the same value; an explicit key wins
  (needed for custom batteries on the same commit).
- Responses:
  - `201` — body is the full `argus.result.v0` object. The backend MUST
    run the producer-side validator (`tools/registry/result-view.mjs`,
    exit 0/1/2 only) before returning; a contract-invalid result is a
    backend bug, not a client problem. Header `X-Argus-Balance: <int>`
    carries the post-run balance.
  - `409` — idempotent replay: the same `idempotency_key` already ran.
    Body is the **original** result, header `X-Argus-Replayed: 1`. **No
    re-debit.** This is what makes Action restarts (timeout, network)
    free of charge.
  - `402` — `{ "error": "insufficient_balance", "balance": <int>,
    "topup_url": "https://console.argus-lab.tech/billing" }`. A refused
    attempt persists nothing (no anchor row, no ledger noise); the user
    pays, runs are credited, the next run works. The check run records
    `action_required` with the top-up link in the annotation.
  - `401` — unknown or revoked key. Conclusion `action_required`
    ("issue an api-key in Console → Settings → API keys").
  - `5xx` / network failure — rig failure. Conclusion `action_required`.
    Charge once, free retry: the debit stays (the engine flight was
    bought), the run is recorded `INFRA_FAILED`, and the same
    `idempotency_key` re-flies at zero cost — see Retry semantics below.

## Debit semantics (atomicity)

Debit happens **before** the run; the anchor run row and the debit commit
in a **single server-side transaction**, serialized per account by a
Postgres advisory lock (key → account → lock → anchor row → decrement →
ledger entry). There is **no refund**: charge once, free retry — a rig
failure (engine crash, 5xx, timeout before a result exists) keeps the
debit and releases the prepaid key for a free retry. A `FAIL` verdict is
NOT a rig failure — the battery ran, the agent lost, the verdict is the
product: the debit stays. Balance may go to the overdraft floor `-3` per
the decision above, and the floor is enforced race-free (the balance
check and the decrement share one transaction per account — two
concurrent requests at the floor cannot both pass and both decrement).
Idempotent replays never touch the ledger.

### Retry semantics (INFRA_FAILED)

When the rig fails (`INFRA_FAILED`), the run is not consumed:

- The original charge remains (balance already decremented).
- The `idempotency_key` stays bound to the run and is retryable.
- A retry with the same key does NOT decrement balance again.
- Net effect: 1 credit per logical run, regardless of infra retries.

This prevents double-charging for transient infrastructure failures.

The engine-side duplicate-run integration test (result contract, projection
assert) re-runs with the same seed **without a second debit**: the test
calls the API with the same `idempotency_key` and asserts `409`.

## `GET /api/v1/balance`

```json
{ "balance": 12, "runs_used_this_month": 38, "overdraft_floor": -3 }
```

Console surfaces (balance widget, debit history) read this endpoint; the
ledger itself stays private.

## Consumer obligations (GitHub Action)

- Send `Authorization: Bearer $ARGUS_API_KEY` (from `secrets.ARGUS_API_KEY`).
- Map outcomes to check conclusions exactly as `result-contract-v0.md`
  prescribes: PASS → `success`, UNKNOWN → `neutral`, FAIL → `failure`,
  and additionally here: `402`/`401`/`5xx`/invalid result →
  `action_required` with a human-readable annotation. The workflow step
  exits non-zero for everything except PASS/UNKNOWN.
- Reference implementation: `action/` in this repository —
  `uses: igor-vii/Argus-Agent-Test-Lab/action@v1`.

## Producer obligations (backend, private repo)

Implement the two endpoints above; run `result-view.mjs` as the producer
gate; keep the ledger transactional (debit-before-run, atomic with the
anchor row and serialized per account + charge-once-free-retry on rig
failure + idempotent replay); expose key issuance/rotation, balance and
debit history in the console. Billing model itself does not change:
"paid → credited" remains crypto-to-wallet.

## Implementation notes (v0 as built, 2026-11-16)

Implemented engine-side (`Argus-Agent-Test-Lab-product`, the `battery`
command emitting `argus.result.v0`) and backend-side
(`argus-console`, `/api/v1/*`). Decisions fixed during implementation:

- **Battery ids**: `x402-core` (9 engine scenarios — S1–S3, S5–S8, S10–S11;
  wallet-requiring S9 and the silent S4 stay lab-side, mirroring the
  console's ENGINE policy), `client-standard` / `client-engine` (the
  console ENGINE mirror: canonical S8 + S10/S11). Unknown ids → 400.
- **Agent**: the CI battery is a seeded simulation against the mock target
  and never touches a real endpoint, so the request body carries no agent.
  Each account owns one synthetic verified SUT (`ci-simulation`,
  `mock://ci`) that anchors the run row; runs surface in the console Runs
  tab under that name.
- **Idempotency scope**: per-account (`unique (userId, idempotencyKey)`).
  The same commit+battery from a DIFFERENT account is a different paid
  run. Replay semantics: prior `COMPLETED` → `409` + stored result, no
  re-debit; prior `INFRA_FAILED` → reset in place and re-run **without a
  second debit** (the key is prepaid — retry semantics above); prior
  in-flight → `409 run_in_progress`, except a run stuck in-flight over
  10 minutes (crashed invocation, lost engine flight) which counts as
  `INFRA_FAILED` and retries free.
- **Execution model v0**: synchronous in-process engine — the console
  host needs `ARGUS_ENGINE_DIR`; worker-mode deployments answer `503`
  (async run polling is post-v0). The rig budget is 300 s; exceeding it
  is a rig failure (`503`, debit stays, retry free).
- **Overdraft rule, precise**: a run is allowed while the PRE-debit
  balance is ≥ −2; below that → `402`. Bucket debits journal as
  `refType "RUN"` (identical to console runs), overdraft debits as
  `refType "CI"` — balance = active bucket quota + CI ledger delta.
- **Producer gate**: the backend validates every result before `201` with
  the result-view rules ported server-side (`resultContract.ts`); the
  engine additionally runs the vendored canonical validator in its own
  integration tests. The evidence file-hash byte-check is skipped for CI
  because evidence sidecars are ephemeral runner artifacts.
- **`topup_url`**: the console Billing anchor (`/#billing`). The check
  conclusion for `402`/`401`/`5xx`/invalid is `action_required` — the
  agent was not measured, so it must not read as a red agent failure.
- **Determinism, verified end-to-end**: the same commit+battery reproduced
  the same seed and the same verdict set across server restarts with
  fresh databases; the engine's duplicate-run integration test asserts
  the projection equality through the canonical validator.
