# Argus registry — INDEX (generated; do not edit)

Records are signed and hash-chained. Verify: `node tools/registry/verify-registry.mjs`.
Chain head: `e95a94ea4209254e...`

## Findings (1) — third-party issues we disclosed; statuses are live.

| Seq | ID | Subject | Title | Status | Issued |
|---|---|---|---|---|---|
| #0000 | `argus-finding-0000` | @x402/fetch 2.28.0 | x402 reference client signs any server-declared 402 amount (overcharge vector) | open — no maintainer response as of 2026-10-24 | 2026-10-23 |

## Seals (4) — attestations of runs; final at issuance, findings attached.

| Seq | ID | Subject | Title | Verdicts | Issued |
|---|---|---|---|---|---|
| #0001 | `argus-seal-0001` | agentmiddleware/amw-paypal-agent-demo@60887d8 | Block D live run — S10/S11 against amw-paypal-agent-demo | S10 PASS 26/26, S11 PASS 11/11 | 2026-10-23 |
| #0002 | `argus-seal-0002` | agentmiddleware/amw-paypal-agent-demo@60887d8e | Block D clean-machine reproduction — S10/S11 against amw-paypal-agent-demo | S10 PASS 26/26, S11 PASS 11/11 | 2026-10-24 |
| #0003 | `argus-seal-0003` | x402-foundation/x402 | S-BS-06 binding battery — #3866 reviewer round-2 controls (official @x402 client v2.28.0) | S-BS-06 PASS 11/11 sessions MATCH | 2026-10-24 |
| #0004 | `argus-seal-0004` | x402-foundation/x402 | S-BS-14/15 wave 2.5 — binding-race & non-atomic-amount first run (lab probes A10a/A10b/A11, x402 PR #3920 @ 2b4cc47) | S-BS-14 FAIL race A10a (explicit expectation) + A10b (first-accepted): BOTH EIP-3009 payloads signed at divergent payTo before any binding was recorded (signer x2) — candidate-fix boundary; control-1 sequential pair, fresh client: exactly 1 signer call, attempt 2 rejected pre-signer (QuoteMismatchError) — green; control-2 parallel identical pair: 2 signed payloads, no false positive — green; fixed-client positive control (binding before attempt 2) → PASS with controls green, S-BS-15 FAIL decimal "0.5" signed at enabled pin $0.01 (×50, under the default $1 cap; resolved payload.amount = 500000) — candidate-fix boundary; control-1 cap shield "2" ($2, over cap): rejected pre-signer, 0 calls — green; control-2 atomic duplicate "500000": QuoteMismatchError pre-signer, 0 calls — green; cap=false opt-in variant "100000.5" signed (exploit window is UNDER the cap) | 2026-10-26 |

A seal attests run validity and findings completeness — **not** bug-freeness.
