# raen-ledger-before — byte-exact capture for the evidence lens

## What this is

Byte-exact capture of the RAEN settlement ledger **before** the announced
deterministic request-id change (announced by @bshelby88 in
x402-foundation/x402#4198 on 2026-11-22). This pack pins the "before" state so
that the after-fix dataset can be classified against a frozen reference.

- Source URL: `https://settlement-collector.fly.dev/ledger.json`
- Captured at: 2026-11-22T18:12:40Z (UTC)
- sha256 (raw bytes): `9c001fd731468d6cd6dcda7cf879b2ffdc908acfb23643a5c38e3517555f60d5`
- Rows (`transactions`): 64
- Ledger's own `last_updated`: 2026-11-21T14:46:07.551Z
- Ledger self-summary: total_settled_usdc=10.751, external=0,
  internal=10.751, settled_tx_count=64,
  classification values present: internal only

## How to recompute

1. `sha256sum runs/ledger-capture-20261122T181240Z.json` — must equal the hash above (also in `manifest.sha256`).
2. Adjacent-pair measurement (the grouping published in #4198): group rows by
   `(payer, service, route, amount_usd)`, sort by `ts` inside each group, take
   adjacent deltas in milliseconds. Deltas <= 4250 ms yield exactly six pairs
   (the largest, 4204 ms, is the `4.20 s` pair of the thread's second-decimal
   recompute):

| delta_ms | service | route | amount_usd | row a | row b |
|---|---|---|---|---|---|
| 980 | royal-ruby | /api/law-lookup | 0.05 | transactions[55] | transactions[54] |
| 2010 | royal-ruby | /api/law-lookup | 0.05 | transactions[18] | transactions[17] |
| 3235 | contract-eye | /api/analyze-contract | 1 | transactions[53] | transactions[52] |
| 3586 | royal-ruby | /api/law-lookup | 0.05 | transactions[16] | transactions[15] |
| 3828 | royal-ruby | /api/law-lookup | 0.05 | transactions[6] | transactions[5] |
| 4204 | royal-ruby | /api/law-lookup | 0.05 | transactions[14] | transactions[13] |

Raw milliseconds are recorded, no rounding. Independent public recompute of the
same capture window (64 settled transactions, six adjacent pairs 0.98s–4.20s):
zambodotdev in x402-foundation/x402#4198, 2026-11-22 (their 3.24s figure is the
same pair as 3235 ms here — second-decimal rounding only).

## What this pack deliberately does NOT contain

No classification verdicts. Per the frozen pre-registration
(`tools/registry/drafts/0028-x402-evidence-lens.seal.draft.json`), evidence
carries the inputs for recomputation only; the checker derives the verdict from
the records at run time. The rows carry no purchase-identity fields — that
schema fact is the property the lens classifies, and it is visible in the raw
rows themselves.

## Immutability

After this pack is pinned by a registry record, files here are never edited; a
mistake means a new artifact plus a correction/note (RUNBOOK 3.4).
