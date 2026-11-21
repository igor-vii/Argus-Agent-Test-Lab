# sut-apiguru-x402-probe — apiguru amazon-scraper-v2 x402 passport kit

Probe kit from the 2026-11-20 sandbox run (mini-TZ №4). Results are sealed as
registry record **#0026 (`argus-finding-0026`)** with evidence in
`attestations/evidence/0026-apiguru-x402-probe/`; the narrative report lives at
[docs/probe-run-2026-11-20/apiguru-x402-passport-2026-11-20.md](../docs/probe-run-2026-11-20/apiguru-x402-passport-2026-11-20.md).
(Originally signed as #0024 while pending locally; upstream took seq 0023/0024
mid-run, so the finding was re-signed as #0026 against the new chain head.)

## What it contains

`apiguru_paid_call.py` — a ready-to-run **single paid** x402 client for
`agent.apiguru.app/agent/v1/v2/product-details`:

1. `GET` → on `402` parses the base64 `PAYMENT-REQUIRED` header, takes the
   `exact` accept, and hard-stops if `amount` exceeds the `--max-usdc` spend
   limit (default $0.05, the vendor-documented per-call ceiling).
2. Signs the EIP-3009 authorization with an EIP-712 domain taken from the
   requirements' `extra` (USDC, chainId from the CAIP-2 network id).
3. Retries with `PAYMENT-SIGNATURE`, decodes `PAYMENT-RESPONSE` (tx hash,
   settle), writes full evidence JSON (headers, timings, challenge — the
   signature itself is not logged).
4. A lock file (`out/paid_call.lock`) makes a second paid call require
   `--force`, enforcing the "exactly one paid call per run" discipline.

```bash
APIGURU_PRIVKEY=0x… python3 apiguru_paid_call.py --asin B09DJLW458
```

The funded key must hold native USDC on Base; no gas is needed (the vendor's
facilitator submits the transfer). As of record #0026 the paid call has NOT
been executed — the sandbox had no funded wallet; the record seals the free
tier semantics observed live (sample 200 without consuming a probe; own-ASIN
404 consuming one probe, 3→2) plus the documented payment path.

`out/` is git-ignored.
