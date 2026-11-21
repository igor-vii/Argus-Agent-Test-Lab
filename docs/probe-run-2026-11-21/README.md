# Probe run 2026-11-21 — scorptech-x402-mcp transport passport

Narrative report for the live-infrastructure probe of 2026-11-21, sealed as
registry finding **#0027** (signed by the probe-session key
`argus-lab-probe-2026q4`):

- [scorptech-mcp-x402-passport-2026-11-21.md](scorptech-mcp-x402-passport-2026-11-21.md) —
  x402 v2 over MCP transport: challenge delivered as MCP `isError` result
  (HTTP 200), payment in `params._meta["x402/payment"]`, accepts exact/Base
  USDC v2 ($0.001) + exact/Solana (feePayer = facilitator); payment gate
  precedes argument validation; signed unfunded submit → facilitator verify
  `invalid_exact_evm_insufficient_balance` (signature VALID, no settle, no
  charge); "no charge if tool fails" confirmed for the pre-payment side,
  refund semantics unverified (needs a funded wallet).

Verify:

```bash
node tools/registry/verify-registry.mjs          # registry intact: 28 records
sha256sum -c attestations/evidence/0027-scorptech-mcp-x402-probe/manifest.sha256
```

Reproducibility kit: `sut-scorptech-x402-mcp-probe/` (MCP connect + catalog +
challenges + negatives + signed submit via `ARGUS_BURNER_WALLET`).
