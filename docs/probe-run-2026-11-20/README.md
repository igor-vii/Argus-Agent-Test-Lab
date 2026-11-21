# Probe run 2026-11-20 — QDay Aevum + apiguru x402 passports

Narrative reports for the two live-infrastructure probes of 2026-11-20, sealed
as registry findings **#0025** and **#0026** (signed by the probe-session key
`argus-lab-probe-2026q4`):

| Report | Record | One-line verdict |
|---|---|---|
| [qday-x402-probe-2026-11-20.md](qday-x402-probe-2026-11-20.md) | #0025 | Our stack is wire-compatible with QDay Aevum testnet (eip155:44005, tUSD8 EIP-3009) up to the funding step: local x402-v2 handshake green, QDay facilitator accepts the spec verify body; on-chain settle blocked by faucet gates (Turnstile / e-mail / Discord); PQC (ML-DSA-65) not in the testnet yet. |
| [apiguru-x402-passport-2026-11-20.md](apiguru-x402-passport-2026-11-20.md) | #0026 | apiguru keyless x402 path behaves exactly as documented: sample 200 without consuming a probe, own-ASIN 404 consumes one probe (3→2, "billed 404"), price $0.003 vs README's "~$0.01"; paid settle not executed (no funded Base wallet in the sandbox) — a ready single-paid-call client ships in `sut-apiguru-x402-probe/`. |

Verify:

```bash
node tools/registry/verify-registry.mjs          # registry intact: 27 records
sha256sum -c attestations/evidence/0025-qday-x402-probe/manifest.sha256
sha256sum -c attestations/evidence/0026-apiguru-x402-probe/manifest.sha256
```

Reproducibility kits: `sut-qday-aevum-probe/` (read-only probe + bare x402-v2
client/server on tUSD8 semantics) and `sut-apiguru-x402-probe/` (single-paid-call
client with a hard spend limit).

Note: a third audit from the same day (zgraham1981/Stablecoin-Payment-Gateway,
source battery) is intentionally **not** published in this public repository
pending the operator's decision — its verdict is severe and its publication
requires an operator call, not an agent default.
