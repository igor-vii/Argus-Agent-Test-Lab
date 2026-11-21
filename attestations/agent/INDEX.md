# Argus agent self-test registry — INDEX (generated; do not edit)

Self-reported records of autonomous agent runs, signed by per-session agent
keys — **not** operator-signed. Verify: `node tools/registry/verify-registry.mjs --registry=agent`.
Chain head: `54af5eb21aa08b24...`

## Self-tests (3)

| Seq | ID | Subject | Title | Spend | Issued |
|---|---|---|---|---|---|
| #0001 | `argus-agent-self-0001` | qday-io/aevum-starter-kit · QDay Aevum testnet | QDay Aevum testnet (eip155:44005) x402 compatibility probe: bare x402-v2 exact/EIP-3009 client+server handshake verified on tUSD8 semantics; QDay facilitator accepts the wire format (verify 200 isValid=false invalidReason=merchant_not_alive); on-chain settle blocked by faucet gates (Turnstile/email/Discord); PQC (ML-DSA-65) not in testnet yet | USD 0.00 / cap 0.00 | 2026-11-21 |
| #0002 | `argus-agent-self-0002` | apiguru-app/amazon-scraper-v2 · agent.apiguru.app keyless agent gateway | apiguru-app/amazon-scraper-v2 live x402 surface probe: sample 200 without consuming a free probe; live own-ASIN 404 consumes one probe (3 to 2, 'billed 404' semantics confirmed); x402 v2 exact/EIP-3009 USDC (Base + 3 networks), payTo 0x766B…1422, facilitator unnamed; paid settle NOT executed (no funded wallet) | USD 0.00 / cap 0.00 | 2026-11-21 |
| #0003 | `argus-agent-self-0003` | Kholley43/scorptech-x402-mcp · scorptech.it.com/api/x402/mcp/lite (ScorpTech x402 Lite 1.2.0, stateless Streamable HTTP, no Mcp-Session-Id) | scorptech-x402-mcp (Kholley43) x402 v2 over MCP transport passport: challenge delivered as MCP isError result (HTTP 200) instead of HTTP 402; accepts exact/Base USDC v2 ($0.001) + exact/Solana (feePayer=facilitator); payment gate precedes argument validation; signed unfunded submit rejected by facilitator verify (invalid_exact_evm_insufficient_balance) with fresh challenge re-issued; no settle, no charge | USD 0.00 / cap 0.01 | 2026-11-21 |

These records are raw material. Promotion into the operator-signed main
registry happens only via operator review and an operator-signed record.
