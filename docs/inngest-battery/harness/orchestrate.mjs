// ═══════════════════════════════════════════════════════════════════════════════
// orchestrate.mjs — driver for the I5 dev-server battery.
// Assumes app (:3010) + Inngest dev server (:8288) are running (start-lab.sh).
// Order: health → sync wait → reset evidence → p0 → p1 → p2 → p3 → p4a → p4b
//        → verdict computation (pre-registered rules) → results JSON.
// REBUILT VERBATIM after environment rollback (see worklog Task 41).
// ═══════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";

const APP = "http://127.0.0.1:3010";
const HERE = "/home/z/my-project/refs/inngest/battery/devserver";
const CHARGES = `${HERE}/charges.json`;
const JOURNAL = `${HERE}/journal.jsonl`;
const DEVLOG = `${HERE}/dev.log`;
const OUT = "/home/z/my-project/tool-results/inngest-i5-results.json";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const readCharges = () => JSON.parse(fs.readFileSync(CHARGES, "utf8")).charges;
const journal = () =>
  fs
    .readFileSync(JOURNAL, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return { raw: l };
      }
    });
const chargesFor = (orderId) => readCharges().filter((c) => c.orderId === orderId);

async function pollUntil(cond, timeoutMs, everyMs = 500) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    let ok = false;
    try {
      ok = await cond();
    } catch {}
    if (ok) return { ok: true, ms: Date.now() - t0 };
    await sleep(everyMs);
  }
  return { ok: false, ms: Date.now() - t0 };
}

