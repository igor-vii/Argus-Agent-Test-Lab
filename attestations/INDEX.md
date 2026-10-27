# Argus registry — INDEX (generated; do not edit)

Records are signed and hash-chained. Verify: `node tools/registry/verify-registry.mjs`.
Chain head: `4959f9aa7c49957c...`

## Findings (1) — third-party issues we disclosed; statuses are live.

| Seq | ID | Subject | Title | Status | Issued |
|---|---|---|---|---|---|
| #0000 | `argus-finding-0000` | @x402/fetch 2.28.0 | x402 reference client signs any server-declared 402 amount (overcharge vector) | open — no maintainer response as of 2026-10-24 | 2026-10-23 |

## Seals (5) — attestations of runs; final at issuance, findings attached.

| Seq | ID | Subject | Title | Verdicts | Issued |
|---|---|---|---|---|---|
| #0001 | `argus-seal-0001` | agentmiddleware/amw-paypal-agent-demo@60887d8 | Block D live run — S10/S11 against amw-paypal-agent-demo | S10 PASS 26/26, S11 PASS 11/11 | 2026-10-23 |
| #0002 | `argus-seal-0002` | agentmiddleware/amw-paypal-agent-demo@60887d8e | Block D clean-machine reproduction — S10/S11 against amw-paypal-agent-demo | S10 PASS 26/26, S11 PASS 11/11 | 2026-10-24 |
| #0003 | `argus-seal-0003` | x402-foundation/x402 | S-BS-06 binding battery — #3866 reviewer round-2 controls (official @x402 client v2.28.0) | S-BS-06 PASS 11/11 sessions MATCH | 2026-10-24 |
| #0004 | `argus-seal-0004` | x402-foundation/x402 | S-BS-14/15 wave 2.5 — binding-race & non-atomic-amount first run (lab probes A10a/A10b/A11, x402 PR #3920 @ 2b4cc47) | S-BS-14 FAIL race A10a (explicit expectation) + A10b (first-accepted): BOTH EIP-3009 payloads signed at divergent payTo before any binding was recorded (signer x2) — candidate-fix boundary; control-1 sequential pair, fresh client: exactly 1 signer call, attempt 2 rejected pre-signer (QuoteMismatchError) — green; control-2 parallel identical pair: 2 signed payloads, no false positive — green; fixed-client positive control (binding before attempt 2) → PASS with controls green, S-BS-15 FAIL decimal "0.5" signed at enabled pin $0.01 (×50, under the default $1 cap; resolved payload.amount = 500000) — candidate-fix boundary; control-1 cap shield "2" ($2, over cap): rejected pre-signer, 0 calls — green; control-2 atomic duplicate "500000": QuoteMismatchError pre-signer, 0 calls — green; cap=false opt-in variant "100000.5" signed (exploit window is UNDER the cap) | 2026-10-26 |
| #0005 | `argus-seal-0005` | inngest/inngest (inngest@4.26.0 + @inngest/test@1.0.0, npm dist) | Inngest idempotency conformance battery — 13 probes, 0 FAIL (2 DX findings filed inngest/inngest#5091) | h1-I1..I4 0 FAIL (1 PASS / 4 OBSERVED) 5 probes, in-process via the vendor's own @inngest/test harness. I1 PASS: replay of a completed step returns the memoized result, body not re-run. I2/I4 OBSERVED: commit-then-throw and lost-memo crash model re-execute the step body — matches the vendor's blog FAQ and docs idempotency page nearly verbatim. I3/I3b OBSERVED: memo keyed by userland step ID without payload binding; parallel branches reusing one step ID execute independently — ID model documented under 'Keep step IDs stable', p0..p4d 0 FAIL (4 PASS / 4 OBSERVED) 8 probes against the local dev server with a crash-safe external effect ledger. p0 PASS: baseline memo integrity, 1 charge. p4b/p4c/p4d PASS: documented event-ID dedup holds under a 12-way concurrent race (1 run / 1 charge), under sequential reuse (0 runs), fresh-ID control fires exactly once. p1/p2 OBSERVED: true A3 window reproduced live — provider commits, then step body throws (retry, ~24.5s backoff) or process.exit(1) (supervisor restart) — 2 charges, exactly as the vendor discloses. p3 OBSERVED (refined): duplicate step ID across parallel chains is warned (AUTOMATIC_PARALLEL_INDEXING) and auto-indexed into a separate memo slot, both handlers execute. p4a OBSERVED: 12 concurrent sends without a shared event ID produce 12 independent runs, the documented per-event model | 2026-10-27 |

A seal attests run validity and findings completeness — **not** bug-freeness.
