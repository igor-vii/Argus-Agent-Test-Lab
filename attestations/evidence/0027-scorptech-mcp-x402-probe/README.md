# Evidence for record #0027 — ScorpTech x402 MCP transport passport

Sandbox run 2026-11-21 (~03:44–04:05 UTC). Sealed as `argus-finding-0027`,
signed by the probe-session key `argus-lab-probe-2026q4`. Zero settled paid
calls (burner unfunded); budget regulation ≤$0.01 kept at $0.00.

| Group | Files | Content |
|---|---|---|
| Session / catalog | `01_initialize.json`, `02_initialized_notification.json`, `03_tools_list_lite.json`, `04_tools_list_full_p1.json` (1020 tools, 1.14 MB — full price-declared catalog), `05_tools_list_full_stats.json`, `06_health.json`, `07_docs_all.json` (HTTP catalog snapshot) | stateless Streamable HTTP: no `Mcp-Session-Id`; server `scorptech-x402-lite 1.2.0`; every tool declares its price |
| Free search | `10_search_1_ping.json` … `10_search_4_solana_token.json` | live `search_tools` results (23/1/3/10 hits) |
| Candidates | `11_chosen_tool_schemas.json` | ping / url_parse / cusip_validate ($0.001, three groups) |
| Challenges | `12_payment_required_1_ping.json`, `…_2_url_parse.json`, `…_3_cusip_validate.json` | x402 v2 PaymentRequired delivered **as MCP isError result (HTTP 200)**; accepts: exact/Base USDC v2 ($0.001, EIP-712 domain "USD Coin" v2) + exact/Solana (feePayer = facilitator); bazaar discovery extension |
| Negatives | `13_negative_invalid_args.json`, `14_negative_invalid_cusip.json`, `15_negative_unknown_tool.json` | invalid arguments → the same payment challenge (**payment gate precedes argument validation**); unknown tool → RPC -32602 free |
| Paid path | `20_signed_submit_unfunded.json` | signed EIP-3009 `TransferWithAuthorization` (value 1000, burner 0x60f759…436A, signature truncated in the logged request) submitted via `params._meta["x402/payment"]` → facilitator verify: `invalid_exact_evm_insufficient_balance` in 1.042 s — signature VALID, balance-gated, fresh challenge re-issued; no settle, no charge |
| Balance | `21_balance_after.json` | burner native 0 / USDC 0 before and after the whole run (mainnet.base.org + base.publicnode.com) |

Checks:

```bash
node tools/registry/verify-registry.mjs     # whole registry, includes #0027
sha256sum -c manifest.sha256                # byte-exact artifacts
```
