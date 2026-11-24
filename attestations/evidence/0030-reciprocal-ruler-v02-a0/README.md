# Evidence pack — 0030 reciprocal-ruler v0.2 A0 battery (freeze-0030)

Pre-registered $0.00 trial battery against `https://reciprocal-ruler-x402.vercel.app`
(reciprocal-ruler v0.2, base-buzz/paystage#315), executed 2026-11-24T04:42:47–50Z,
3 seconds wall time, after the prereg hash was posted to #315 (comment
7122267628) and x402#4198 (comment 7122267897) and the freeze was committed
(`a00d8815`). Budget: $0.00 — no paid endpoint called, no payment signed.

## What ran

`python3 sut-reciprocal-ruler/ruler_a0_battery.py` (checker sha256
`8d65bf145a92b298dc38c30eee58c2d75e3803872e34f5689bb94cd2b16c6702`, committed
pre-run per RUNBOOK P1). 5 POST across two disclosed trial ids
(`argus-0030-a0c1`: A0.1 persist_receipt → A0.2 byte-identical replay →
A0.3 same key, changed actual; `argus-0030-a0c2`: A0.7a overpayment default
0.1.0 → A0.7b identical payload + rule_version 0.2.0) and 4 free GET reads
(A0.4 wrong receipt, A0.5 unknown key, A0.6 correct receipt, A0.8 /health).

## Result

- Nine of nine calls landed on the frozen expected column (statuses 200/200/409/403/404/200/200/200/200).
- Four-row offline recompute (checker): **4/4 MATCH, 0 divergences**.
  - A0.1 COMPENSATED, compensated 10000, uncovered 0, credit −5; `ledger.persisted true`, receipt issued (`2c5d4be8…` / `NvA7-C74i…`).
  - A0.2 `idempotent_replay true`, `ledger_hash` unchanged (`sha256:2c5d4be8…`).
  - A0.3 409 `INTENT_MISMATCH`, digests differ (`9195dd1f…` ≠ `a8a4d1fb…`); the 409 detail discloses the intent binding field set (tx_id, quote_hash, event_type, expected/actual/holdback).
  - A0.7a SETTLED_OK +5 (default 0.1.0) vs A0.7b OVERPAID 0/0/0 (0.2.0) — identical payload except `rule_version`.
- Receipt-capability reads: 403 RECEIPT_REQUIRED / 404 LEDGER_NOT_FOUND / 200 with `receipt_verified: true`, `recomputation.match: true`, `ledger_hash_match: true` (server-side recompute of the stored judgment matches the offline table).
- R2 resolved: stored `quote_hash` = `sha256:ecfadcb7…` = Q020 — the quote-hash includes rule_version 0.2.0 (primary hypothesis confirmed via A0.3 stored intent and A0.6 ledger read; fallback Q010 unused).
- A0.8: `storage.durable true`, `rule_versions` unchanged {frozen_below 0.2.0, latest 0.2.0}.

## Files

- `run.json` — prereg pins (freeze commit, prereg hash, posts), platform, host, window.
- `runs/A0.*.json` — raw per-call artifacts: request body, headers id, status, latency, full response.
- `runs/summary.json` — checker summary (divergences 0, 5 POST, ids).
- `manifest.sha256` — sha256 of every file in this pack (built last).

## How to verify offline

```bash
git clone https://github.com/igor-vii/Argus-Agent-Test-Lab && cd Argus-Agent-Test-Lab
cd attestations/evidence/0030-reciprocal-ruler-v02-a0 && sha256sum -c manifest.sha256
cd ../.. && node tools/registry/verify-registry.mjs            # main chain green
# recompute the four rows from the raw transcripts:
python3 - <<'PY'
import json
def r(n): return json.load(open(f'attestations/evidence/0030-reciprocal-ruler-v02-a0/runs/{n}-1.json'))['response']
print(r('A0.1')['status'], r('A0.2').get('idempotent_replay'), r('A0.7a')['status'], r('A0.7b')['status'])
PY
```
