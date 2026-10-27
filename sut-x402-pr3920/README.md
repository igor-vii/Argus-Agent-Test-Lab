# SUT cross-check: PR #3920 vs acceptance matrix A1–A9

Harness for the cross-check published in
[x402-foundation/x402#3866](https://github.com/x402-foundation/x402/issues/3866):
runs the **PR branch's own** `SpendControls.expectedAmount` control against the
Argus acceptance matrix on the same S-BS-06 fault-injection stand used for the
round-2 binding battery (`../sut-x402/`).

## What is under test

- `@x402/core` **built from the PR branch** `gobeyondfj-cmd/x402`
  `feat/expected-amount` @ `4232cf66918c` (PR #3920), installed via
  `file:./x402-core-2.28.0.tgz` + npm `overrides` so every `@x402/*` package
  resolves to the PR build (verify: `npm ls @x402/core` — single copy).
- Rejection logic is the PR's own. This harness adds **observation only**:
  signer-call counting (pre-signer rejection vs signing boundary), verbatim
  402 requirement logs, verbatim cycle errors (recovering
  `QuoteMismatchError` fields from wrapped messages — the typed error does
  not survive `wrapFetchWithPayment`).

## Reproduce

```bash
# 1. build the PR core
git clone --branch feat/expected-amount https://github.com/gobeyondfj-cmd/x402.git
cd x402/typescript/packages/core && npm install && npm run build && npm pack
# 2. copy x402-core-2.28.0.tgz here, then:
npm install
# 3. run (12 sessions, ~3 min; stand is spawned per session by the orchestrator)
node battery-pr3920.mjs
```

Sessions map 1:1 to matrix rows A1–A9 (`matrix` field per session). Verdicts
are against the matrix row's required behavior: `FAIL` = conformance gap of
the PR (finding), not a harness error.

Result fixture: `../docs/block-b/fixtures/S-BS-06/s-bs-06-pr3920-crosscheck.fixture.json`.

Evidence discipline: settlement is mocked; captures establish pre-signer
rejection or signing at the signer boundary — never an on-chain transfer.
Per-session throwaway unfunded wallets; no keys/signatures in outputs.
