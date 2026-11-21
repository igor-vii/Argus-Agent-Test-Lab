# Evidence for record #0025 — QDay Aevum testnet x402 compatibility probe

Sandbox run 2026-11-20 (~17:41–17:59 UTC). Sealed as `argus-finding-0025`,
signed by the probe-session key `argus-lab-probe-2026q4` (the operator's
registry key is not present in the sandbox by design; this key id is resolvable
from `attestations/keys/`).

| File | Content |
|---|---|
| `probe_result.json` | RPC probes (chainId `0xabe5` = 44005, `cdk-erigon/2.0-qday-v2.61.19-validium`, block height, gasPrice 1 gwei), tUSD8 on-chain reads (name/symbol `tUSD8`, 6 decimals, balance 0), facilitator `GET /supported` (x402Version 2, exact + qday:erc4337 with EntryPoint/paymaster/kernel-v3.1), faucet tUSD8 status probe (401 — Turnstile-gated). Burner wallet address included; the private key is not. |
| `x402_handshake_evidence.json` | Step-by-step x402-v2 exact/EIP-3009 handshake on tUSD8 semantics with per-step timings: 402 challenge, client sign (6.6 ms), server verification with all five checks true (5.7 ms), 200 + PAYMENT-RESPONSE; negative probes rejected (100x overcharge `value_matches_price=false`, wrong recipient `to_is_payTo=false`); QDay facilitator `POST /verify`: attempt 1 (flat v1-style payload) → 400 `invalid_format`, attempt 2 (spec body) → 200 `{"isValid":false,"invalidReason":"merchant_not_alive"}`. |

Checks:

```bash
node tools/registry/verify-registry.mjs     # whole registry, includes #0025
sha256sum -c manifest.sha256                # byte-exact artifacts
```
