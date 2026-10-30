# CORRECTION-0000-01 — Finding #0000 summary wording: signed authorization established, on-chain settlement not claimed

- **Date:** 2026-10-30
- **Amends:** record `argus-finding-0000` (seq 0000, 2026-10-23) — sealed, immutable
- **Trigger:** external audit of the lab's public materials (2026-10-30) flagged a contradiction between the finding summary and the lab's own pinned capture notes.

## What the sealed record says

> "A server that inflated the requirement 10x was paid the inflated amount in 3/3 reproduced sessions on Base Sepolia (client authorized 100,000 units = 0.1 USDC for a resource priced at 10,000 units = 0.01 USDC)."

## What the evidence establishes

The capture notes pinned in `docs/block-b/BLOCK_B_TEST_MATRIX.md` (v2 wording) state:

> the captures establish that the client SIGNED AND HANDED OVER an authorization for the higher amount; the mocked settlement does NOT establish an on-chain overpayment (unfunded one-shot key; with a compliant facilitator the authorization would settle as-is).

"Was paid the inflated amount" claims a settlement outcome the harness cannot establish: settlement in the harness is mocked, and the client wallet is an unfunded one-shot test key, so no transfer could occur on-chain. The defect claim itself is unaffected — the reference client signed an attacker-sized amount with no binding to any caller expectation, and that is what makes the overcharge vector real. What this correction withdraws is only the settlement claim.

## Correction

Summary wording, from → to:

- **FROM:** "was paid the inflated amount in 3/3 reproduced sessions"
- **TO:** "in 3/3 reproduced sessions the reference client signed and handed over an authorization for the inflated amount (100,000 units = 0.1 USDC vs a resource priced at 10,000 units = 0.01 USDC); on-chain settlement of an overpayment was not established — settlement in the harness is mocked and the client wallet is an unfunded one-shot test key"

Status note refresh, from → to:

- **FROM:** "no maintainer response as of 2026-10-24"
- **TO:** "no maintainer response as of 2026-10-30"

The finding remains **open**; severity remains **high**; the reproducibility claim (3/3 sessions) is unchanged. The sealed record #0000 JSON is untouched per the immutability rule; this correction is the record of record.

## Surfaces

- **Landing page and llms.txt:** already use the accurate verb ("signs any server-declared 402 amount") — no change needed.
- **One-pager:** v4 refresh to carry the corrected sentence.
- **Downstream quotes of the "paid" phrasing** (posts, comments): superseded by this correction.
