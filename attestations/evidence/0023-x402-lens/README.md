# 0023 — x402-lens full battery (server-side SUT)

Candidate: `Rozenberg888/x402-lens` @ `1a99549ea5dd`
(packages `@x402-lens/{core,express,cli}` 0.2.0, SDK `@x402/*` ^2.31.0, built dist).
Tasking: run the whole lab battery WITH the candidate's documentation accounted
for — behaviors described in its docs are pre-registered in
[`sut-x402-lens/doc-registry.md`](../../sut-x402-lens/doc-registry.md)
(D-01…D-21, sha-pinned in the fixture) and verdict `DOCUMENTED`, not FAIL.

## Topology (inverted vs sealed cycles 0018/0019)

The SUT is the resource-server middleware, so the S-BS-06 stand is REPLACED by
the SUT; the lab controls both counterparts: the facilitator (lab-owned mock,
fault-injection point) and the buyer (sealed client-perimeter lineage, plain
honest buyer, instrumented signer, throwaway unfunded keys, settlement mocked).

## Layers

- **Layer 1** — the SUT's own suite verbatim (`npm test`, no network):
  352 passed (352) across 22 passed, exit 0.
- **Layer 2** — this battery: 20 sealed sessions + 1 unsealed harness preflight,
  fresh facilitator + fresh SUT process + fresh client per session.

## Verdicts

| Session | Matrix | Doc refs | Slot HTTP | Verdict |
| --- | --- | --- | --- | --- |
| `l_gate_valid` | canonical gate | D-14 | 200 | **PASS** |
| `l_verify_reject` | verify rejects (money-fault: invalid payment) | D-14 | 402 | **PASS** |
| `l_undecodable_payload` | garbage payment header | D-12 | - | **PASS** |
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
| `l_gate_unpaid` | canonical gate: unpaid challenge | D-09, D-10 | - | **PASS** |
| `l_wire_readonly` | observer read-only: wire form untouched | D-10 | - | **PASS** |
| `l_cors_browser` | browser buyers: cors off (default) / on / merge with app CORS | D-08 | - | **PASS** |
| `l_config_refusals` | config surface: documented refusals + one valid control | D-02, D-03, D-04, D-16, D-18 | - | **PASS** |
| `l_cli_inspect_doctor` | shipped CLI against the live SUT | D-08, D-20 | - | **PASS** |

**21 sealed sessions: 18 PASS, 3 DOCUMENTED, 0 FAIL.** Verdict semantics:
`PASS` = matches the pre-registered expectation; `DOCUMENTED` = matches a
pre-registered doc-registry claim (not a bug by tasking; the claim's required
guarantees all held); `FAIL` = defect; `HARNESS_ERROR` = no verdict.

## Observations (not defects)

1. **Settle-failure event findings (D-15 nuance).** `payment.settle_failed`
   carries the facilitator reason verbatim (`insufficient_funds`,
   `settlement_pending`) but `findings: []` at runtime: the SDK settle error
   does not expose the structured settle response under the keys the lens's
   `settleFromError` reads. The settlement_pending / settlement_failed
   findings render via `x402-lens explain --settle` (engine rule
   `checkSettlementVerdict`). Non-terminal semantics (reason carried,
   reconcile-not-retry advice, no delivery claim) hold.
2. **Flat facilitatorHeaders rejection shape (D-17 nuance).** A flat headers
   object is rejected by the SDK exactly as documented — fail-closed (no
   facilitator contact, no delivery, process survives) — but the rejection
   surfaces as HTTP 500 on the first payment request rather than a config-time
   refusal. The lens source comment promises early validation; the README does
   not. Cosmetic robustness gap, fails closed either way.

## Files

- `runs/battery-fixture.json` — the complete battery fixture (provenance,
  config, facts, verdicts, addendum, green-zone definition).
- `runs/<session>.facts.json` — per-session fact record (lean).
- `runs/<session>.client.jsonl.summary` — lab buyer PROBE_SUMMARY per session
  (signatures never logged; payment nonces shortened).

## Evidence discipline

- Established: HTTP responses at the SUT boundary, the SUT's own event stream,
  the handler ledger, the facilitator call ledger.
- Not established: an on-chain transfer (settlement mocked; throwaway
  unfunded wallets).
- Redaction: no private keys, no signatures; replay header captured in process
  memory only; facilitator token is a session-local dummy.

Provenance: lab commit 9f48a9a56dce79475782af24ac638b06024e51c4, SUT file hashes in
`runs/battery-fixture.json` (`attribution.sut.file_sha256`).
