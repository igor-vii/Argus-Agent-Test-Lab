/**
 * Argus cross-check harness — Target 1: tripl3tr3s/mcp-tool-idempotency
 * Repo HEAD under test: 4d665aed9c68d78be6f16ee22b7e2feae21a4f7b (2026-07-13)
 *
 * Failure classes probed (Argus Block-B semantics):
 *   A1  sequential replay            (baseline claim: "retry replays, executor once")
 *   A2  same-process concurrent      (their Layer-1 in-flight map claim)
 *   A3  lost response after commit   (F2 twin: effect committed, response lost -> throw -> retry)
 *   A4  crash after commit           (cross-restart: effect committed, process died before complete())
 *   A5  cross-instance race          (A10b twin: two stores, one shared backend, both in flight)
 *   A6  key collision                (same key, different request payload)
 *   A7  TTL expiry                   (documented re-execute after TTL)
 *
 * Verdict semantics (house style):
 *   PASS     — at-most-once held where the claim covers it
 *   FAIL(SUT)— probe ended with a second side effect inside the claim's coverage
 *   OBSERVED — behavior recorded, no headline claim contradicted
 *
 * A5 topology note: two `createIdempotencyStore()` instances sharing one backend
 * faithfully models two processes/instances behind one PostgresBackend:
 * in-flight maps are per-store (per-process), backend contract (atomic claim =
 * INSERT..ON CONFLICT DO NOTHING; unconditional reset/complete UPDATE) is
 * byte-identical to src/backends/postgres.ts @ 4d665ae. runOnce logic is
 * backend-agnostic.
 */

import { createIdempotencyStore } from "../refs/pack1/mcp-tool-idempotency/src/store.ts";
import { MemoryBackend } from "../refs/pack1/mcp-tool-idempotency/src/backends/memory.ts";
import type { ExecuteMeta } from "../refs/pack1/mcp-tool-idempotency/src/store.ts";

const META: ExecuteMeta = { toolName: "charge", request: { orderId: "order-123" } };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface ScenarioResult {
  id: string;
  title: string;
  expected_by_claim: string;
  observed: string;
  side_effects: number | string;
  verdict: string;
  notes: string;
}

const results: ScenarioResult[] = [];

function record(r: ScenarioResult): void {
  results.push(r);
  const mark = r.verdict.startsWith("FAIL") ? "FAIL" : r.verdict;
  console.log(
    `[${r.id}] ${mark} — effects=${r.side_effects} | expected: ${r.expected_by_claim} | observed: ${r.observed}`
  );
}

// ---------------------------------------------------------------- A1
async function a1_sequential_replay(): Promise<void> {
  const backend = new MemoryBackend();
  const store = createIdempotencyStore(backend);
  let effects = 0;
  const executor = async () => {
    effects += 1;
    await sleep(5);
    return { charged: true, n: effects };
  };

  const first = await store.execute("p1_A1_sequential_replay", META, executor);
  const retry = await store.execute("p1_A1_sequential_replay", META, executor);

  record({
    id: "p1_A1_sequential_replay",
    title: "Sequential retry with same key replays completed result",
    expected_by_claim: "effects=1 (README: 'A retry with the same key replays result')",
    observed: `effects=${effects}, first=${JSON.stringify(first)}, retry=${JSON.stringify(retry)}`,
    side_effects: effects,
    verdict: effects === 1 ? "PASS" : "FAIL (SUT)",
    notes: "Baseline; matches README quickstart example.",
  });
}

// ---------------------------------------------------------------- A2
async function a2_same_process_concurrent(): Promise<void> {
  const backend = new MemoryBackend();
  const store = createIdempotencyStore(backend);
  let effects = 0;
  const gate = { open: false, waiters: [] as (() => void)[] };
  const executor = async () => {
    effects += 1;
    await new Promise<void>((r) => {
      if (gate.open) r();
      else gate.waiters.push(r);
    });
    return { charged: true, n: effects };
  };

  const p1 = store.execute("p1_A2_race_same_process", META, executor);
  await sleep(5); // let p1 register in-flight and enter executor
  const p2 = store.execute("p1_A2_race_same_process", META, executor);
  await sleep(60); // hold both in flight
  gate.open = true;
  gate.waiters.forEach((w) => w());
  await Promise.allSettled([p1, p2]);

  record({
    id: "p1_A2_race_same_process",
    title: "Concurrent same-process same-key calls (Layer-1 in-flight map)",
    expected_by_claim: "effects=1 (README: 'The second caller awaits the first caller's promise')",
    observed: `effects=${effects}`,
    side_effects: effects,
    verdict: effects === 1 ? "PASS" : "FAIL (SUT)",
    notes: "Their headline differentiator vs 'naive single-layer store'.",
  });
}

