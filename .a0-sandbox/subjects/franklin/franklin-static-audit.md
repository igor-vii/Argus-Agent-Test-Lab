# Franklin — Static Black-Box Readiness Audit (A1)

FRANKLIN_SHA: ef942bd1519b318fac21900e1619ef2a945caa92
Clone: /tmp/argus-sandbox/franklin (unmodified, read-only audit)
Method: source inspection only. No funds, no network calls to production hosts.

## Payment path (CLIENT/PAYER role)
- src/proxy/server.ts (~L883-920): on HTTP 402 the proxy signs via wallet
  (Solana or Base EVM depending on payment.chain) and retries with
  `PAYMENT-SIGNATURE` header. "Real x402 charge for the call that ultimately
  succeeded" is parsed from PAYMENT-RESPONSE and fed into recordUsage as
  paidUsd (source of truth for spend). Non-402 path => paidUsd = 0.
- src/trading/providers/blockrun/client.ts (L102-110): free-path client treats an
  unexpected 402 as a hard error ("Gateway unexpectedly requires payment..."),
  never auto-pays. Paid GET flow (L219+) lazily loads wallet on first 402; if the
  gateway 402s without a payment-required header it errors with "Fund your wallet".
- src/payments/auth-mode.ts: two disjoint hosts (key host api.blockrun.ai vs wallet
  host); walletMayPay() gates whether a 402 may trigger a signature at all.

## Retry / fallback economics (KEY FINDINGS)
- src/proxy/fallback.ts buildFallbackChain(): documented invariants:
  1. A FREE start model never falls back to a paid rung (prevents surprise wallet
     charge on provider overload). Regression was fixed by ending the walk instead.
  2. Vision guard: image requests must not fall back to text-only models. Comment
     states (probed 2026-08-31): **Base returns 402 (payment quote) for an image
     request to deepseek/deepseek-chat and zai/glm-5.x — so the retry is quoted,
     signed, SETTLED, and THEN rejected upstream — or answered without the image.**
     Solana correctly 400s pre-payment. This is an asymmetric pay-before-validate
     boundary between the two networks, acknowledged by BlockRun's own source.
- Every fallback rung that 402s triggers a NEW independent x402 payment
  (no idempotency key observed anywhere in franklin/src or clawrouter/src).

## Budget / spend controls
- recordUsage/paidUsd accounting per call; cost_log.jsonl evidence trail exists.
- No cross-request idempotency identity: retries are new economic actions.

## Dynamic run verdict
Franklin's x402 host URLs (api.blockrun.ai / blockrun.ai wallet host) are NOT
overridable by env (config.ts L102 KEY_API_URL hardcoded; only MARKET_URL is
env-settable). Pointing Franklin at the local mock would require patching the
upstream clone -> PROHIBITED by task constraints. Therefore:
**DYNAMIC RUN BLOCKED — recorded as HARNESS/ENVIRONMENT limitation.**
Evidence available for a future run: static paths above + its own probe comments.