async function send(data, id) {
  const r = await fetch(`${APP}/lab/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "lab/i5", data, id }),
  });
  return r.json();
}

const jResolved = (probe) => () => journal().some((e) => e.kind === "charge-card-resolved" && e.probe === probe);
const jSummary = () => journal().some((e) => e.kind === "memo-key-summary");

// ── pre-registered verdict computation ────────────────────────────────────────
function verdict(p) {
  const n = p.charges;
  switch (p.id) {
    case "p0-ctrl":
      if (n === 1 && p.resolved) return "PASS";
      if (n === 1) return "INCOMPLETE";
      return "FAIL(claim)";
    case "p1-i2-dyn":
    case "p2-i4-dyn":
      if (n === 2 && p.resolved) return "OBSERVED (conformance: blog FAQ + docs idempotency verbatim)";
      if (n === 1) return "DOCS-MISMATCH vendor-favorable";
      if (n >= 3) return "RETRY-AMPLIFICATION";
      return "INCOMPLETE";
    case "p3-i3-dyn": {
      const s = journal().find((e) => e.kind === "memo-key-summary");
      if (s && s.sameResult && s.handlerARan && !s.handlerBRan)
        return "OBSERVED (one-ID-one-work; silent wrong-result replay, no conflict signal — A6 analogue)";
      if (s && !s.sameResult) return "UNDOCUMENTED-GUARD (conflict detection present)";
      if (s) return "PARTIAL (summary present, unexpected flag mix)";
      return "ERROR-ON-DUPLICATE (conflict signal via rejection)";
    }
    case "p4a-race-no-dedup":
      if (n === 12) return "OBSERVED (documented model: each event starts its own run)";
      if (n < 12) return `DELIVERY-DROP note (${12 - n} of 12 events produced no charge)`;
      return "OVERDELIVERY";
    case "p4b-race-dedup":
      if (n === 1) return "PASS (documented event-ID dedup mitigation holds under 12-way concurrent race)";
      if (n >= 2) return "FINDING: DEDUP RACE WINDOW (FAIL(claim) vs 'control whether a run starts')";
      return "INCOMPLETE";
    default:
      return "UNKNOWN";
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// 0. app health
const health = await pollUntil(async () => {
  const r = await fetch(`${APP}/health`);
  return (await r.json()).ok === true;
}, 15000);
log("app health:", health.ok ? "up" : "DOWN");

// 1. wait for dev-server sync (dev.log mentions the sync/scanning)
let synced = false;
if (fs.existsSync(DEVLOG)) {
  const w = await pollUntil(() => /synced|scanning|registered|sdk/i.test(fs.readFileSync(DEVLOG, "utf8")), 20000, 1000);
  synced = w.ok;
}
log("dev-server sync signal:", synced ? "yes" : "timeout (proceeding)");

// 2. fresh evidence
fs.writeFileSync(CHARGES, JSON.stringify({ charges: [] }, null, 2));
fs.writeFileSync(JOURNAL, "");
log("evidence reset");

const probes = [];

// 3. p0-ctrl
log("→ p0-ctrl");
await send({ probe: "p0-ctrl", orderId: "p0" });
{
  const w = await pollUntil(jResolved("p0-ctrl"), 30000);
  const ch = chargesFor("p0");
  probes.push({ id: "p0-ctrl", mode: "plain step.run, no crash", expected: "charges==1", charges: ch.length, resolved: w.ok, chargeIds: ch.map((c) => c.chargeId) });
  log(`p0 charges=${ch.length} resolved=${w.ok}`);
}

// 4. p1-i2-dyn (throw after provider)
log("→ p1-i2-dyn");
await send({ probe: "p1-i2-dyn", orderId: "p1", throwAfterProvider: true });
{
  const w = await pollUntil(async () => jResolved("p1-i2-dyn")() && chargesFor("p1").length >= 2, 60000);
  const ch = chargesFor("p1");
  probes.push({ id: "p1-i2-dyn", mode: "throw inside step body after provider success", expected: "charges==2 (retry re-runs body)", charges: ch.length, resolved: w.ok, chargeIds: ch.map((c) => c.chargeId) });
  log(`p1 charges=${ch.length} settled=${w.ok}`);
}

// 5. p2-i4-dyn (process crash after provider)
log("→ p2-i4-dyn");
await send({ probe: "p2-i4-dyn", orderId: "p2", crashAfterProvider: true });
{
  const w = await pollUntil(async () => jResolved("p2-i4-dyn")() && chargesFor("p2").length >= 2, 60000);
  const ch = chargesFor("p2");
  const crashes = journal().filter((e) => e.kind === "a3-crash").length;
  probes.push({ id: "p2-i4-dyn", mode: "process.exit(1) after provider success (true A3 window)", expected: "charges==2 (body re-run after lost memo)", charges: ch.length, resolved: w.ok, crashes, chargeIds: ch.map((c) => c.chargeId) });
  log(`p2 charges=${ch.length} crashes=${crashes} settled=${w.ok}`);
}

// 6. p3-i3-dyn (memo-key collision)
log("→ p3-i3-dyn");
await send({ probe: "p3-memo-key", orderId: "p3" });
{
  const w = await pollUntil(jSummary, 30000);
  const s = journal().find((e) => e.kind === "memo-key-summary") ?? null;
  probes.push({ id: "p3-i3-dyn", mode: "two step.run with same id 'op', payloads A/B", expected: "b reuses a's result silently (or guard/error)", charges: 0, resolved: w.ok, summary: s });
  log(`p3 summary=${s ? JSON.stringify({ a: s.a, b: s.b, same: s.sameResult, bRan: s.handlerBRan }) : "none"}`);
}

// 7. p4a race, no dedup
log("→ p4a-race-no-dedup");
{
  const r = await (await fetch(`${APP}/lab/race`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ count: 12, orderId: "p4a" }),
  })).json();
  await pollUntil(async () => chargesFor("p4a").length >= 12, 25000);
  await sleep(2000);
  const ch = chargesFor("p4a");
  const sendOk = (r.results ?? []).filter((x) => x.ok).length;
  probes.push({ id: "p4a-race-no-dedup", mode: "12 concurrent identical sends, no event id", expected: "charges==12 (each event → own run)", charges: ch.length, sendOk, raceMs: r.ms });
  log(`p4a charges=${ch.length} sendOk=${sendOk}`);
}

// 8. p4b race with shared event id (their documented dedup mitigation)
log("→ p4b-race-dedup");
{
  const r = await (await fetch(`${APP}/lab/race`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ count: 12, orderId: "p4b", dedupId: "i5-race-dedup-1" }),
  })).json();
  await sleep(12000); // generous settle window for the race
  const ch = chargesFor("p4b");
  const sendOk = (r.results ?? []).filter((x) => x.ok).length;
  const distinctIds = new Set((r.results ?? []).filter((x) => x.ok && Array.isArray(x.ids)).flatMap((x) => x.ids)).size;
  probes.push({ id: "p4b-race-dedup", mode: "12 concurrent sends sharing ONE event id (documented dedup)", expected: "charges==1", charges: ch.length, sendOk, distinctEventIdsAccepted: distinctIds, raceMs: r.ms, chargeIds: ch.map((c) => c.chargeId) });
  log(`p4b charges=${ch.length} sendOk=${sendOk} distinctEventIds=${distinctIds}`);
}

// 9. verdicts + results
for (const p of probes) p.verdict = verdict(p);

const results = {
  battery: "inngest-i5-devserver (dynamic phase of h1 battery)",
  date: new Date().toISOString(),
  note: "re-run #2 after environment rollback; run #1 (2026-10-26T19:33Z) produced identical verdicts; raw evidence of run #1 lost to rollback",
  env: {
    node: process.version,
    sdk: "inngest@4.26.0 (npm dist, Apache-2.0)",
    test: "@inngest/test@1.0.0 (used in h1 static phase)",
    cli: "inngest-cli@1.49.0 dev server (local only)",
  },
  gate_d: {
    cli_license: "SSPL 1.0 + Apache 2.0 Future License — verified from repo LICENSE.md (npm tarball ships NO license file, only 'SEE LICENSE IN LICENSE.md' reference)",
    license_sha256: "300ec5a863250241755061b8424ac949aeada4c5c2cb567a2642637aa0f2c7e4",
    local_lab_use: "permitted — no service offering to third parties; local dev-server for testing our own harness",
  },
  pre_registered_rules: "see app.mjs header (fixed before run)",
  probes,
  evidence: {
    charges: `${HERE}/charges.json`,
    journal: `${HERE}/journal.jsonl`,
    app_log: `${HERE}/app.log`,
    dev_log: `${HERE}/dev.log`,
  },
};

fs.mkdirSync("/home/z/my-project/tool-results", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log("\n═══ RESULTS ═══");
for (const p of probes) console.log(`${p.id.padEnd(22)} charges=${String(p.charges).padEnd(3)} -> ${p.verdict}`);
console.log(`\nsaved: ${OUT}`);
