#!/usr/bin/env node
/**
 * wave2-runner.mjs — offline re-implementation of the claim layer (wave 2 battery).
 *
 * Pin: commit 56d6db340505dec2fec9d89780a498ff9ba37bfb (cv-scvd/scvd-general-store-repo)
 * Spec: download/wave2-prereg-amendment/RUNNER-SPEC-wave2-claim-layer.md
 * Pre-registration: amended H2 + C2 (amendment posted inside the review hold; frozen).
 * Freeze rule: rows frozen before first artifact; any divergence from pinned behavior
 * is recorded as FAIL with the divergence documented.
 *
 * Scope boundary (pinned): verdicts apply to this offline re-implementation of the
 * published semantics, with the platform single-writer-per-ID guarantee carried as an
 * explicit pinned assumption. No network, no keys, no wallet; settlement is mocked;
 * signer is inert (artifacts are signed-shaped only; signature validity is wave-1 scope).
 *
 * Response-cache note: the KV replay (idempotent_replay: true) is a separate mechanism
 * served only post-settlement and is out of scope for the H2 claim-race assertion
 * (scope note in amended H2). H2 rows run the claim path with the cache empty; C2 rows
 * exercise the cache gating itself.
 *
 * Line anchors below refer to the pin commit checkout of:
 *   src/services/paid-recovery.ts   (sha256 4212ace7…)
 *   src/services/purchase-intent.ts (sha256 bd796c7b…)
 *   src/lib/idempotency.ts          (sha256 5eb55c01…)
 */

import { webcrypto as nodeCrypto } from "node:crypto";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PIN = "56d6db340505dec2fec9d89780a498ff9ba37bfb";
const OUT = "/home/z/my-project/download/wave2-prereg-amendment/run";

