/**
 * testengine-repro.mjs — minimal verification for the @inngest/test issue draft.
 * Question: does TestEngine's NATURAL execution (no memo injection) match the
 * production runtime on duplicate userland step IDs?
 *   Production runtime (inngest@4.26.0, dev server probe p3, 2026-10-27):
 *     sequential step.run("op") x2 -> BOTH handlers execute, second result
 *     {for:"B"} returned, WARN emitted: "Duplicate step ID" /
 *     AUTOMATIC_PARALLEL_INDEXING, repeats auto-indexed into own memo slots
 *     (engine.js resolveStepIdCollision).
 * Scenarios:
 *   S1 sequential same-ID x2 (natural)
 *   S2 parallel same-ID x2 (natural; h1_I3b previously resolved {A},{B})
 *   S3 MockedStep injection keyed by userland id (does it bypass auto-indexing?)
 * Console.warn/error are intercepted to capture AUTOMATIC_PARALLEL_INDEXING.
 */
import { Inngest } from "inngest";
import { InngestTestEngine } from "@inngest/test";

const warnings = [];
const origWarn = console.warn;
const origErr = console.error;
console.warn = (...a) => { warnings.push("warn: " + a.map(String).join(" ").slice(0, 300)); };
console.error = (...a) => { warnings.push("err: " + a.map(String).join(" ").slice(0, 300)); };

const inngest = new Inngest({ id: "repro-lab" });
const ctxIdentity = (c) => c;

function section(title) {
  console.warn = origWarn; // let section headers through to stdout
  origWarn(`\n=== ${title} ===`);
  warnings.length = 0;
  console.warn = (...a) => { warnings.push("warn: " + a.map(String).join(" ").slice(0, 300)); };
}

// S1 — sequential duplicate step ID, natural execution
{
  section("S1 sequential same-ID x2 (natural, no injection)");
  let aRan = 0, bRan = 0;
  const fn = inngest.createFunction({ id: "s1", retries: 3, triggers: { event: "lab/s1" } },
    async ({ step }) => {
      const a = await step.run("op", async () => { aRan++; return { for: "A" }; });
      const b = await step.run("op", async () => { bRan++; return { for: "B" }; });
      return { a, b };
    });
  let r;
  try { r = await new InngestTestEngine({ function: fn }).execute({ transformCtx: ctxIdentity }); }
  catch (e) { r = { error: String(e?.message || e) }; }
  origWarn(`result: ${JSON.stringify(r.error ?? r.result)}`);
  origWarn(`execute() top-level keys: ${Object.keys(r).join(", ")}`);
  origWarn(`handlerA ran: ${aRan === 1}; handlerB ran: ${bRan === 1}`);
  origWarn(`warnings captured: ${warnings.length ? warnings.join(" | ") : "(none)"}`);
}

// S2 — parallel duplicate step ID, natural execution
{
  section("S2 parallel same-ID x2 (natural, no injection)");
  let aRan = 0, bRan = 0;
  const fn = inngest.createFunction({ id: "s2", retries: 3, triggers: { event: "lab/s2" } },
    async ({ step }) => {
      const [a, b] = await Promise.all([
        step.run("op", async () => { aRan++; return { which: "A" }; }),
        step.run("op", async () => { bRan++; return { which: "B" }; }),
      ]);
      return { a, b };
    });
  let r;
  try { r = await new InngestTestEngine({ function: fn }).execute({ transformCtx: ctxIdentity }); }
  catch (e) { r = { error: String(e?.message || e) }; }
  origWarn(`result: ${JSON.stringify(r.error ?? r.result)}`);
  origWarn(`handlerA ran: ${aRan === 1}; handlerB ran: ${bRan === 1}`);
  origWarn(`warnings captured: ${warnings.length ? warnings.join(" | ") : "(none)"}`);
}

// S3 — MockedStep injection keyed by userland id
{
  section("S3 injection: engine.steps [{id:'op'}] vs auto-indexed runtime keys");
  let bRan = 0;
  const fn = inngest.createFunction({ id: "s3", retries: 3, triggers: { event: "lab/s3" } },
    async ({ step }) => step.run("op", async () => { bRan++; return { for: "B-fresh-execution" }; }));
  let r;
  try {
    r = await new InngestTestEngine({ function: fn })
      .execute({ transformCtx: ctxIdentity, steps: [{ id: "op", handler: () => ({ for: "INJECTED-STALE" }) }] });
  } catch (e) { r = { error: String(e?.message || e) }; }
  origWarn(`result: ${JSON.stringify(r.error ?? r.result)}`);
  origWarn(`handlerB ran: ${bRan === 1}`);
  origWarn(`warnings captured: ${warnings.length ? warnings.join(" | ") : "(none)"}`);
}

console.warn = origWarn;
console.error = origErr;
origWarn("\n(done)");
