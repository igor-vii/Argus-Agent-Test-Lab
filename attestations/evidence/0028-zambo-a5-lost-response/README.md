# zambo-a5-lost-response — byte-exact capture for the evidence lens (dataset 2)

## What this is

Byte-exact capture of the production record posted by @zambodotdev in
x402-foundation/x402#4198 on 2026-11-22T17:10:11Z as the production instance of
matrix case C4 (same purchase, retry after fulfillment-latency timeout):
"We have that fourth case in production. In the A5 delayed leg of the
lost-response runs, the retries landed after the due time and replayed the
original receipt; the effect count was one before them and one after, no second
execution. The record is still recomputable here: https://zambo.dev/run/2e9ebf1f-5743-48de-a34b-5b3584c4c102".

- Page URL (linked in-thread): https://zambo.dev/run/2e9ebf1f-5743-48de-a34b-5b3584c4c102
- Verification API URL (captured): https://zambo.dev/api/v2/receipt/2e9ebf1f-5743-48de-a34b-5b3584c4c102/verify
- Captured at: 2026-11-22T18:38:04Z (UTC)
- Receipt id: `2e9ebf1f-5743-48de-a34b-5b3584c4c102` · created 2026-11-17T20:57:35.924Z · profile
  `zambo-hosted-receipt/1` · verification_status `verified`

## Artifacts

| file | what it is | sha256 |
|---|---|---|
| `runs/a5-receipt-verify-2e9ebf1f.json` | machine-readable record (verification API response, byte-exact) | `e99785076197788e90b7cc720a8cef7db7e8a07cee8631923f6d806fa6ee50c3` |
| `runs/a5-run-page-2e9ebf1f.html` | the public run page as linked in the thread (byte-exact) | `3ddf7c132d068594875aca1e1451029bc900d40bdb4b5aab74785d3ff313abee` |

## What the record carries (visible in the hash-covered canonical bytes)

- Commitment: `output_hash = sha256:b57197d5333af492c73260784de351c587545b6837ddab98500386714d931b87`
  over 1269 canonical bytes; **recomputed at capture time: match**.
- One journal entry, hash-bound inside the canonical bytes:
  tool `lost_response_probe`, executor_identity `lost-response-harness`,
  `sequence: 1`, `prev_hash: null`, `entry_hash: sha256:d07ffbe2db7aba619f7df5b2e37caba5ded489c70872b0bfa3f3a73a1c01fa13`,
  `redacted_inputs_hash: sha256:009dc69401a98a8cadc92ecf32baacc0bb7a1d9aa505445f7632f20b86483c4f`.
- Side effects: declared `[state_write]` with `declaration_hash: sha256:dfb4412a…bc9`.
- Provenance class `LOGGED BY AGENT`; the receipt's own attestation scope:
  "Zambo attests that this record was received, redacted, timestamped, and
  chained." / "Zambo did not run or observe the reported action."
- The receipt's own checks: commitment, canonical reconstruction, provenance and
  metadata binding pass; issuer authentication and signature: `not_checked`
  (stated by the record itself).

## What the record does NOT carry (visible in the canonical bytes)

No payment attempt tuple. The canonical payload contains no payer, no
idempotency key, no intent digest and no purchase reference; inputs are
redacted (only `redacted_inputs_hash`). The record set holds a single
submission record (`sequence: 1`, no pair). The attempt rows of the A5 leg —
the original submission and the delayed retries with their replayed receipts —
are not part of the posted record; they live in the harness's own store.

## Registered expectation (draft `0028-x402-evidence-lens.seal.draft.json`, datasets[1])

Under the frozen records-only rule the registered expectation for this dataset
is `absent` on the C4 classification: no hash-bound purchase identity ties
submissions, and no pair of submissions exists in the record set. The
classification itself is derived at run time by
`sut-x402-evidence-lens/classify.mjs` and is not precomputed here (RUNBOOK 6.5).
If fuller leg records are posted later, they enter as a new pinned dataset per
the frozen extension rule.

## How to recompute

1. `sha256sum runs/a5-receipt-verify-2e9ebf1f.json runs/a5-run-page-2e9ebf1f.html` — must match the table above (also in `manifest.sha256`).
2. Decode `receipt.canonical_bytes` (base64) from the verify JSON and
   `sha256` the decoded bytes — must equal `output_hash` (capture-time check
   above recomputes this).

## Immutability

After this pack is pinned by a registry record, files here are never edited; a
mistake means a new artifact plus a correction/note (RUNBOOK 3.4).
