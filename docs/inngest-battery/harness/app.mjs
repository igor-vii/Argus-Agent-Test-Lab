// ═══════════════════════════════════════════════════════════════════════════════
// I5 dev-server battery — inngest@4.26.0 (npm dist) + inngest-cli@1.49.0 dev server
// PRE-REGISTERED probes and verdict rules — fixed BEFORE the run (2026-10-27).
// REBUILT VERBATIM after environment rollback (2026-10-27, see worklog Task 41);
// re-run serves as independent reproduction of the recorded battery.
//
// Probes (all charge side effects go through a crash-safe on-disk "provider"):
//   p0-ctrl     I1-dyn baseline memo integrity. Plain step.run("charge-card").
//               Rule: charges(orderId)==1 && run completes -> PASS
//               charges>1 -> FAIL(claim).
//   p1-i2-dyn   Commit-then-throw: provider succeeds (orderNo==1), THEN the step
//               body throws (memo NOT written). Runtime retry re-runs the body.
//               Rule: charges==2 && run completes -> OBSERVED (conformance to
//                     blog FAQ + docs idempotency verbatim)
//               charges==1 -> DOCS-MISMATCH vendor-favorable
//               charges>=3 -> RETRY-AMPLIFICATION
//   p2-i4-dyn   TRUE A3 window / lost memo: provider succeeds (orderNo==1), then
//               process.exit(1) BEFORE step.run returns — no memo, no error signal.
//               Rule: same as p1.
//   p3-i3-dyn   Memo-key collision on the REAL runtime: two step.run calls with
//               the SAME step id "op", different payloads ({for:"A"}, {for:"B"}).
//               Rule: b=={for:"A"} && handlerB never invoked -> OBSERVED (silent)
//               b=={for:"B"} -> UNDOCUMENTED-GUARD (conflict detection present)
//               run fails / no summary -> ERROR-ON-DUPLICATE
//   p4-i5-race  Duplicate-run race. 12 concurrent identical sends:
//     p4a (no event id): Rule: charges==12 -> OBSERVED. <12 -> DELIVERY-DROP.
//     p4b (same event id on all 12): Rule: charges==1 -> PASS; >=2 -> FINDING.
//
// Evidence: charges.json, journal.jsonl, app.log, dev.log.
// ═══════════════════════════════════════════════════════════════════════════════

import express from "express";
import { Inngest } from "inngest";
import { serve } from "inngest/express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHARGES = path.join(HERE, "charges.json");
const JOURNAL = path.join(HERE, "journal.jsonl");
const SELF = process.env.SELF_URL ?? "http://127.0.0.1:3010";

const jlog = (obj) =>
  fs.appendFileSync(JOURNAL, JSON.stringify({ at: new Date().toISOString(), pid: process.pid, ...obj }) + "\n");

if (!fs.existsSync(CHARGES)) fs.writeFileSync(CHARGES, JSON.stringify({ charges: [] }, null, 2));

// ── external "payment provider": crash-safe, counts globally + per orderId ──
function chargeProvider(orderId) {
  const db = JSON.parse(fs.readFileSync(CHARGES, "utf8"));
  const chargeNo = db.charges.length + 1;
  const orderNo = db.charges.filter((c) => c.orderId === orderId).length + 1;
  const charge = {
    chargeNo,
    orderId,
    orderNo,
    chargeId: `ch_${String(chargeNo).padStart(3, "0")}_${orderId}`,
    at: new Date().toISOString(),
    pid: process.pid,
  };
  db.charges.push(charge);
  fs.writeFileSync(CHARGES, JSON.stringify(db, null, 2));
  return charge;
}

const inngest = new Inngest({ id: "i5-lab" });

const fn = inngest.createFunction(
  { id: "i5-battery", retries: 3, triggers: { event: "lab/i5" } },
  async ({ event, step, runId, attempt }) => {
    const d = event.data ?? {};
    const { probe, orderId } = d;
    jlog({ kind: "fn-body-enter", probe, orderId, runId, attempt });

    if (probe === "p3-memo-key") {
      let aRan = 0;
      let bRan = 0;
      const a = await step.run("op", async () => {
        aRan++;
        return { for: "A" };
      });
      const b = await step.run("op", async () => {
        bRan++;
        return { for: "B" };
      });
      const summary = {
        kind: "memo-key-summary",
        probe,
        a,
        b,
        sameResult: JSON.stringify(a) === JSON.stringify(b),
        handlerARan: aRan === 1,
        handlerBRan: bRan === 1,
        runId,
      };
      jlog(summary);
      await step.run("collect", async () => summary);
      return { probe, done: true };
    }

    const res = await step.run("charge-card", async () => {
      const r = await fetch(`${SELF}/provider/charge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const charge = await r.json();
      jlog({
        kind: "provider-charged",
        probe,
        orderId,
        chargeNo: charge.chargeNo,
        orderNo: charge.orderNo,
        chargeId: charge.chargeId,
      });

      if (d.throwAfterProvider && charge.orderNo === 1) {
        jlog({ kind: "injected-throw", probe, note: "provider succeeded; throwing inside step body (memo NOT written)" });
        throw new Error(`injected: gateway timeout after provider success (orderNo=${charge.orderNo})`);
      }
      if (d.crashAfterProvider && charge.orderNo === 1) {
        jlog({ kind: "a3-crash", probe, note: "provider succeeded; process.exit BEFORE step.run returns (no memo, no error signal)" });
        process.exit(1);
      }
      return charge;
    });
    jlog({ kind: "charge-card-resolved", probe, orderId, result: res });
    return { probe, done: true };
  }
);

const app = express();
app.use(express.json());

app.all("/api/inngest", serve({ client: inngest, functions: [fn] }));

app.post("/provider/charge", (req, res) => {
  const charge = chargeProvider(String(req.body?.orderId ?? "unknown"));
  res.json(charge);
});

// Send one event via the SDK (INNGEST_DEV=1 → local dev server). `id` = event dedup id.
app.post("/lab/send", async (req, res) => {
  try {
    const { id, name, data } = req.body ?? {};
    const payload = { name: name ?? "lab/i5", data: data ?? {} };
    if (id) payload.id = id;
    const r = await inngest.send(payload);
    const ids = Array.isArray(r) ? r : (r?.ids ?? null);
    res.json({ ok: true, ids });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e).slice(0, 300) });
  }
});

// Fire N concurrent identical sends; optional dedupId → every send uses the SAME event id.
app.post("/lab/race", async (req, res) => {
  const { count = 12, dedupId = null, orderId = "race" } = req.body ?? {};
  const t0 = Date.now();
  const jobs = Array.from({ length: count }, (_, i) =>
    inngest
      .send({
        ...(dedupId ? { id: dedupId } : {}),
        name: "lab/i5",
        data: { probe: "p4-i5-race", orderId, seq: i },
      })
      .then((r) => {
        const ids = Array.isArray(r) ? r : (r?.ids ?? null);
        return { ok: true, ids };
      })
      .catch((e) => ({ ok: false, error: String(e).slice(0, 200) }))
  );
  const results = await Promise.all(jobs);
  res.json({ ok: true, count, dedupId, ms: Date.now() - t0, results });
});

app.get("/health", (_q, res) => res.json({ ok: true, pid: process.pid }));

const PORT = Number(process.env.PORT ?? 3010);
app.listen(PORT, "127.0.0.1", () => console.log(`[app] listening on 127.0.0.1:${PORT}`));
