# Track record — Argus Agent Test Lab

Every row below is backed by a signed, hash-chained record in this repository.
One command verifies the whole chain — no trust in this file required:

```bash
git clone https://github.com/igor-vii/Argus-Agent-Test-Lab
cd Argus-Agent-Test-Lab
node tools/registry/verify-registry.mjs
```

## Counters (as of 2026-11-24)

- **32 signed registry records** — 23 seals, 5 findings, 4 corrections; chain head `27f2f614…`
- **~20 external subjects tested** — from protocol SDKs (Cloudflare, Circle, Coinbase CDP, Inngest, Nevermined, BlockRun) to community gateways and live services
- **4 fixes shipped by 3 vendors in response to our runs** (+ 1 own-ecosystem fix loop), all in the last week
- **1 protocol-level PR** (x402#3920, expected-amount control) cross-checked across 3 re-pin cycles
- **2 independent external verifications** of the registry chain
- **2 sealed community candidates** (pre-registered identical-offer race batteries, 10/10 and 12/12)
- **Hostile batteries run at $0.00** — free endpoints only, no keys, no settlements

## Engagement track (first → latest)

Direction: **outbound** = we initiated; **inbound** = the vendor/operator asked us to run; **thread-grown** = grew inside an x402 issue we opened or participate in.

| Date | Subject | Record(s) | Direction | Outcome |
|---|---|---|---|---|
| 2026-10-23 | @x402/fetch reference client | [0000](attestations/records/0000-x402-reference-client-signs-any-server-declared-402-amo.finding.json) | outbound | founding finding: client signs ANY server-declared 402 amount (×10 overcharge captured); opened x402#3866 |
| 2026-10-23/24 | amw-paypal-agent-demo | [0001](attestations/records/0001-block-d-live-run-s10-s11-against-amw-paypal-agent-demo.seal.json), [0002](attestations/records/0002-block-d-clean-machine-reproduction-s10-s11-against-amw-paypa.seal.json) | outbound | live run + clean-machine reproduction |
| 2026-10-24 | official @x402 client v2.28.0 | [0003](attestations/records/0003-s-bs-06-binding-battery-3866-reviewer-round-2-controls-offic.seal.json) | outbound | #3866 reviewer round-2 controls |
| 2026-10-26–31 | x402 PR #3920 (expected-amount control) | [0004](attestations/records/0004-s-bs-14-15-wave-2-5-binding-race-non-atomic-amount-first-run.seal.json), [0008](attestations/records/0008-s-bs-14-15-cycle-2-x402-pr-3920-b1a4d8ce-cross-check-green-z.seal.json), [0012](attestations/records/0012-s-bs-06-cycle-3-x402-pr-3920-e993bef-re-pin-re-run-gree.seal.json) | thread-grown | three re-pin cycles against the PR; A11 verified closed; race rows reproduce (13/15) |
| 2026-10-27 | Inngest idempotency | [0005](attestations/records/0005-inngest-idempotency-conformance-battery-13-probes-0-fail-2-d.seal.json) | outbound | 13 probes, 0 FAIL; 2 DX findings filed inngest/inngest#5091 |
| 2026-10-27 | @blockrun/nano-client 0.8.0 | [0006](attestations/records/0006-s-bs-19-blockrun-nano-recovery-battery-real-sut-wave-4-vs-bl.seal.json) | outbound | 3 FAIL / 3 HOLD recorded; suite 377/377 independently reproduced |
| 2026-10-27 | @nevermined-io/payments 1.13.0 | [0007](attestations/records/0007-s-bs-20-nevermined-credit-recovery-battery-real-sut-wave-5-v.seal.json) | outbound | 7 FAIL / 1 DX / 3 HOLD recorded |
| 2026-10-28 | mcp-tool-idempotency (own ecosystem) | [0009](attestations/records/0009-mcp-tool-idempotency-external-verification-4d665ae-to-v0-2-0.seal.json), [0010](attestations/records/0010-correction-0009-01-seal-0009-severity-recalibration-and-word.correction.json) | outbound | F1/F2/F3 durability windows fixed; ten-window battery 10/10 PASS; severity recalibrated from maintainer review |
| 2026-11-01 | cloudflare/agents@0.32.0 | [0014](attestations/records/0014-t3-battery-chain-v2-sut-1-cloudflare-agents-0-32-0-offline-x.seal.json) | outbound | 4 PASS / 7 FAIL; Critical W5 payTo-binding window confirmed |
| 2026-11-01 | @circle-fin/x402-batching@4.0.0 | [0015](attestations/records/0015-t3-battery-chain-v2-sut-2-circle-fin-x402-batching-4-0-0-off.seal.json) | outbound | 2 PASS / 10 FAIL; Critical W-VERIFIER confirmed |
| 2026-11-01 | @coinbase/cdp-sdk@1.60.0 | [0016](attestations/records/0016-t3-battery-chain-v2-sut-3-coinbase-cdp-sdk-1-60-0-guardrails.seal.json) | outbound | 9 PASS / 2 FAIL; CDP-unique defenses verified |
| 2026-11-10 | Boundra @ fb09284 + gist candidate @ df69c25 | [0018](attestations/records/0018-s-bs-06-x-boundra-fb09284-pre-registered-identical-offer-rac.seal.json), [0019](attestations/records/0019-s-bs-06-x-gist-e319a833-df69c25-pre-registered-identica.seal.json) | thread-grown (#4198) | pre-registered identical-offer race batteries: 10/10 and 12/12 PASS |
| 2026-11-12 | scvd-general-store claim layer @ 56d6db3 | [0020](attestations/records/0020-wave-2-claim-layer-offline-re-implementation-scvd-gener-st.seal.json) | thread-grown | offline re-implementation battery; vendor amended H2 pre-freeze |
| 2026-11-12 | agent-passport-gateway @ 99888e8 | [0021](attestations/records/0021-nano-cross-process-idempotency-battery-agent-passport-gatewa.seal.json) | **inbound** | vendor asked for the two-process test; PR #14 merged; all registered rows passed |
| 2026-11-17 | x402-lens @ 1a99549 | [0023](attestations/records/0023-x402-lens-1a99549-full-server-side-battery-with-documented-b.seal.json) | outbound | 18 PASS / 3 DOCUMENTED / 0 FAIL across 21 sealed sessions → vendor shipped 0.2.1 the same day, both diagnosis gaps fixed |
| 2026-11-17 | Exa live discovery surface | [0024](attestations/records/0024-t4-exa-live-discovery-surface-conformance-battery-stage-1-2-.seal.json) | outbound | stage 1/2 conformance, discovery surface only; settle battery reserved |
| 2026-11-20/22 | QDay Aevum testnet · apiguru amazon-scraper-v2 · scorptech-x402-mcp | [0025](attestations/records/0025-qday-aevum-testnet-eip155-44005-x402-compatibility-probe-bar.finding.json), [0026](attestations/records/0026-apiguru-app-amazon-scraper-v2-live-x402-surface-probe-sample.finding.json), [0027](attestations/records/0027-scorptech-x402-mcp-kholley43-x402-v2-over-mcp-transport-pass.finding.json) | outbound | live probes at $0.00: billing semantics, free-call accounting, challenge delivered as MCP isError instead of HTTP 402 |
| 2026-11-22 | RAEN settlement ledger + Zambo production receipt | [0028](attestations/records/0028-x402-evidence-lens-frozen-classification-procedure-first-ext.seal.json) | thread-grown | first external datasets classified under the frozen procedure; independently re-checked by a third party |
| 2026-11-23/24 | reciprocal-ruler v0.1 → v0.2 (PayStage) | [0029](attestations/records/0029-reciprocal-ruler-v0-1-paystage-quote-lock-reconcile-pre-regi.seal.json), [0030](attestations/records/0030-reciprocal-ruler-v0-2-paystage-quote-lock-reconcile-pre-regi.seal.json) | both | 9/9 quote-hash determinism; F1 (overpayment → SETTLED_OK) → vendor shipped OVERPAID split, durable ledger, free read endpoint; re-run 4/4 MATCH, 0 divergences |
| 2026-11-24 | agentic-finance-graph@0.3.7 gate hook | [0031](attestations/records/0031-onbeforepaymentcreation-gate-hook-agentic-finance-graph-0-3-.finding.json) | **inbound** (in-thread) | 6/7 MATCH, 1 divergence: race — 7 of 8 parallel checks allowed, $1,400 under a $250/168h window → vendor: "the race is real on our side, and it is ours to fix"; fix deployed same day |

## Fixes shipped after our runs

1. **x402-lens 0.2.1 @ b0a394e** (now 0.2.4 on npm) — `payment.settle_failed` carries populated findings; flat `facilitatorHeaders` rejected at config time. Vendor verbatim: *"We treated the 18 PASS results and the three DOCUMENTED contracts as confirmed behavior and changed only the two diagnosis gaps you called out."* — *"Thank you again for the careful, non-destructive lab setup."*
2. **PayStage intent-mismatch fix (commit `75867aa`, deployed 2026-11-23)** — shipped proactively the same day, explicitly so our freeze could pin the semantics: *"a defect we shipped, found, and fixed today."*
3. **PayStage 0.2.0 — OVERPAID split + durable blob ledger + free public read endpoint** — after our F1 finding (overpayment judged `SETTLED_OK, +5`). Vendor: *"I agree it should not stay that way"*; *"What I will not do is edit that row or its constants underneath hashes already cited."* Verified by our re-run: 4/4 MATCH, 0 divergences (record 0030).
4. **AgenticFinanceGraph race fix (deployed 2026-11-24 09:40 UTC)** — read-evaluate-insert under one advisory lock per agent and reference; eight tests written before the code. Vendor: *"The race is real on our side, and it is ours to fix."*

Own-ecosystem loop: **mcp-tool-idempotency** durability windows (F1/F2/F3) fixed and re-sealed 10/10 PASS (records 0009/0010) — the same procedure applied to our own component.

## External verification of the registry

- **epistemedeus** (x402#4198): *"I ran the unchanged registry verifier at `b91566c…`: 20 records, including seals 0018/0019, pass integrity checks."*
- **zambodotdev** (x402#4198): *"I also checked the seal itself: record 0028 sits in your repo at commit `f15df0f5`, with leg A at zero divergences and leg B absent six times, as posted."*
- Production operator datapoint (bshelby88, 6 of 64 settlements near-duplicate) re-computed first-hand from the public ledger by zambodotdev.

## Accountability ledger

Corrections are separate records; sealed originals are never edited.

- **0010** — severity recalibration adopted from maintainer review
- **0011** — finding #0000 summary wording corrected after external audit review
- **0017** — fixture-label erratum (probe_start stale template default)
- **0022** — trust-anchor rotation recorded in-chain, originals preserved

## Open engagements (as of 2026-11-24)

- **x402-lens** — re-run battery against 0.2.4 @ ef21b31 (timeline pin passed with no objections)
- **PayStage** — funded A1 ($0.05 + 2×$0.25) on the `75867aa`-pinned semantics, then A7 receipt-gated recompute
- **AgenticFinanceGraph** — run 0032 against 0.22.6 invited by the vendor
- **fiangshi** — joint demo on two live sellers (cleave.fi, Bitrefill); vendor asked: *"What does an entry in your registry look like, and what would you need from us?"*
- **zambodotdev** — AER-1 attempt-tuple pre-registration interop: *"hash posted before the run, bytes after"*

## How a run is made (fixed rules)

1. Pre-registration freeze (draft + checker + detached signature) committed **before the first call**; the expected column and prereg hash never change after posting.
2. Budget declared upfront; hostile batteries run at $0.00 — free endpoints only, no keys, no settlements.
3. Every call recorded verbatim, exactly once, failures included.
4. Verdict: seal at full match; a finding otherwise. Either way the record is complete.
5. Post-run re-pins carry run metadata only, disclosed in-thread.
6. Anyone can verify the whole chain with one command (above).

## Contact

Open an issue in this repository, or reply in the x402 thread where the run is being discussed. Community and protocol-critical subjects are eligible for a free run; the operator's decision is recorded in the run thread.
