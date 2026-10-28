# External verification note — mcp-tool-idempotency (4d665ae → v0.2.0)

> Author: Igor — Argus Agent Test Lab (independent adversarial-conformance lab)
> Maintainer contact and fixes: Tripl3 (tripl3tr3s/mcp-tool-idempotency)
> Status: verification note — linked from the project's release notes and SECURITY.md
> Runtimes: Node v24.21.0 — tsx 4.19.2 (original before-state probes @ `4d665ae`), tsx 4.23.15 (v0.2.0 verification battery + before re-checks)

## Verdict (short)

The library's headline guarantee — *"Exactly-once execution for MCP tool calls (or any costly async op), so retries never fire side effects twice"* (README @ `4d665ae`) — did **not** hold at `4d665ae`: three durability windows reproducibly fired a committed side effect twice, each returning a clean success to the caller. In **v0.2.0** the maintainer reworked the state machine (lease-based liveness with `leaseMs`, explicit retry classification via `isRetryable`, documented at-least-once default) and our ten-window adversarial battery now **passes on `MemoryBackend`**. The remaining exactly-once edge is, by the maintainer's own documentation, the at-least-once window that the default keeps open and `isRetryable` closes.

## 1. Before state @ 4d665ae — three reproduced windows

Root cause (`runOnce()`, `src/store.ts:95-112` @ `4d665ae`): two assumptions — *"throw ⇒ nothing happened"* (failures are not cached and there is no committed/uncertain state) and *"stale holder ⇒ crashed before the effect"* (`reset()` rewrites a live `pending` row unconditionally, no liveness proof: `src/backends/memory.ts:60-71`, `src/backends/postgres.ts:72-77`).

- **F1 — lost response after commit → retry re-fires the effect.** The executor commits at the provider, then throws (response lost). A retry re-dispatches the tool: 2 side effects, both calls see an error.
- **F2 — crash after commit → takeover re-runs the committed effect.** The holder dies between commit and `complete()`; the row stays `pending` from a dead holder; the next caller's unconditional `reset()` re-runs the executor — at-least-once behavior inside the window the README sold as exactly-once across restarts.
- **F3 — cross-instance race → claim loser resets a live winner.** Two instances share one backend (the advertised multi-instance topology); the loser resets the winner's live `pending` row and re-runs while the winner is in flight: both execute the effect, both return success — with different results.

## 2. After state — v0.2.0

- **Lease-based liveness.** Claims carry a lease (`leaseMs`); takeover requires lease expiry instead of an unconditional reset. The README documents sizing: a CPU-bound executor blocking the event loop longer than `leaseMs` can lose its lease while still running — size `leaseMs` above the worst-case block or move work to a worker thread; instances are asked to keep clock drift well under `leaseMs` (DB-clock lease expiry is planned for 0.3.0).
- **Retry classification.** `isRetryable` gives callers an explicit contract for the lost-response window instead of a silent re-dispatch (`onLeaseExpired: 'uncertain'` does the same for the takeover window).
- **Request-meta fingerprinting.** Same key with a different request payload now fails fast with `IdempotencyConflictError` (canonical SHA-256 fingerprint, key-order-insensitive); `verifyRequest: false` restores the 0.1.x behavior.
- **Battery.** Our ten-window adversarial battery (see §4) passes 10/10 on v0.2.0 / `MemoryBackend`; the in-repo suite passes 91/91 at the release tag (`e3235d2`). The maintainer independently mapped the ten windows onto the in-repo suite: all but two were already covered by `report-scenarios.test.ts`; the two remaining — the TTL boundary through `execute()`, and a live holder still owning its row after a newcomer is rejected — were added right after the release, so the current suite passes 93/93 and covers every window on both backends.

## 3. Scope (kept explicit at the maintainer's request)

1. **The battery ran on `MemoryBackend`.** It verifies the store/`runOnce` logic, **not** the Postgres SQL; Postgres-specific coverage is planned by the maintainer. (The before-state F3 probe modeled the documented `PostgresBackend` contract — atomic claim via `INSERT..ON CONFLICT`, unconditional reset/complete `UPDATE` — but v0.2.0 Postgres SQL itself was not executed.)
2. **F1 semantics:** the default still allows the documented at-least-once window; **`isRetryable` is what closes it.** The battery verifies the classification and its documentation — not a magic unconditional exactly-once.

## 4. The ten windows

