# x402-lens — registry of documented behavior (doc-registry)

Candidate: `Rozenberg888/x402-lens` @ `1a99549` (public repo HEAD at clone time,
2026-11-17), packages `@x402-lens/{core,express,cli}` 0.2.0, dependency SDK
`@x402/*` ^2.31.0.

Purpose (per the tasking): **anything explicitly described in the candidate's
own documentation is recorded here BEFORE the battery runs, and a battery
observation that matches a registered claim is verdicted `DOCUMENTED`, not
FAIL.** The registry is the carve-out list; the battery matrix cites these IDs.

Sources: `README.md` (R-), `PLAN.md` (P-), `docs/ai-micropayments-with-x402-lens.md` (D-),
`CHANGELOG.md` (C-), own test suite titles (T-, Layer 1 verbatim evidence).

## D-01 · Wraps, never reimplements the protocol

README §"x402 v2 payments for Express that explain themselves" / §"Positioning":
"`@x402/express` already implements the protocol … `x402-lens` does not
reimplement any of that. It wraps it". §"What this deliberately does not do":
"Fork the protocol or add non-standard fields", "Implement its own facilitator
client, or override verify and settle".

Battery implication: protocol-level behavior (verify/settle semantics, wire
shape, replay semantics) is **inherited from `@x402/*` and is not a lens
defect** unless the lens layer actively breaks it. Wire-conformance gaps are
attributed to the SDK baseline, recorded as boundary observations.

## D-02 · No defaults — refusal to guess is deliberate

README §Configuration: "Every value is required and has no default. A defaulted
facilitator or network means payments landing on the wrong chain, so the package
refuses to guess."

Battery implication: `paymentLens()` without facilitator/network/payTo **throws
by design** (session `l_config_refusals/missing_config`). Not a bug.

## D-03 · v1 shorthand networks are rejected

README §Configuration: "A v1 shorthand such as `base-sepolia` is rejected with
the CAIP-2 id to use instead."

Battery implication: `network: "base-sepolia"` → `ConfigError` naming the CAIP-2
form (session `l_config_refusals/v1_shorthand`). Not a bug.

## D-04 · `upto`/`exact` flow combinations are config errors

README §"Metered pricing with `upto`": "Setting `paymentFlow` on an `upto`
route, or `uptoFlow` on an `exact` one, is a configuration error … `@x402/core`
validates routes during background init and answers a bad combination with
`process.exit(1)` … `x402-lens` refuses the combination during config resolution
instead, naming the route and the valid flow."

Battery implication: both mismatch probes throw `ConfigError` naming the route
(session `l_config_refusals/upto_flow`, `exact_flow`). Not a bug — it is the
advertised crash-avoidance.

## D-05 · Flow matrix: `authorization` settles AFTER the handler (documented trade-off)

README §"When the money moves": "By default the middleware verifies, runs your
handler, then settles. That means a settlement failure after a `200` gives the
buyer the data and gives you nothing — fine for a cheap, repeatable read, wrong
for anything expensive." Table: `authorization` — "Goods without payment:
possible".

Battery implication: authorization flow + failing settle → the handler HAS run
(compute spent) and the paid response is replaced by 402 (no delivery, no
money). Observed as the documented trade-off **provided** the lens still emits
`payment.settle_failed` with findings — the event is the lens guarantee under
test. Missing event = defect; the flow outcome itself = DOCUMENTED.

## D-06 · `upfront` guarantees the handler is never called on settle failure

README §"When the money moves": "Verified against the real middleware: with
`upfront` and a failing settle, the handler is never called."

Battery implication: upfront + failing settle → handler ledger MUST show 0
calls, 402, `payment.settle_failed` event (session `l_settle_fail_upfront`).
Handler called = real defect.

## D-07 · `grant` is a documented bypass, always observable

README §"Free access without payment": "`grant` runs before verification …
Return `true` to let the handler run unpaid … or a string to deny with a 403 …
Every decision emits `access.granted` / `access.denied`, so a bypass is never
invisible in the event stream. No callback means no bypass path at all."

