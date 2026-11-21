# sut-scorptech-x402-mcp-probe — ScorpTech x402 MCP transport kit

Probe kit from the 2026-11-21 sandbox run (mini-TZ №6). Results are sealed as
registry record **#0027 (`argus-finding-0027`)** with evidence in
`attestations/evidence/0027-scorptech-mcp-x402-probe/`; the narrative report
lives at
[docs/probe-run-2026-11-21/scorptech-mcp-x402-passport-2026-11-21.md](../docs/probe-run-2026-11-21/scorptech-mcp-x402-passport-2026-11-21.md).

## What it contains

| File | Purpose |
|---|---|
| `scorptech_mcp_probe.py` | stage 1: MCP initialize → tools/list on the lite endpoint and the full endpoint (1020 tools), health + docs-all snapshots. Frames → `out/`. |
| `scorptech_mcp_stage2.py` | stage 2: free `search_tools` queries, PaymentRequired challenge capture on three $0.001 tools (ping / url_parse / cusip_validate), money-free negatives (invalid args, invalid CUSIP, unknown tool). |
| `scorptech_mcp_stage3_submit.py` | stage 3: signs the x402 v2 exact EIP-3009 `TransferWithAuthorization` from the challenge (EIP-712 domain from `accepts[].extra`: "USD Coin" v2, chainId 8453) and submits via `params._meta["x402/payment"]`; re-checks the burner balance after. |

## Re-run

```bash
python3 scorptech_mcp_probe.py                    # catalog dump -> out/04_tools_list_full_p1.json
python3 scorptech_mcp_stage2.py                   # searches + challenges + negatives (needs stage-1 dump)
ARGUS_BURNER_WALLET=/path/wallet.json python3 scorptech_mcp_stage3_submit.py
```

`ARGUS_BURNER_WALLET` is a JSON file `{"address", "private_key", "note"}` —
the burner EOA used to sign. NEVER commit it (`out/` is git-ignored, and the
key is read from an env-supplied path outside the repo).

With an UNFUNDED wallet stage 3 is the transport negative: the facilitator
returns `invalid_exact_evm_insufficient_balance` and re-issues a fresh
challenge. Fund the burner with ≥$0.001 of native USDC on Base to observe the
settle receipt (`PAYMENT-RESPONSE`) and the "no charge if tool fails" refund
semantics — the remaining open points of record #0027.

## Notes

- The challenge arrives as an MCP `isError` result (HTTP 200), not an HTTP 402
  — read it from `result.content[0].text`, not from the status code.
- The payment gate precedes argument validation: invalid arguments return the
  payment challenge, not a validation error.
- Base RPC endpoints filter the default python-urllib User-Agent (HTTP 403);
  the scripts send a curl-like UA.
