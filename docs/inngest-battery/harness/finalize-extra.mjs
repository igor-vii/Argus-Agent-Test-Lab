// ═══════════════════════════════════════════════════════════════════════════════
// finalize-extra.mjs — addendum probes + verdict refinement for the I5 battery.
// REBUILT VERBATIM after environment rollback (see worklog Task 41).
//   p4c: sequential duplicate event id (SAME id as p4b race, NEW orderId)
//        -> expect: 0 runs, 0 charges (24h event-id dedup per their docs)
//   p4d: fresh event id, new orderId -> expect: 1 run, 1 charge (control)
// Then: p3 verdict refinement (warn-and-rerun via AUTOMATIC_PARALLEL_INDEXING,
// source-pinned) + doc anchors; writes addendum into the results JSON.
// ═══════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";

const APP = "http://127.0.0.1:3010";
const HERE = "/home/z/my-project/refs/inngest/battery/devserver";
const JOURNAL = `${HERE}/journal.jsonl`;
const CHARGES = `${HERE}/charges.json`;
const OUT = "/home/z/my-project/tool-results/inngest-i5-results.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chargesFor = (o) => JSON.parse(fs.readFileSync(CHARGES, "utf8")).charges.filter((c) => c.orderId === o);
const bodyEnters = (o) =>
  fs
    .readFileSync(JOURNAL, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((e) => e.kind === "fn-body-enter" && e.orderId === o).length;

async function send(id, data) {
  const r = await fetch(`${APP}/lab/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "lab/i5", data, id }),
  });
  return r.json();
}

// p4c: duplicate of the p4b race id, sequential, different payload
const r4c = await send("i5-race-dedup-1", { probe: "p4c-dedup-seq", orderId: "p4c" });
await sleep(9000);
const p4c = { id: "p4c-dedup-seq", mode: "sequential send reusing p4b's event id, NEW payload", expected: "0 runs, 0 charges (24h id dedup)", charges: chargesFor("p4c").length, bodyEnters: bodyEnters("p4c"), sendResp: r4c };
console.log("p4c:", JSON.stringify({ charges: p4c.charges, bodyEnters: p4c.bodyEnters }));
p4c.verdict = p4c.charges === 0 && p4c.bodyEnters === 0 ? "PASS (id-dedup suppresses run; payload ignored)" : "FINDING (dedup did not suppress)";

// p4d: fresh id control
const r4d = await send("i5-race-fresh-id", { probe: "p4d-fresh-id", orderId: "p4d" });
await sleep(9000);
const p4d = { id: "p4d-fresh-id", mode: "fresh event id after the race (control)", expected: "1 run, 1 charge", charges: chargesFor("p4d").length, bodyEnters: bodyEnters("p4d"), sendResp: r4d };
console.log("p4d:", JSON.stringify({ charges: p4d.charges, bodyEnters: p4d.bodyEnters }));
p4d.verdict = p4d.charges === 1 ? "PASS (suppression keyed by event id, not a global throttle)" : "UNEXPECTED";

// p3 refinement, source-pinned
const p3Refinement = {
  verdict_refined: "OBSERVED (warn-and-rerun, not silent wrong-result, not a guard)",
  mechanics: [
    "SDK engine.js resolveStepIdCollision(): userland step ID collision -> auto-indexed to a NEW internal step id (own memo slot) -> second handler EXECUTED and memoized separately (observed: b={for:B}, handlerBRan=true)",
    "Conflict signal EXISTS at WARN level: 'Duplicate step ID \"op\" detected across parallel chains' { code: AUTOMATIC_PARALLEL_INDEXING, explanation: '...Your function is still running.', action: 'Use a unique ID for each step, especially those in parallel.' } (app.log)",
    "@inngest/test (static h1 phase) DIVERGES from runtime: injected memo keyed by userland ID returns the FIRST/stale result with 0 new executions and no warning; additionally TestEngine natural execution agrees with runtime on results but does NOT surface the AUTOMATIC_PARALLEL_INDEXING warning -> emulation fidelity gap in the vendor's own test tool",
  ],
  doc_boundary: {
    js_docs: "primitives page documents only 'Keep step IDs stable'; resolveStepIdCollision/AUTOMATIC_PARALLEL_INDEXING behavior is NOT documented for JS",
    py_docs: "Python SDK reference documents counter-keying explicitly for the experimental step decorator ('The SDK adds a counter to each repeat, so every call is its own memoized step')",
    reachability: "wrong-result via same-ID memo requires payload drift between attempts; events are immutable within a run, so the reachable hazard is deploy drift only (covered by their 'Keep step IDs stable' versioning guidance)",
  },
  source_refs: [
    "node_modules/inngest/components/execution/engine.js:1319 maybeWarnOfParallelIndexing()",
    "node_modules/inngest/components/execution/engine.js:1666 applyMiddlewareToStep() -> resolveStepIdCollision({baseId, expectedIndexes, stepsMap})",
  ],
};

// doc anchors: their idempotency page prescribes our exact methodology
const doc_anchors = {
  prescribed_methodology: "their idempotency page 'Verify the behavior' section literally prescribes: 'Send the same event ID twice in a test environment and inspect the event history and function runs' (= our p4b/p4c) and 'Test an external call that succeeds just before the step reports a failure' (= our p1-i2-dyn)",
  a3_window: "docs idempotency: 'A request can succeed before Inngest records the step result. A retry can then call the API again. Event and function deduplication do not remove that risk.' (= p1/p2 observed verbatim)",
  event_dedup_window: "event id = idempotency key over a 24h period; duplicates are stored in event history but trigger nothing (= p4b/p4c observed)",
  primitives_boundary: "primitives page: 'Keep step IDs stable' + 'If a provider accepts a request but its response is lost, the step can retry the action. Use an idempotency key for writes, payments...' (= A3 guidance)",
};

// p4b interpretation note
const p4b_note = "12 sends returned 12 DISTINCT storage ids while only 1 run started: dev server stores every event (duplicates visible in event history, per their docs) but suppresses triggering by the provided id. 'distinctEventIdsAccepted' in the main results counts storage ids, not dedup keys.";

// patch results JSON
const results = JSON.parse(fs.readFileSync(OUT, "utf8"));
results.addendum = {
  date: new Date().toISOString(),
  p3_refinement: p3Refinement,
  extra_probes: [p4c, p4d],
  doc_anchors,
  p4b_interpretation: p4b_note,
  retry_backoff_note: "dev server default retry backoff observed ~24.5s for attempt 1->2 (p1 timeline)",
};
fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log("\naddendum written ->", OUT);
console.log("\nFINAL VERDICT LINE:");
for (const p of [...results.probes, p4c, p4d]) console.log(`  ${p.id.padEnd(22)} charges=${String(p.charges).padEnd(3)} -> ${(p.verdict_refined ?? p.verdict ?? "").slice(0, 90)}`);