Battery implication: unpaid delivery via `grant` → `access.granted` event is
REQUIRED; absence of the callback → no bypass (negative control). The bypass
itself is DOCUMENTED; only a silent bypass (delivery without event) is a
defect (session `l_grant_paths`).

## D-08 · CORS for browser buyers is off by default

README §"Browser buyers": "None of the three payment headers is
CORS-safelisted … the browser strips `PAYMENT-SIGNATURE` from the retry — the
payment silently never happens. `x402-lens inspect` reports this." Option doc:
"Off by default, because an app with its own CORS middleware should own this."

Battery implication: default server exposes no `Access-Control-Expose-Headers`
→ DOCUMENTED (not a bug); with `cors: true` the three headers must appear; with
an app's own CORS layer the lens merges, never replaces (session
`l_cors_browser`).

## D-09 · The 402 body is `{}` by design in the SDK; the lens mirrors the challenge

README table: "Why is the 402 body unreadable? | body is `{}` by design |
challenge mirrored into the body". Option `readableBody` defaults to true.

Battery implication: 402 body must carry the decoded challenge
(`x402Version`, `accepts`) unless `readableBody: false` (then `{}` is
DOCUMENTED). Header remains canonical in both cases (session `l_gate_unpaid`).

## D-10 · `payment.required` is header-observed, read-only

README §Events: "`payment.required` is observed from the response headers,
because the SDK has no 'challenge issued' hook. The observer only reads; it
does not change the wire form."

Battery implication: the challenge header must stay byte-faithful to the SDK
(no lens-specific fields injected); mirrored body must match the header content
(session `l_wire_readonly`). Wire mutation = defect.

## D-11 · Sink failure never breaks a payment

README §Events: "Sinks are composable and a failing sink never breaks a
payment." `sinks.ts`: "Must not throw — errors are caught by the bus."

Battery implication: a sink that throws on every event must not change the
payment outcome (session `l_sink_throws`). Payment broken by a sink = defect.

## D-12 · Facilitator faults: error events + process survival (chaos contract)

README §Events: `facilitator.error` event type. PLAN §"Chaos (done)":
"Mock facilitator injects 429, 500, hung verify (timeout), and settle failure
after verify. Paid path must never crash the process."

Battery implication: verify→500 and verify→hang(>timeout) must yield 402, no
handler call, `facilitator.error` event, and a live process that still serves
the next request (sessions `l_facilitator_500`, `l_facilitator_timeout`).
Crash = defect.

## D-13 · Unknown facilitator codes are surfaced, never swallowed

README §"Why a request did not go through": "An unrecognised facilitator code
is never swallowed: it surfaces as a warning naming the code, so a new error
does not silently become 'unknown failure'."

Battery implication: verify responds `isValid:false` with an unknown
`invalidReason` → `payment.failed` carries the raw code and a warning finding
naming it (session `l_unknown_code`). Silently mapping to "unknown failure"
= defect.

## D-14 · Findings engine matches codes, never message text

README §Positioning: "The findings engine reads v2 objects and matches on
`invalidReason` / `errorReason` codes, never on message text, exactly as the
specification requires." Covered codes enumerated (14 codes).

Battery implication: findings assertions key on `code` values
(`signature_mismatch`, `settlement_pending`, …), not prose.

## D-15 · `settlement_pending` is non-terminal; `settlement_failed` is terminal

README §"Settlement is not delivery": "`settlement_pending` is treated as
non-terminal … the advice is to reconcile on chain, not to retry …
`settlement_failed` is terminal — funds did not move. `x402-lens` never claims
a payment was delivered after a 402."

Battery implication: a settle response `success:false,
errorReason:"settlement_pending"` must produce `payment.settle_failed` with a
`settlement_pending` finding (reconcile advice), and the lab must not treat it
as a double-charge risk (session `l_unknown_code` family — probe added there).
No retry logic exists in the lens to test (D-01) — the contract is the finding.

## D-16 · Multi-network challenges advertise one accepts[] entry per network

README §"Pricing the same route on several chains": "Set `networks` … the
challenge advertises one `accepts[]` entry per network". "A single `payTo`
string is accepted across several networks only when every one of them shares
the address format … Mixing an EVM chain with Solana requires one address per
network, and the package refuses the alternative". "A `$` price resolves each
chain's own default token and decimals, so the atomic amounts legitimately
differ. That is why an explicit `{ asset, amount }` price is rejected across
multiple networks."

