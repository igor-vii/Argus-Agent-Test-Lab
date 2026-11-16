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
    "topup_url": "https://console.argus-lab.tech/billing" }`. The check
    run records `action_required` with the top-up link in the annotation;
    the user pays, runs are credited, the next run works.
  - `401` — unknown or revoked key. Conclusion `action_required`
    ("issue an api-key in Console → Settings → API keys").
  - `5xx` / network failure — rig failure. Conclusion `action_required`,
    **no debit**.

## Debit semantics (atomicity)

Debit happens **before** the run, inside a single server-side transaction
(key → account → balance row lock → decrement → ledger entry → run
record). An automatic refund reverses the debit when the **rig** fails
(engine crash, 5xx, timeout before a result exists). A `FAIL` verdict is
NOT a rig failure — the battery ran, the agent lost, the verdict is the
product: no refund. Balance may go to the overdraft floor `-3` per the
decision above. Idempotent replays never touch the ledger.

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
gate; keep the ledger transactional (debit-before-run + rig-failure
refund + idempotent replay); expose key issuance/rotation, balance and
debit history in the console. Billing model itself does not change:
"paid → credited" remains crypto-to-wallet.
