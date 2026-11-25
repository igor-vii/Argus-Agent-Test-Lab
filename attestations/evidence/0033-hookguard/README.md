# 0033 — AFG onBeforePaymentCreation hook-guard re-run (receipt v2)

Pre-registered hostile battery S1–S7 + vendor-issued rows S8/S9, re-run against the
current AFG gate (openapi 0.22.7 issued / 0.22.8 observed, receipt schema afg-gate-receipt/2).
Client SDK unchanged: agentic-finance-graph@0.3.7. Agent 45978; references argus-0033-*;
fresh synthetic payees P1–P6 (sut-hookguard/payees-0033.json); budget $0.00; no retries.

- Issued conditions frozen verbatim: AFG comment 7144596133 (2026-11-24T21:11:21Z),
  body sha256 `840ffa33488216a5bfa9cc8e803c4a0c9eca56220ee7aa4633061082246c966c`.
- Operator prereg post: comment 7153392127 (2026-11-25T05:02:21Z),
  body sha256 `bb7c786d6fcc0ae6cf277c8497c63486c803673bc7040f8d179d8514baab4662` — 4m28s before the first live-GET (2026-11-25T05:06:49Z).

## Result
9/9 MATCH (S1–S9), L1 evidence-only. The 0031 S6 divergence did not repeat:
the vendor-issued outcome (1 allow + 7 blocks, each pending {decisions:1, usd:200})
was observed. 503 "not observed" (32 calls, all HTTP 200). 32/32 receipts
afg-gate-receipt/2, policy {name, sha256}, 16-char hash absent from receipts;
recompute canon(policy.body) == e78dea71c0ff1344d078441ef73251a5a1d5245925164e350f68d46cc89ba046 byte-exact.

## Verify
```
node tools/registry/verify-registry.mjs          # after the record is signed
curl -s https://api.github.com/repos/x402-foundation/x402/issues/comments/7144596133 | jq -j .body | sha256sum
curl -s https://api.github.com/repos/x402-foundation/x402/issues/comments/7153392127 | jq -j .body | sha256sum
```