Battery implication: EVM+Solana config with per-network payTo map → challenge
with 2 accepts entries, per-network payTo (session `l_multinetwork`); single
payTo string across EVM+Solana → ConfigError (session `l_config_refusals`).
Atomic-amount divergence across chains = DOCUMENTED, not a mismatch bug.

## D-17 · Facilitator auth: Bearer to /verify, /settle, /supported

README §"Facilitating behind an API key": "`X402_FACILITATOR_TOKEN` sends
`Authorization: Bearer …` to `/verify`, `/settle`, and `/supported`. For
per-endpoint credentials, pass `facilitatorHeaders` … the SDK requires that
per-path shape and rejects a flat headers object."

Battery implication: with the token set, the lab facilitator must observe the
Bearer header on all three endpoints and must reject without it (session
`l_facilitator_bearer`). The flat-shape claim is an SDK REQUEST-TIME behavior
(`resolveFacilitatorHeaders` passes the object through; the SDK reads per-path
keys): the battery probes the user-facing consequence — a flat object fails
closed, no delivery, auth failure surfaced (session
`l_facilitator_flat_headers`). Not a bug.

## D-18 · Networks outside eip155/solana throw with an explanation

README §Configuration: "Any other namespace throws with an explanation and
leaves you the `server` handle to register your own scheme." Also:
"`batch-settlement` and `auth-capture` exist in the SDK but are not registered
by this package."

Battery implication: unknown namespace → config/startup throw naming the
namespace (covered by config refusal probes). Missing schemes = DOCUMENTED
absence, not a bug.

## D-19 · Solana findings are honest-by-design shallow

README §"Why a request did not go through": "On Solana the payload is a signed
transaction … The rules check what is knowable — address and mint format,
network, scheme, amount atomicity — and say nothing about what they cannot see.
An honest gap beats a confident guess." PLAN Stage 2: "Deliberately shallow".

Battery implication: no transaction-level Solana verification is EXPECTED;
absence of deep Solana findings = DOCUMENTED. `pay_to_mismatch` on a
non-base58 Solana recipient IS expected (documented rule).

## D-20 · CLI contract: exit codes gate deploys; `add` never writes without `--write`

README §CLI: "`--json` prints a stable machine shape (always includes
`exitCode`) … `doctor` exits non-zero when the facilitator does not list the
configured network … `add` prints a diff and only writes with `--write`."

Battery implication: `inspect`/`doctor` against the live SUT must exit 0 in the
healthy configuration and carry `exitCode` in `--json` (session
`l_cli_inspect_doctor`). Prose scraping is not required by the contract.

## D-21 · Layer-1 claims already verified by the SUT's own suite (352 tests)

`npm test` — "unit + integration + chaos + property + load, no network" — run
verbatim as Layer 1 (see `layer1-run` in the fixture). Assertions verified
there (acceptance trio, CORS merge, readableBody, chaos survival, load bounds)
are re-probed by the lab battery only at the boundaries the suite cannot see
from inside (lab-owned facilitator, lab client, replay).

## Out-of-scope mapping (lab classes → lens topology)

The lab's Block-B money-fault family (S-BS-06 stand: overcharge ×50, price swap
after 402, duplicates, vendor crash) injects faults on the MERCHANT side; here
the merchant is the SUT itself, so the family maps as: duplicates →
`l_replay_same_payload` (server must re-verify every submission; honest
facilitator rejects the second nonce); vendor crash → `l_facilitator_500` /
`l_facilitator_timeout` (the SUT's external dependency dies); overcharge/price
swap → config-surface probes (`l_config_refusals`, `l_multinetwork`) — the lens
never quotes a price itself, it forwards configuration. The pre-sign
owner-fence race matrix (A10a/A10b) targets buyer-side signers and has no
server-side equivalent: two different buyers paying the same route concurrently
is normal business (`l_race_two_buyers`, negative control), and replay is the
only server-side double-delivery vector.
