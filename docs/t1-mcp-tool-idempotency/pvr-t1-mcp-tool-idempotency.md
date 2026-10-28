# PVR package — tripl3tr3s/mcp-tool-idempotency

> Готово к вставке в GitHub Private Vulnerability Reporting.
> Поле "Title" — строка после `## Title:` ниже; всё остальное (начиная с `## Summary`) — в поле "Description".
> Язык отчёта — английский: README/PR-практика репо английские, форма GitHub англоязычная.

## Title:
Duplicate side effects in three failure windows: lost response, crash takeover, and cross-instance claim race each re-execute committed effects

## Description:

## Summary

While locally auditing this library's idempotency layer (adversarial durability testing against a local clone of your published code), I found that the headline guarantee — "Exactly-once execution for MCP tool calls (or any costly async op), so retries never fire side effects twice" (README L7 @ `4d665ae`) — does not hold in three common failure windows:

1. **Lost response after commit** — the executor commits the effect at the provider, then the response is lost and the executor throws. Failures are not cached (by design), and there is no "outcome uncertain" state, so a retry re-dispatches the tool and fires the effect a second time.
2. **Crash after commit** — a crashed holder's `pending` row is unconditionally reset (taken over) by the next caller with no liveness proof, so a committed effect is re-executed under the guise of "crash recovery".
3. **Cross-instance race** — with two store instances sharing one backend (the advertised multi-instance topology for `PostgresBackend`), the claim loser resets the winner's *live* `pending` row and re-runs its own executor while the winner is still in flight. Both instances execute the side effect and both return success — with different results.

These are durability/correctness defects with direct impact for the library's advertised use cases (charging cards, "costly" side effects): the duplicate side effect executes, and the caller sees a clean success in every window.

## Affected version

- Repository: tripl3tr3s/mcp-tool-idempotency
- Commit: `4d665aed9c68d78be6f16ee22b7e2feae21a4f7b` (2026-07-13) — still current `main` as of 2026-10-27
- Runtime used for verification: Node v24.21.0, tsx 4.19.2
- Backends exercised: `MemoryBackend` (all three windows). The cross-instance window models the `PostgresBackend` contract (atomic claim via INSERT..ON CONFLICT; unconditional reset/complete UPDATE), which `runOnce()` consumes backend-agnostically.

## Root cause

`runOnce()` in `src/store.ts` (lines 95-112 @ `4d665ae`):

```ts
const claimed = await backend.claim(key, claimMeta);
if (!claimed) {
  // Someone else holds the key. If they finished, replay their result;
  // otherwise the holder is stale/crashed - take over and re-run.
  const current = await backend.check(key);
  if (isCompleted(current)) return JSON.parse(current.response) as T;
  await backend.reset(key, claimMeta);   // unconditional takeover, no liveness proof
}

try {
  const result = await executor();
  await backend.complete(key, JSON.stringify(result));
  return result;
} catch (error) {
  // Failures are NOT cached - the next call is allowed to retry.
  await backend.fail(key);
  throw error;
}
```

Two assumptions together produce all three failures:

- **"throw ⇒ nothing happened".** The `catch` treats every executor failure as a clean failure, but an executor that already committed at the provider before throwing is indistinguishable from a pure pre-effect failure. The state machine has no committed/uncertain state (only `pending` / `completed` / `failed`).
- **"stale holder ⇒ crashed before the effect".** `reset()` (`src/backends/memory.ts:60-71`, `src/backends/postgres.ts:72-77`) rewrites a `pending` row unconditionally, with no lease/owner/liveness check, so takeover after a commit-but-before-`complete()` crash re-executes the effect.

## Findings

### F1 — Lost response after commit → retry fires a second side effect

