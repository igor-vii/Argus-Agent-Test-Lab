# Argus GitHub Action

Reference consumer of the Argus CI API (`docs/ci/api-contract-v0.md`) and the
result contract (`docs/ci/result-contract-v0.md`). Runs the battery against
the pushed commit and records the verdict as a check run.

> Marketplace copy: this Action is also published as
> [`igor-vii/argus-action@v1`](https://github.com/igor-vii/argus-action) —
> same code, dedicated repo, better discoverability. Both `uses:` paths work;
> this directory stays the source of truth.

## Usage

```yaml
name: argus-battery
on: [push, pull_request]
jobs:
  argus:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: igor-vii/Argus-Agent-Test-Lab/action@v1
        with:
          api-key: ${{ secrets.ARGUS_API_KEY }}
```

Issue the key in Console → Settings → API keys and store it as the
`ARGUS_API_KEY` repository secret. One key per account, one shared balance.

## What you get

| outcome | check conclusion | step exit |
| --- | --- | --- |
| PASS | `success` (green) | 0 |
| UNKNOWN / HOLD | `neutral` (yellow) + annotations | 0 |
| FAIL | `failure` (red) + per-scenario annotations | 1 |
| insufficient balance | `action_required` + top-up link | 1 |
| bad api-key / rig failure / invalid result | `action_required` | 1 |

The full `argus.result.v0` object lands in the workspace as
`argus-result.json`. Simulation runs carry the not-citable-as-evidence note.

## Idempotency (restarts are free)

The Action sends `idempotency_key = sha256("argus.idem.v1:" + commit_sha +
":" + battery_id)` — the same derivation as the CI seed. If the workflow
re-runs the same commit (timeout, network, manual retry), the API replays
the original result (`409`) **without a second debit**: one commit + one
battery is one paid run, economically and probabilistically.
