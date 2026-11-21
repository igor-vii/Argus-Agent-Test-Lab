# sut-qday-aevum-probe — QDay Aevum testnet x402 compatibility kit

Probe kit from the 2026-11-20 sandbox run (mini-TZ №3). Results are sealed as
registry record **#0025 (`argus-finding-0025`)** with evidence in
`attestations/evidence/0025-qday-x402-probe/`; the narrative report lives at
[docs/probe-run-2026-11-20/qday-x402-probe-2026-11-20.md](../docs/probe-run-2026-11-20/qday-x402-probe-2026-11-20.md).
(Originally signed as #0023 while pending locally; upstream took seq 0023/0024
mid-run, so the finding was re-signed as #0025 against the new chain head.)

## What it contains

| File | Purpose |
|---|---|
| `qday_probe.py` | read-only testnet probe: RPC (chainId/clientVersion/blockNumber/gasPrice), tUSD8 ERC-20 reads, facilitator `GET /supported`, faucet tUSD8 status (no claim). Also generates a burner wallet into `out/wallet.json` (mode 0600, git-ignored). |
| `x402_qday_handshake.py` | bare x402-v2 `exact`/EIP-3009 client+server on tUSD8 semantics (EIP-712 domain `tUSD8` v2, chainId 44005): 402 challenge → sign → server-side verification (signer recovery, to==payTo, value==price, window, nonce) → 200 `PAYMENT-RESPONSE`; negative probes (100x overcharge, wrong recipient); one `POST /verify` to the QDay facilitator (`/settle` is never called). |

## Re-run

```bash
python3 -m venv .venv && .venv/bin/pip install eth-account
.venv/bin/python qday_probe.py            # read-only probe + burner wallet -> out/
.venv/bin/python x402_qday_handshake.py   # local handshake + facilitator /verify probe
```

`out/` holds the burner wallet and evidence JSONs and is git-ignored — never
commit it. The probes move no funds: the burner stays unfunded (the faucet is
gated by Cloudflare Turnstile / e-mail code / Discord), and on-chain settle is
therefore not part of the kit; wire-format compatibility up to the funding step
is what record #0025 seals.

## Notes

- RPC has a User-Agent filter: the default `python-urllib` UA gets HTTP 403;
  the probe sends a curl-like UA.
- The facilitator accepts the x402-v2 spec body `{x402Version, paymentPayload,
  paymentRequirements}` (a flat v1-style payload gets `400 invalid_format`).