Minimal reproduction (public API from your README quickstart):

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
console.log(providerCharges);  // => 2  ← second side effect
```

Observed: `providerCharges = 2`; both calls reject with `ETIMEDOUT`.
Expected by README: "retries never fire side effects twice" — the second dispatch must not happen, or the retry must surface an uncertain-outcome signal instead of silently re-executing.

### F2 — Crash after commit → takeover re-runs the committed effect

Reproduction: holder A executes; the executor commits at the provider; A dies before `complete()` (row stays `pending` from a dead holder). A fresh store on the same backend calls with the same key; `runOnce` takes over via `reset()` and re-runs the executor.

Observed: 2 side effects; the retry returns a clean success (`{"charged":true,"recovered":true,"n":2}`). The caller cannot distinguish "recovered a crash that happened *before* the effect" from "re-executed *after* the effect" — at-least-once behavior inside the window the README sells as exactly-once ("exactly-once across restarts").

Anchors: `src/backends/memory.ts:60-71` and `src/backends/postgres.ts:72-77` (unconditional `reset`), `src/store.ts:96-102` (takeover decision on `!claimed`).

### F3 — Cross-instance race: claim loser resets a live winner; both succeed with different results

Reproduction (two instances, one shared backend):

```ts
const backend = new MemoryBackend();   // stands in for one shared Postgres
const storeA = createIdempotencyStore(backend);
const storeB = createIdempotencyStore(backend);

const [ra, rb] = await Promise.all([
  storeA.execute("order-123", META, async () => { await sleep(50); return { charged: "A" }; }),
  storeB.execute("order-123", META, async () => { await sleep(5);  return { charged: "B" }; }),
]);
```

Observed: both executors run (2 side effects); A returns `{charged:"A"}`, B returns `{charged:"B"}` — the loser checked `completed` only (`store.ts:99-100`), then `reset()` the *alive* winner's pending row (`store.ts:101`) and re-ran its own executor. The Layer-1 in-flight map is per-process and cannot see the other instance. `PostgresBackend` is the shipped multi-instance answer, so this window is the advertised production topology.

Expected by README: "only one caller ever wins the claim"; "exactly-once across restarts".

### Hardening notes (no headline violated, recorded to bound/interest)

- **Stored request meta is never compared.** `claim()` persists `meta.request` (`src/store.ts:89-93`; both backends store it), but no code path ever reads it back (verified by search over `src/` @ `4d665ae`). Two different requests sharing a key silently replay the first request's result. Stripe-class APIs reject such mismatches; a compare-and-conflict here is a cheap integrity win.
- **"Exactly-once" is TTL-scoped** (`options.ttlMs`, default 24h). Documented and coherent; noted only to bound the headline's coverage.

## Suggested remediation direction

1. Add an explicit **uncertain outcome** state: on an executor throw after dispatch (and on crash boundaries), the row enters `uncertain`, and redispatch is blocked until the outcome is reconciled (or a configured policy resolves it). "Failures are not cached" is only safe for failures that are provably pre-effect.
2. Give claims an **owner token + lease**: only a verified owner, or a lease expiry, may trigger takeover — and expiry must surface "outcome unknown" to the caller rather than silently re-arming execution.
3. Cross-instance: never reset a `pending` row you don't own. Replay-from-completed only; gate any takeover on lease expiry, not on "not completed yet".
4. Compare incoming `request` meta against the stored record and surface a conflict on mismatch.

## Verification

All findings are reproducible against a clean clone at `4d665ae` with Node 24 + tsx, using the snippets above. A consolidated scenario battery (7 windows incl. the two PASS baselines) is available and I'm happy to share the per-scenario scripts on request, or re-run against any fix branch.

## Disclosure terms

- All testing was done locally against your published open-source code; no live services, no production systems, no third parties affected.
- This report is private. I will not publish any details before a fix ships, or for 90 days — whichever timeline you prefer; I'll follow your schedule and can extend if needed.
- Credit is optional: any name/handle you prefer, or fully anonymous.
- If any of the above is intended/documented behavior, a short note would help me correct my model of the library.