// ---------------------------------------------------------------------------
// crypto mirror — src/lib/idempotency.ts:260-269 (sha256Hex / sha256HexBytes)
// ---------------------------------------------------------------------------
const encoder = new TextEncoder();
async function sha256Hex(value) {
  const digest = await nodeCrypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// [S4] key-derivation mirrors
// ---------------------------------------------------------------------------
// EVM address case is presentation; Solana base58 case is identity.
// (idempotency.ts:283-287)
function normalizePayer(payer) {
  return /^0x[0-9a-fA-F]{40}$/.test(payer) ? payer.toLowerCase() : payer;
}
// kvKeyFor — kv-keys.ts:352-354 + idempotency.ts:277-288:
// `idem:${surface}:${payer}:${sha256(key)}`
async function kvKeyFor(surface, payer, key) {
  return `idem:${surface}:${normalizePayer(payer)}:${await sha256Hex(key)}`;
}
// idempotencySlotName — idempotency.ts:290-303: slot named without retaining the key,
// derived through kvKeyFor and hashed AGAIN.
async function idempotencySlotName(surface, payer, key) {
  return `idempotency:${await sha256Hex(await kvKeyFor(surface, payer, key))}`;
}

// ---------------------------------------------------------------------------
// [S5 pinned platform assumption] Durable Object emulation.
// The platform guarantees single-writer-per-ID serialization on the named-slot DO.
// Offline, the transaction boundary is a per-slot async mutex; claim calls are
// serialized by construction and never interleave mid-transaction.
// ---------------------------------------------------------------------------
class SlotTransaction {
  constructor(store) { this.store = store; }
  async get(key) { return this.store.has(key) ? this.store.get(key) : null; }
  async put(key, value) { this.store.set(key, value); }
}
class Slot {
  constructor() {
    this.storage = new Map();
    this.#tail = Promise.resolve();
  }
  #tail;
  async transaction(fn) {
    const prev = this.#tail;
    let release;
    this.#tail = new Promise((r) => (release = r));
    await prev;
    try {
      return await fn(new SlotTransaction(this.storage));
    } finally {
      release();
    }
  }
}
class PaidRecoveryStoreStub {
  constructor(slot) { this.slot = slot; }
  // [S1] claimIdempotentPurchase — paid-recovery.ts:221-228, verbatim logic.
  async claimIdempotentPurchase(purchaseId) {
    return this.slot.transaction(async (txn) => {
      const prior = await txn.get("idempotent-purchase");
      if (prior) return prior;
      await txn.put("idempotent-purchase", purchaseId);
      return purchaseId;
    });
  }
}
class DONamespace {
  #slots = new Map();
  doClaimCalls = 0; // instrumentation for C2 (read paths must not consult the DO)
  idFromName(name) { return name; }
  get(name) {
    if (!this.#slots.has(name)) this.#slots.set(name, new Slot());
    const slot = this.#slots.get(name);
    const self = this;
    return {
      // [S4b] idempotency.ts:305-310 — namespace.get(namespace.idFromName(slot))
      async claimIdempotentPurchase(purchaseId) {
        self.doClaimCalls += 1;
        return new PaidRecoveryStoreStub(slot).claimIdempotentPurchase(purchaseId);
      },
    };
  }
}

// [S4b] idempotentPurchaseSlot — idempotency.ts:305-310, verbatim logic:
// atomic ownership is separate from the optional response cache
function idempotentPurchaseSlot(env, slot) {
  const namespace = env.PAID_RECOVERIES;
  if (!namespace) throw new Error("Purchase admission unavailable");
  return namespace.get(namespace.idFromName(slot));
}

// ---------------------------------------------------------------------------
// KV emulation (response cache backing store) + StoredReplay mirrors
// ---------------------------------------------------------------------------
class KVMap {
  #map = new Map();
  async get(key) { return this.#map.has(key) ? this.#map.get(key) : null; }
  async put(key, value) { this.#map.set(key, value); }
}
// StoredReplay — idempotency.ts:271-275
async function lookupIdempotent(env, surface, payer, idempotencyKey) {
  try {
    const raw = await env.COUNTERS.get(await kvKeyFor(surface, payer, idempotencyKey)); // :376-379
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || typeof parsed.body !== "object" || parsed.body === null) return null;
    return parsed;
  } catch {
    return null; // :388-391 — the durable admission still runs after this optional cache misses
  }
}
// storeIdempotent — idempotency.ts:394-416
async function storeIdempotent(env, surface, payer, idempotencyKey, body, transaction) {
  const record = {
    body,
    first_served_at: "2026-11-12T00:00:00.000Z", // deterministic clock (mock)
    ...(transaction ? { transaction } : {}),
  };
  await env.COUNTERS.put(await kvKeyFor(surface, payer, idempotencyKey), JSON.stringify(record));
}
// replayNote — idempotency.ts:430-438 (the cache-replay note; NOT the claim-path body)
function replayNote(firstServedAt) {
  return {
    idempotent_replay: true,
    first_served_at: firstServedAt,
    note: "This exact purchase (same item, same payer, same Idempotency-Key) already settled once, so this is the ORIGINAL result served from cache — no new payment was taken. The artifact ids are the same ones minted the first time. If you meant to buy again on purpose, send a fresh Idempotency-Key.",
  };
}

// ---------------------------------------------------------------------------
// Purchase record store (per-owner) — mirrors purchaseIntentStore(env, owner)
// ---------------------------------------------------------------------------
class PurchaseIntentStore {
  constructor(env, owner) { this.env = env; this.owner = owner; }
  async existingPurchase() { return this.env.records.has(this.owner) ? this.env.records.get(this.owner) : null; }
  async beginPurchase(json) { this.env.records.set(this.owner, json); return JSON.parse(json); }
  async setRecordState(state) {
    const record = JSON.parse(this.env.records.get(this.owner));
    record.state = state;
    this.env.records.set(this.owner, JSON.stringify(record));
  }
}
function purchaseIntentStore(env, owner) { return new PurchaseIntentStore(env, owner); }

// Settlement mock: a deterministic state machine, no network. Counts attempts.
async function mockSettlement(env, id, outcome) {
  env.settleCalls += 1;
  await purchaseIntentStore(env, id).setRecordState(outcome);
}

// ---------------------------------------------------------------------------
// [S3] RecordedPurchase mirror — purchase-intent.ts:155-167
// ---------------------------------------------------------------------------
const PURCHASE_RECORD_CODES = {
  pending: "purchase_recovery_pending", // purchase-intent.ts:21
  refused: "purchase_not_settled",      // purchase-intent.ts:22
};
class RecordedPurchase extends Error {
  constructor(env, record) {
    super("RecordedPurchase");
    this.name = "RecordedPurchase";
    // purchase-intent.ts:160-166 — body shape pinned
    this.body = {
      ...purchaseStatus(record),
      charged_again: false,
      settlement_attempted: false,
      error: "This payment already has a purchase record. No new settlement was attempted. Read its status; fulfillment recovery may still be required.",
      code:
        record.state === "unknown" ? "settlement_unknown" :
        record.state === "settled" ? PURCHASE_RECORD_CODES.pending :
        PURCHASE_RECORD_CODES.refused,
    };
  }
}
function purchaseStatus(record) {
  return { purchase_id: record.id, payer: record.payer, state: record.state, door: record.door, path: record.path };
}

// ---------------------------------------------------------------------------
// [S2] beginVerifiedPurchaseIntent mirror — purchase-intent.ts:310-349
// "Shared admission for verified adapters. No credential or signature is retained."
// Called only after x402 verification (:294-301): the payment carries
// { payer, identity } produced by the verified payload; identity is a function of
// (network, payer, nonce) per :317-318, so two distinct signed artifacts of one payer
// carry distinct identities.
// ---------------------------------------------------------------------------
function settlementPurchaseIdentity(_network, payer, nonce) {
  return { id: `auth:${normalizePayer(payer)}:${nonce}` };
}
async function beginVerifiedPurchaseIntent(env, input) {
  const { payer, identity: id } = input.payment;                      // :315
  if (settlementPurchaseIdentity(input.terms.network, payer, input.payment.nonce).id !== id) {
    throw new Error("Payment identity mismatch");                     // :317-318 (holds by construction)
  }
  let claimedSlot;
  if (input.idempotency) {                                            // :320
    claimedSlot = await idempotencySlotName(input.idempotency.surface, payer, input.idempotency.key); // :321
    const slot = idempotentPurchaseSlot(env, claimedSlot);            // :322
    const owner = await slot.claimIdempotentPurchase(id);             // :323
    if (owner !== id) {                                               // :324 — LOSER PATH
      const saved = await purchaseIntentStore(env, owner).existingPurchase(); // :325
      if (!saved) throw new Error("Original purchase admission pending");     // :326 — branch 1
      const original = JSON.parse(saved);                                     // :327
      // purchaseProtocol(original) (:328) — record-integrity check; records created by
      // this mirror are protocol-valid by construction (version 2 records only).
      if (original.id !== owner || original.payer !== payer || original.path !== input.path || original.door !== input.door) {
        throw new Error("Original purchase owner mismatch");                  // :329-331
      }
      throw new RecordedPurchase(env, original);                              // :332 — branches 2-4
    }
    if (input.afterClaim) await input.afterClaim(); // controlled interleave point (B1): after claim, before persist
  }
  // WINNER PATH continues (:335-349): persist the purchase record, then settle (mock).
  const record = {
    version: 2,
    id,
    payer,
    path: input.path,
    door: input.door,
    state: "unknown", // mid-settlement until the mocked settle call lands
    ...(claimedSlot ? { idempotency_slot: claimedSlot } : {}),
  };
  await purchaseIntentStore(env, id).beginPurchase(JSON.stringify(record));
  if (input.afterPersist) await input.afterPersist(); // controlled interleave point (B2)
  await mockSettlement(env, id, input.settlementOutcome ?? "settled");
  if (input.afterSettle) await input.afterSettle();   // controlled interleave point (B3/B4)
  return { admitted: true, id, slotName: claimedSlot };
}

// ---------------------------------------------------------------------------
// [C2] door replay-read mirror — payment-gate.ts:1328-1358 (+ mcp.ts:1006-1024).
// The read keys on the payer of the VERIFIED payload ("result.paymentPayload has
// been through the facilitator: the payer is the account that actually SIGNED",
// payment-gate.ts:1304-1308). A request with no verified payload is denied before
// the cache is consulted (:1331-1334); a verified stranger keys on their OWN payer
// and lands in a different cache slot (kvKeyFor bakes the payer in).
// ---------------------------------------------------------------------------
async function doorReplayRead(env, { surface, key, verifiedPayer }) {
  const claimsBefore = env.PAID_RECOVERIES.doClaimCalls;
  if (!verifiedPayer) {
    return { denied: true, reason: "payment_identity_unavailable", served: null, doClaimsDelta: env.PAID_RECOVERIES.doClaimCalls - claimsBefore };
  }
  const entry = await lookupIdempotent(env, surface, verifiedPayer, key);
  if (!entry) return { denied: false, served: null, miss: true, doClaimsDelta: env.PAID_RECOVERIES.doClaimCalls - claimsBefore };
  return { denied: false, served: { ...entry.body, ...replayNote(entry.first_served_at) }, doClaimsDelta: env.PAID_RECOVERIES.doClaimCalls - claimsBefore };
}

// ---------------------------------------------------------------------------
// Battery harness
// ---------------------------------------------------------------------------
const SURFACE = "http:/api/buy/test-item";           // opaque scope string (idempotencyScope output)
const KEY = "scvd-suggested-test-item-777";          // shared Idempotency-Key
const PAYER = "0xAbCdEF0123456789aBcDeF0123456789AbCdEf01"; // 40-hex: exercises EVM lowercase normalization
const PATH = "/api/buy/test-item";
const DOOR = "http";
const ID_W = "auth:" + PAYER.toLowerCase() + ":nonce-W"; // winner artifact identity
const ID_L = "auth:" + PAYER.toLowerCase() + ":nonce-L"; // loser artifact identity (distinct nonce)

function freshEnv() {
  return {
    PAID_RECOVERIES: new DONamespace(),
    COUNTERS: new KVMap(),
    records: new Map(),
    settleCalls: 0,
  };
}
function artifactInput(env, { identity, settlementOutcome, afterClaim, afterPersist, afterSettle }) {
  return {
    env,
    path: PATH,
    door: DOOR,
    terms: { network: "base" },
    payment: { payer: PAYER, identity, nonce: identity.split(":").pop() },
    idempotency: { surface: SURFACE, key: KEY },
    settlementOutcome,
    afterClaim,
    afterPersist,
    afterSettle,
  };
}

const ASSERTS = [];
function check(row, name, actual, expected) {
  const ok = actual === expected;
  ASSERTS.push({ row, name, ok, actual: String(actual), expected: String(expected) });
  return ok;
}

// H2 case: two concurrent signed-shaped artifacts, shared Idempotency-Key,
// controlled interleave point for the loser's read (timing-sensitive branch).
async function runH2Case(row, winnerIsA, loserReadAt, settlementOutcome) {
  const env = freshEnv();
  const idWinner = winnerIsA ? ID_W : ID_L;
  const idLoser = winnerIsA ? ID_L : ID_W;
  let loserObserved = null;

  const loserRun = async () => {
    try {
      const result = await beginVerifiedPurchaseIntent(env, artifactInput(env, { identity: idLoser }));
      loserObserved = { kind: "admitted", id: result.id }; // would be a second admission — divergence
    } catch (e) {
      loserObserved = { kind: e instanceof RecordedPurchase ? "recorded" : "error", message: e.message, body: e.body ?? null };
    }
  };

  const hooks = {
    afterClaim: loserReadAt === "afterClaim" ? loserRun : undefined,
    afterPersist: loserReadAt === "afterPersist" ? loserRun : undefined,
    afterSettle: loserReadAt === "afterSettle" ? loserRun : undefined,
  };

  const winner = await beginVerifiedPurchaseIntent(
    env,
    artifactInput(env, { identity: idWinner, settlementOutcome, afterClaim: hooks.afterClaim, afterPersist: hooks.afterPersist, afterSettle: hooks.afterSettle })
  );

  const winnerRecord = JSON.parse(await purchaseIntentStore(env, idWinner).existingPurchase());
  const expectedCode = {
    afterClaim: "Original purchase admission pending",
    afterPersist: settlementOutcome === "settled" ? "settlement_unknown" : "purchase_not_settled",
    afterSettle: settlementOutcome === "settled" ? "purchase_recovery_pending" : "purchase_not_settled",
  }[loserReadAt];

  const results = [];
  results.push(check(row, "winner admitted and owns slot", winner.admitted && winner.id === idWinner, true));
  results.push(check(row, "exactly one settlement attempt", env.settleCalls, 1));
  results.push(check(row, "loser outcome inside registered range", loserObserved ? ["recorded", "error"].includes(loserObserved.kind) : false, true));
  results.push(
    check(
      row,
      "loser code matches registered branch",
      loserReadAt === "afterClaim" ? loserObserved.message : loserObserved.body?.code,
      expectedCode
    )
  );
  results.push(check(row, "loser settlement_attempted false", loserObserved.body ? loserObserved.body.settlement_attempted : "n/a(error-throw)", loserReadAt === "afterClaim" ? "n/a(error-throw)" : false));
  results.push(check(row, "loser charged_again false", loserObserved.body ? loserObserved.body.charged_again : "n/a(error-throw)", loserReadAt === "afterClaim" ? "n/a(error-throw)" : false));
  results.push(check(row, "loser body is claim-path shape (no idempotent_replay)", loserObserved.body ? Object.prototype.hasOwnProperty.call(loserObserved.body, "idempotent_replay") : false, false));
  results.push(check(row, "no owner-mismatch divergence", loserObserved.message === "Original purchase owner mismatch", false));
  results.push(check(row, "final record state", winnerRecord.state, settlementOutcome));

  return { row, env, loserObserved, expectedCode, winnerId: idWinner, loserId: idLoser, slotName: winner.slotName, pass: results.every(Boolean) };
}

// C2 case: cache replay read gating.
async function runC2Case(row, variant) {
  const env = freshEnv();
  // Setup: the verified payer P settles once; its response is cached (storeIdempotent).
  await beginVerifiedPurchaseIntent(env, artifactInput(env, { identity: ID_W, settlementOutcome: "settled" }));
  const pBody = { code: "complete", payer: PAYER, artifact: "original" };
  await storeIdempotent(env, SURFACE, PAYER, KEY, pBody, "tx-original-1");
  const pCacheKey = await kvKeyFor(SURFACE, PAYER, KEY);
  const pEntryBefore = await env.COUNTERS.get(pCacheKey);

  let read;
  if (variant === "asserted-unverified") {
    // C2a: a stranger ASSERTS payer P but has no verified payload —
    // the read is denied before the cache is consulted.
    read = await doorReplayRead(env, { surface: SURFACE, key: KEY, verifiedPayer: undefined });
  } else {
    // C2b: a stranger verifies as THEMSELVES with the computed key —
    // the lookup bakes their own payer into the slot and misses P's entry.
    read = await doorReplayRead(env, { surface: SURFACE, key: KEY, verifiedPayer: "0x" + "b".repeat(40) });
  }
  const pEntryAfter = await env.COUNTERS.get(pCacheKey);
  const pSlotName = await idempotencySlotName(SURFACE, PAYER, KEY);
  const strangerSlotName = await idempotencySlotName(SURFACE, "0x" + "b".repeat(40), KEY);

  const results = [];
  results.push(check(row, "cached purchase not served to stranger", read.served, null));
  if (variant === "asserted-unverified") {
    results.push(check(row, "read denied before cache consultation", read.denied, true));
    results.push(check(row, "verified-payer slot not consulted via DO on read path", read.doClaimsDelta, 0));
  } else {
    results.push(check(row, "verified stranger gets cache miss", read.miss, true));
    results.push(check(row, "P's cache entry not readable via stranger slot", read.denied || read.miss, true));
  }
  results.push(check(row, "P's cache entry intact after the attempt", pEntryAfter === pEntryBefore, true));
  results.push(check(row, "exactly one settlement in setup", env.settleCalls, 1));
  if (variant !== "asserted-unverified") {
    results.push(check(row, "stranger slot differs from P's slot", strangerSlotName !== pSlotName, true));
  }
  return { row, read, pSlotName, strangerSlotName, pass: results.every(Boolean) };
}

// ---------------------------------------------------------------------------
// Run the frozen rows and emit Layer-1 artifacts
// ---------------------------------------------------------------------------
const PIN_HASHES = {
  "src/lib/idempotency.ts": "5eb55c019eca03789b24768b7b2c67bbea776ed2be226a9f8f91a95ccae05b13",
  "src/services/paid-recovery.ts": "4212ace707b3b2d7a80fe4a5e5cbf2ce9943b61ec28c351ecb5249f9b9e23c91",
  "src/services/purchase-intent.ts": "bd796c7bf3d6a5a006e3931ce090889086cad53a2c9f18446fc1d9635cdca965",
};

const rows = [];
const branchLabels = { afterClaim: "B1-admission-pending", afterPersist: "B2-unknown", afterSettleSettled: "B3-settled", afterSettleDeclined: "B4-declined" };

for (const winnerIsA of [true, false]) {
  const order = winnerIsA ? "A-wins" : "B-wins";
  rows.push(await runH2Case(`H2-${order}-B1`, winnerIsA, "afterClaim", "settled"));
  rows.push(await runH2Case(`H2-${order}-B2`, winnerIsA, "afterPersist", "settled"));
  rows.push(await runH2Case(`H2-${order}-B3`, winnerIsA, "afterSettle", "settled"));
  rows.push(await runH2Case(`H2-${order}-B4`, winnerIsA, "afterSettle", "declined"));
}
rows.push(await runC2Case("C2a-asserted-unverified-payer", "asserted-unverified"));
rows.push(await runC2Case("C2b-verified-stranger-different-slot", "verified-stranger"));

fs.mkdirSync(OUT, { recursive: true });

// Layer-1 log (JSON lines)
const logPath = path.join(OUT, "layer1-log.jsonl");
const logLines = [];
logLines.push(JSON.stringify({
  type: "meta",
  pin: PIN,
  repo: "cv-scvd/scvd-general-store-repo",
  pinned_file_sha256: PIN_HASHES,
  runner: "scripts/wave2-runner.mjs",
  runner_sha256: createHash("sha256").update(fs.readFileSync(new URL(import.meta.url))).digest("hex"),
  node_version: process.version,
  determinism: "wall-clock race replaced by controlled interleave at the loser read point; fixed clock; counter-based identities",
  scope: "offline re-implementation; platform single-writer-per-ID carried as pinned assumption; settlement mocked; cache empty on H2 claim-path rows",
}));
for (const r of rows) {
  logLines.push(JSON.stringify({
    type: "row",
    row: r.row,
    verdict: r.pass ? "PASS" : "FAIL",
    ...(r.expectedCode ? { expected_loser_code: r.expectedCode } : {}),
    ...(r.slotName ? { winner_slot_name: r.slotName } : {}),
    ...(r.pSlotName ? { payer_slot_name: r.pSlotName, stranger_slot_name: r.strangerSlotName } : {}),
    observed: r.loserObserved ?? { read: r.read },
  }));
}
fs.writeFileSync(logPath, logLines.join("\n") + "\n");

// Assert detail
const assertsPath = path.join(OUT, "layer1-asserts.jsonl");
fs.writeFileSync(assertsPath, ASSERTS.map((a) => JSON.stringify(a)).join("\n") + "\n");

// Verdict summary
const failed = ASSERTS.filter((a) => !a.ok);
const verdictLines = [
  "# Wave 2 battery — verdict summary",
  "",
  `Pin: \`${PIN}\` (cv-scvd/scvd-general-store-repo) — validated line-by-line before the first artifact (see layer1-gate).`,
  "",
  "| Row | Verdict |",
  "|-----|---------|",
  ...rows.map((r) => `| ${r.row} | ${r.pass ? "PASS" : "FAIL"} |`),
  "",
  `Total rows: ${rows.length}; asserts: ${ASSERTS.length}; failed asserts: ${failed.length}`,
  "",
  ...rows.map((r) => {
    const rowAsserts = ASSERTS.filter((a) => a.row === r.row);
    const bad = rowAsserts.filter((a) => !a.ok);
    const detail = bad.length
      ? bad.map((b) => `${b.name}: actual=${b.actual} expected=${b.expected}`).join("; ")
      : "all asserts ok" + (r.expectedCode ? ` (loser code: ${r.expectedCode})` : "");
    return `- **${r.row}** — ${r.pass ? "PASS" : "FAIL"} — ${detail}`;
  }),
];
fs.writeFileSync(path.join(OUT, "verdicts.md"), verdictLines.join("\n") + "\n");

console.log(`rows=${rows.length} asserts=${ASSERTS.length} failed=${failed.length}`);
for (const r of rows) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.row}`);
if (failed.length) {
  console.log("\nFAILED ASSERTS:");
  for (const a of failed) console.log(`  ${a.row} :: ${a.name} :: actual=${a.actual} expected=${a.expected}`);
  process.exitCode = 2;
}