// ---------------------------------------------------------------- A3
async function a3_lost_response_after_commit(): Promise<void> {
  const backend = new MemoryBackend();
  const store = createIdempotencyStore(backend);
  let effects = 0;
  // Executor models: HTTP call dispatched -> provider ACCEPTED and committed
  // the side effect (effects++) -> response LOST (client timeout) -> throw.
  const executor = async () => {
    await sleep(10); // in-flight to provider
    effects += 1; // provider committed the charge
    throw new Error("ETIMEDOUT: response lost after provider accepted");
  };

  let firstOutcome = "resolved";
  try {
    await store.execute("p1_A3_lost_response", META, executor);
  } catch {
    firstOutcome = "rejected(ETIMEDOUT)";
  }
  // Client (or LLM) retries the same logical op with the same idempotency key.
  let retryOutcome = "resolved";
  try {
    await store.execute("p1_A3_lost_response", META, executor);
  } catch {
    retryOutcome = "rejected(ETIMEDOUT)";
  }

  record({
    id: "p1_A3_lost_response",
    title: "Lost response after commit: executor commits effect, then throws; retry with same key",
    expected_by_claim:
      "effects=1 (headline: 'retries never fire side effects twice'; 'Exactly-once execution')",
    observed: `effects=${effects}, first=${firstOutcome}, retry=${retryOutcome}`,
    side_effects: effects,
    verdict: effects === 1 ? "PASS" : "FAIL (SUT)",
    notes:
      "failures NOT cached by design; store has no delivery_uncertain state, so an " +
      "executor that committed at the provider and then threw is indistinguishable from a " +
      "pure failure. Retry re-dispatches -> second side effect. F2/A10 class.",
  });
}

// ---------------------------------------------------------------- A4
async function a4_crash_after_commit(): Promise<void> {
  const backend = new MemoryBackend(); // backend survives "crash" (persistent layer)
  const store1 = createIdempotencyStore(backend);
  let effects = 0;
  // Executor commits the effect, then the "process" dies before complete():
  // model as a never-settling executor; we abandon store1 entirely (crash).
  const executor1 = async (): Promise<never> => {
    await sleep(10);
    effects += 1; // provider committed the charge
    return new Promise<never>(() => {}); // process dies before store.complete()
  };

  store1.execute("p1_A4_crash_after_commit", META, executor1).catch(() => {});
  await sleep(60); // effect committed, row left 'pending', "process" gone

  // New process: fresh store, same persistent backend.
  const store2 = createIdempotencyStore(backend);
  const executor2 = async () => {
    effects += 1;
    return { charged: true, recovered: true, n: effects };
  };
  const retry = await store2.execute("p1_A4_crash_after_commit", META, executor2);

  record({
    id: "p1_A4_crash_after_commit",
    title: "Crash after commit: pending row left by dead process, new process takes over",
    expected_by_claim:
      "headline 'retries never fire side effects twice'; README sells re-run as 'crash recovery' without an uncertain-outcome state",
    observed: `effects=${effects}, retry=${JSON.stringify(retry)}`,
    side_effects: effects,
    verdict: effects === 1 ? "PASS" : "FAIL (SUT)",
    notes:
      "reset() overwrites pending unconditionally (memory.ts:60-71; postgres.ts:72-77) — " +
      "no liveness proof, no delivery_uncertain. Caller cannot distinguish 'recovered a " +
      "crash before effect' from 're-executed after effect'. At-least-once in the ambiguous window.",
  });
}

// ---------------------------------------------------------------- A5
async function a5_cross_instance_race(): Promise<void> {
  const backend = new MemoryBackend(); // shared "DB" (same contract as PostgresBackend)
  // Two independent stores = two instances/processes behind one persistent backend.
  const storeA = createIdempotencyStore(backend);
  const storeB = createIdempotencyStore(backend);

  const effects = { a: 0, b: 0 };
  const releaseA = { fn: () => {} };

  const executorA = async () => {
    effects.a += 1; // instance A commits its side effect
    await new Promise<void>((r) => (releaseA.fn = r)); // stays in flight (slow provider)
    return { charged: "A", n: effects.a };
  };
  const executorB = async () => {
    effects.b += 1; // instance B commits its side effect
    await sleep(5);
    return { charged: "B", n: effects.b };
  };

  const pa = storeA.execute("p1_A5_race_cross_instance", META, executorA);
  await sleep(20); // A wins claim, A's executor in flight at the provider
  const pb = storeB.execute("p1_A5_race_cross_instance", META, executorB);
  await sleep(30); // B loses claim -> check -> not completed -> reset(A's row) -> B runs
  releaseA.fn();
  const [ra, rb] = await Promise.allSettled([pa, pb]);

  record({
    id: "p1_A5_race_cross_instance",
    title: "Cross-instance concurrent race: two stores, one shared backend, winner mid-flight",
    expected_by_claim:
      "effects=1 (README: 'only one caller ever wins the claim'; 'exactly-once across restarts'; PostgresBackend is the shipped multi-instance answer)",
    observed: `effects A=${effects.a} B=${effects.b}; A=${settled(ra)}; B=${settled(rb)}`,
    side_effects: effects.a + effects.b,
    verdict: effects.a + effects.b === 1 ? "PASS" : "FAIL (SUT)",
    notes:
      "runOnce (store.ts:96-102): claim loser checks 'completed' only, then reset()s the " +
      "ALIVE winner's pending row unconditionally and re-runs its own executor. Layer-1 " +
      "map is per-process and cannot see the other instance. A10b twin (race of first calls).",
  });
}

