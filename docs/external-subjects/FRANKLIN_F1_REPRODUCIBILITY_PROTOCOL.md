# Franklin F1 — Reproducibility protocol

## Purpose

Reproduce the narrow observation that a test-only `PreSpend` deny hook is dispatched and enforced by Franklin's compiled executor before a local stub handler runs. This protocol is not a live payment test.

## Fixed subject

- Upstream: https://github.com/BlockRunAI/Franklin
- Revision: `45b026c4ee93a4a34cb15cfa8a008ae6b89becd6`
- Package: `@blockrun/franklin@3.49.6`
- Recorded environment: Node `v20.20.2`, npm `10.8.2`, Linux
- Canonical retained raw artifacts: [`evidence/franklin-f1/`](../../evidence/franklin-f1/)

## Safety boundary

- Use an isolated disposable workspace and HOME; do not use a funded wallet or production credentials.
- Do not issue paid model requests or call live payment/gateway endpoints.
- Do not modify upstream Franklin source or dependency files to inject a mock.
- Use a local stub for the spend handler. Stop if the harness reaches a real spend handler or attempts external network activity.
- Do not claim settlement, delivery, real-handler interruption, or production fallback coverage from this test.

## Procedure

1. Clone the official repository and check out the exact pinned commit above.
2. Record `git rev-parse HEAD`, package name/version, Node/npm versions, and `git status --porcelain`.
3. Run `npm ci --no-audit --no-fund`, then `npm run build`. Preserve complete output and exit codes.
4. Create a disposable HOME with `$HOME/.blockrun/hooks/f1-deny.json` and an unconditional deny script. The script should consume stdin, append the received JSON event to a test artifact, print `{"decision":"deny","reason":"ARGUS_F1_PRESPEND_DENY_TEST"}`, and exit 2.
5. Configure the hook's explicitly granted environment variable to write only inside the disposable workspace. Do not put secrets in the hook environment.
6. Run a harness against the compiled official loader, HookEngine, spend-tool registry, and StreamingExecutor. Submit a synthetic `JupiterSwap` invocation with a local stub handler; assert the returned result is an error with the unique deny reason and that the stub's `execute()` was not called.
7. Confirm the event log and Franklin's `$HOME/.blockrun/approvals.jsonl` contain the same session/reason and a `decision:"deny"` record.
8. Run a limited control using the same executor but with no HookEngine, and verify that the stub runs. Describe this only as a no-engine control; it is not equivalent to a full CLI test with `FRANKLIN_HOOKS=0`.
9. Preserve stdout/stderr, exit codes, raw event, audit row, exact source revision, harness, hook config/script, and SHA-256 manifest. Compute the manifest from the final retained files; never copy old hashes onto changed files.
10. Audit the claims independently. Distinguish `DYNAMIC_OBSERVED`, `STATIC_CONFIRMED`, `NOT_VERIFIED`, and `BLOCKED`.

## Acceptance criteria

- Exact upstream commit and package version recorded.
- Install/build exit codes are zero.
- Hook event is `PreSpend` and includes the expected spend tool.
- Executor returns the production deny result containing the unique test reason.
- Stub handler is not executed on the denied path.
- Franklin writes a matching deny audit record.
- No real wallet, signing, paid model call, or payment request is involved.
- Artifacts and checksums verify byte-for-byte.

## Required limits in every report

The test does **not** verify a live model-driven session, real spend-handler interruption, signing/submission against a real wallet, x402 behavior, settlement, post-payment delivery, duplicate-payment handling, or dynamic fail-open behavior. Source ordering may support `STATIC_CONFIRMED` claims, but must not be presented as dynamic observation. A lack of network calls inferred from source inspection must not be described as packet-level proof.

## Existing-run caveat

The archived harness uses absolute paths from the original sandbox and resets its event/audit files before running. Adapt paths and use a fresh disposable workspace before replaying; do not run it against a production HOME. The retained bundle is historical evidence, not a claim that this protocol was rerun after publication.
