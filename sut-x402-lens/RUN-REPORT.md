# RUN-REPORT — 0023-x402-lens-a10 (full battery, server-side SUT)

Candidate: **Rozenberg888/x402-lens** @ `1a99549ea5dd` (packages 0.2.0, SDK ^2.31.0, built dist).
Battery: **battery-lens-a10.mjs** — run 2026-11-17T12:54:42.313Z. Lab commit at run time: **9f48a9a**.

## Verdict line

**21 sealed sessions: 18 PASS / 3 DOCUMENTED / 0 FAIL** · Layer 1 (SUT's own suite, verbatim): 352 passed (352) across 22 passed, exit 0 · harness preflight unsealed: PASS.

## Topology

The SUT is the resource-server middleware, so the S-BS-06 stand is REPLACED by the SUT; the lab controls
both counterparts — the facilitator (lab-owned mock, fault-injection point) and the buyer (sealed client
perimeter lineage, plain honest buyer, instrumented signer, throwaway unfunded keys, settlement mocked).
Fresh facilitator + fresh SUT process + fresh client per session. Every candidate-documented behavior was
pre-registered in [doc-registry.md](doc-registry.md) (D-01…D-21) BEFORE the run; a session observation
matching a registered claim is verdicted **DOCUMENTED**, not FAIL.

## Sessions

| Session | Matrix | D-refs | Slot HTTP | Verdict |
| --- | --- | --- | --- | --- |
| `l_gate_valid` | canonical gate | D-14 | 200 | **PASS** |
| `l_verify_reject` | verify rejects (money-fault: invalid payment) | D-14 | 402 | **PASS** |
| `l_undecodable_payload` | garbage payment header | D-12 | — | **PASS** |
| `l_settle_fail_auth` | money-fault: settle fails, authorization flow (default) | D-05 | 402 | **DOCUMENTED** |
| `l_settle_fail_upfront` | money-fault: settle fails, upfront flow | D-06 | 402 | **PASS** |
| `l_facilitator_500` | chaos: verify -> HTTP 500 | D-12 | 402 | **PASS** |
| `l_facilitator_timeout` | chaos: verify hangs beyond facilitator timeout | D-12 | 502 | **PASS** |
| `l_unknown_code` | unknown facilitator code | D-13 | 402 | **PASS** |
| `l_settle_pending` | settlement_pending (non-terminal) | D-15 | 402 | **DOCUMENTED** |
| `l_race_two_buyers` | server-side race: two independent buyers, one route (negative control) | D-01 | 200,200 | **PASS** |
| `l_replay_same_payload` | replay: identical PAYMENT-SIGNATURE resubmitted | D-01, D-14 | 200,402 | **PASS** |
| `l_grant_paths` | grant bypass: allow / deny / absent (negative control) | D-07 | 200,403,200 | **PASS** |
| `l_sink_throws` | chaos: a sink throws on every event | D-11 | 200 | **PASS** |
| `l_multinetwork` | multi-network challenge: eip155 + solana | D-16 | 200 | **PASS** |
| `l_facilitator_bearer` | facilitator auth: Bearer token forwarding | D-17 | 200 | **PASS** |
| `l_facilitator_flat_headers` | facilitator auth: flat headers object (documented per-path shape) | D-17 | 500 | **DOCUMENTED** |
| `l_gate_unpaid` | canonical gate: unpaid challenge | D-09, D-10 | — | **PASS** |
| `l_wire_readonly` | observer read-only: wire form untouched | D-10 | — | **PASS** |
| `l_cors_browser` | browser buyers: cors off (default) / on / merge with app CORS | D-08 | — | **PASS** |
| `l_config_refusals` | config surface: documented refusals + one valid control | D-02, D-03, D-04, D-16, D-18 | — | **PASS** |
| `l_cli_inspect_doctor` | shipped CLI against the live SUT | D-08, D-20 | — | **PASS** |

## The three DOCUMENTED (documented behavior, not bugs)

1. **`l_settle_fail_auth` (D-05)** — in the authorization flow (default) settlement happens after the handler:
   a failing settle spends the compute and replaces the response with 402. Documented trade-off — AND the lens
   guarantee held: `payment.settle_failed` with the facilitator reason.
2. **`l_settle_pending` (D-15)** — `settlement_pending` is non-terminal: reason carried verbatim, no delivery
   claimed, no auto-retry. The `settlement_pending` finding renders via `x402-lens explain` (see observations).
3. **`l_facilitator_flat_headers` (D-17)** — a flat `facilitatorHeaders` object is rejected by the SDK exactly
   as documented: zero facilitator contact, no delivery, process survives.

## Observations (nuances, not defects; both fail closed)

1. **Settle-failure events carry `findings: []`.** The SDK settle error exposes the reason as the error message
   without a structured settle response under the keys `settleFromError` reads; the settlement_pending /
   settlement_failed findings render via `x402-lens explain --settle`. User-facing contract (reason carried,
   reconcile-not-retry, no delivery claim) holds.
2. **Flat-headers rejection shape.** The lens source comment promises config-time validation ("validated once
   here rather than surfacing as a failed payment later"); actually `resolveFacilitatorHeaders` passes the flat
   object through and the SDK rejects it at request time as HTTP 500 on the first payment request. The README
   promises no such early validation — the rejection itself is documented behavior.

## Methodology note — the first run, in full

The first full battery run produced **11 non-PASS sessions**. A per-session fact review attributed all of
them to lab equipment, not to the candidate:

- **8 matcher bugs** — sessions compared `handler_counts["/weather"] === 0` against an empty dict
  (`undefined !== 0`); the observed behavior was correct in every one.
- **1 replay-capture race** — the lab client started replay slot 2 before slot 1's payment-header capture
  landed; slots now run sequentially in replay mode. Slot 1→200, slot 2→402 with `duplicate_payment_nonce`
  after the fix.
- **1 mislocated expectation** — flat `facilitatorHeaders` is rejected by the SDK at request time, not at
  config resolution; the probe moved from the config surface to an honest HTTP session.
- **1 unaccounted documented CLI behavior** — `x402-lens inspect` exits 1 on a cors-off server because the
  browser-readiness report is part of its contract (D-08/D-20); the CLI session now checks both sides
  (default → exit 1 with the report; cors-on → exit 0).

Matchers/harness fixed, sessions re-run clean: **21/21**. Raw first-run ledgers stay lab-local and are not
committed; the sealed evidence is the clean second-run fixture and its per-session facts.

## Evidence discipline

Established: HTTP responses at the SUT boundary, the SUT's own event stream, the handler ledger, the
facilitator call ledger. NOT established: an on-chain transfer (settlement mocked; throwaway unfunded
wallets). Redaction: no private keys, no signatures; payment nonces shortened; the replay header is captured
in process memory only; the facilitator token is a session-local dummy. Raw ledgers stay lab-local
(`/tmp`, not committed).

## Reuse

Attribution: executed per the Argus Agent Test Lab battery series, server-side topology (candidate replaces
the S-BS-06 stand; the lab owns the facilitator and the buyer). The battery kit
(argus-battery/: orchestrator, client, server harness, mock facilitator, config probe) is the lab's reusable
core for future server-side SUTs. Any reuse or derivative MUST retain this banner.