function settled(r: PromiseSettledResult<unknown>): string {
  return r.status === "fulfilled" ? `ok:${JSON.stringify(r.value)}` : `err:${String(r.reason)}`;
}

// ---------------------------------------------------------------- A6
async function a6_key_collision_different_payload(): Promise<void> {
  const backend = new MemoryBackend();
  const store = createIdempotencyStore(backend);
  let effects = 0;
  const executor = async () => {
    effects += 1;
    return { chargedFor: "order-123", cents: 4999 };
  };

  const meta1: ExecuteMeta = { toolName: "charge", request: { orderId: "order-123" } };
  const meta2: ExecuteMeta = { toolName: "charge", request: { orderId: "order-999" } }; // different payload!

  const r1 = await store.execute("p1_A6_key_collision", meta1, executor);
  const r2 = await store.execute("p1_A6_key_collision", meta2, executor); // same key, different request

  record({
    id: "p1_A6_key_collision",
    title: "Same key, different request payload (key collision semantics)",
    expected_by_claim:
      "OBSERVED probe — README stores request meta but never compares it; Stripe-class APIs reject mismatches",
    observed: `effects=${effects}, r1=${JSON.stringify(r1)}, r2=${JSON.stringify(r2)} (replayed order-123 response for an order-999 request)`,
    side_effects: effects,
    verdict: "OBSERVED",
    notes:
      "claim() persists meta.request (store.ts:89-93) but no code path ever compares it. " +
      "A buggy agent reusing a key across different orders silently gets the first order's " +
      "result. Not a double-charge; a wrong-result hazard. Hardening suggestion, not headline.",
  });
}

// ---------------------------------------------------------------- A7
async function a7_ttl_expiry_reexecute(): Promise<void> {
  const backend = new MemoryBackend();
  const store = createIdempotencyStore(backend, { ttlMs: 50 });
  let effects = 0;
  const executor = async () => {
    effects += 1;
    await sleep(2);
    return { charged: true, n: effects };
  };

  await store.execute("p1_A7_ttl_expiry", META, executor);
  await sleep(90); // past TTL
  await store.execute("p1_A7_ttl_expiry", META, executor);

  record({
    id: "p1_A7_ttl_expiry",
    title: "Re-execute after TTL expiry (ttlMs=50)",
    expected_by_claim: "OBSERVED probe — documented scope: replay window = TTL (default 24h)",
    observed: `effects=${effects}`,
    side_effects: effects,
    verdict: "OBSERVED",
    notes:
      "'Exactly-once' is TTL-scoped by design (options.ttlMs, DEFAULT_TTL_MS 24h). " +
      "Documented and coherent; recorded to bound the claim's coverage.",
  });
}

// ---------------------------------------------------------------- main
async function main(): Promise<void> {
  console.log("Argus pack1 — Target 1: tripl3tr3s/mcp-tool-idempotency @ 4d665ae");
  console.log("node", process.version, "\n");

  await a1_sequential_replay();
  await a2_same_process_concurrent();
  await a3_lost_response_after_commit();
  await a4_crash_after_commit();
  await a5_cross_instance_race();
  await a6_key_collision_different_payload();
  await a7_ttl_expiry_reexecute();

  const fails = results.filter((r) => r.verdict.startsWith("FAIL")).length;
  console.log(`\nSUMMARY: ${results.length} scenarios, ${fails} FAIL(SUT)`);
  console.log(JSON.stringify(results, null, 2));

  await import("node:fs").then((fs) =>
    fs.promises.writeFile(
      "/home/z/my-project/tool-results/pack1-t1-results.json",
      JSON.stringify(
        {
          target: "tripl3tr3s/mcp-tool-idempotency",
          head: "4d665aed9c68d78be6f16ee22b7e2feae21a4f7b",
          run_at: new Date().toISOString(),
          runtime: `node ${process.version}`,
          harness: "/home/z/my-project/scripts/pack1-t1-harness.ts",
          results,
        },
        null,
        2
      )
    )
  );
}

void main();