Method: 10 standalone probes against `v0.2.0` (`e3235d2`), `MemoryBackend`, public API only; expectations were pre-registered (probe headers + a battery README) before the run. The report's seven windows map to ten probes: W1 and W2 are split into default / opt-in sub-cases. **Result: 10/10 PASS.** Before-state contrast: all four before-discriminators (lost response, dead-holder takeover, cross-instance race, request-meta) still reproduce the old behavior at `4d665ae` — 4/4 OBSERVED-BEFORE.

| # | Window | v0.2.0 verdict |
|---|---|---|
| W0 | Baseline — clean duplicate | PASS — replay, 1 charge, identical result |
| W1a | F1 lost response, default | PASS — retry re-raises the post-commit throw (2 charges): the documented at-least-once window |
| W1b | F1 lost response, opt-in `isRetryable: false` | PASS — 1 charge + `IdempotencyUncertainError`; blocked until `forget()` |
| W2a | F2 takeover, live holder | PASS — live lease is never taken; `IdempotencyInFlightError`, executor not started |
| W2b | F2 takeover, expired lease, default | PASS — conditional takeover exactly once, then replay |
| W2c | F2 takeover, expired lease, opt-in `onLeaseExpired: 'uncertain'` | PASS — blocked until reconcile |
| W3 | F3 cross-instance race | PASS — 1 charge; loser gets `InFlight`; its retry replays the winner's result |
| W4 | Same key, different payload | PASS — `IdempotencyConflictError` on replay and in-flight paths; canonical fingerprint (key order irrelevant); `verifyRequest: false` restores old behavior |
| W5 | Baseline — pre-effect failure | PASS — retry commits exactly once (1 charge) |
| W6 | Baseline — TTL boundary | PASS — replays inside TTL, re-executes past TTL (documented boundary) |

## 5. Before/after probes (these document the old behavior)

**F1 probe (public README-quickstart API, reproduces at `4d665ae`):**

```ts
import { createIdempotencyStore } from "./src/store.ts";
import { MemoryBackend } from "./src/backends/memory.ts";

let providerCharges = 0;
const store = createIdempotencyStore(new MemoryBackend());
const META = { toolName: "charge", request: { orderId: "order-123" } };

const attempt = () =>
  store.execute("order-123", META, async () => {
    providerCharges++;   // provider accepts and commits the charge
    throw new Error("ETIMEDOUT: response lost after provider accepted");
  }).catch((e) => e.message);

console.log(await attempt());  // "ETIMEDOUT: ..."
console.log(await attempt());  // same key — a "retry"
console.log(providerCharges);  // => 2  ← second side effect @ 4d665ae
```

On v0.2.0 the same probe — as written, with default store options — **still yields 2 charges**: the retry re-dispatches the executor and re-raises the post-commit throw; both calls see the error. That is the documented at-least-once window (§3, W1a) — the same observable outcome as at `4d665ae`; what v0.2.0 adds is that the window is now documented and controllable. With the opt-in `isRetryable: () => false` the probe charges **once** and the retry raises `IdempotencyUncertainError` (W1b; the key stays blocked until `forget()`; re-checked 2026-10-28 on `e3235d2`, node v24.22.1 / tsx 4.23.15 — both variants, plus re-execution after `forget()`). **F2/F3** (crash-takeover; cross-instance race) reproduce at `4d665ae` per the anchors above; on v0.2.0 the lease/ownership guards hold — a live holder keeps its row and a newcomer is rejected.

## 6. Acknowledgments

- **Tripl3 (maintainer)** — rapid turnaround from report to release; the lease redesign; the two added window tests in `report-scenarios.test.ts`; README documentation of the event-loop/lease sizing trap and clock-drift requirement; the DB-clock lease expiry roadmap (0.3.0).
- The original report and this independent verification are credited in the project's SECURITY.md ("Igor (Argus agent test lab)").

## 7. Reproducibility

- Before-state probes: pin `4d665aed9c68d78be6f16ee22b7e2feae21a4f7b`, run the F1 snippet above with tsx; F2/F3 need a killed holder and two store instances over one backend, respectively.
- In-repo suite: `git clone https://github.com/tripl3tr3s/mcp-tool-idempotency && cd mcp-tool-idempotency && git checkout v0.2.0`, then the CI-exact `pnpm install --frozen-lockfile && pnpm test` (the repo pins pnpm) — our runs used the npm equivalent `npm install && npx vitest run`: **91/91** at the release tag, **93/93** at current `main` (two window tests added post-release).
- Our battery: ten standalone probes (plus four before-state discriminators against a `git worktree` of `4d665ae`), public API only, expectations pre-registered before the run. The scripts are not part of the upstream repo; available on request — same promise as the original report.
- Disclosures were coordinated with the maintainer before publication; no third-party services were contacted during testing.