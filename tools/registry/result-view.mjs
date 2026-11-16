#!/usr/bin/env node
// Reference validator + renderer for the Argus result contract (v0).
// Spec: docs/ci/result-contract-v0.md. Read-only: loads a result JSON,
// validates it against the contract, prints the canonical stdout line and
// exits with the verdict.
//
// Usage: node tools/registry/result-view.mjs <result.json> [--quiet]
//   exit 0 = PASS, 1 = FAIL, 2 = UNKNOWN, 3 = contract violation
//
// Validation notes:
// - summary.recount: pass = PASS + OBSERVED, fail = FAIL,
//   unknown = UNKNOWN + HOLD (OBSERVED never changes the aggregate).
// - Per-contract fail-closed reading, an unrecognized scenario verdict is
//   treated as UNKNOWN by consumers; a producer emitting one is a contract
//   violation, so this validator rejects it (exit 3).
// - Evidence entries with kind "file" are byte-checked when the file exists
//   on the runner; a present file with a wrong hash is a contract violation,
//   an absent file is a warning (the runner may not hold the artifact).
// No dependencies. Node >= 18.
import fs from 'node:fs';
import path from 'node:path';
import { fileSha256 } from './lib.mjs';

const SCHEMA = 'argus.result.v0';
const VERDICTS = ['PASS', 'FAIL', 'UNKNOWN', 'HOLD', 'OBSERVED'];
const HEX64 = /^[a-f0-9]{64}$/;

const die = (why) => {
  process.stderr.write(`invalid result object: ${why}\n`);
  process.exit(3);
};

const argv = process.argv.slice(2);
const quiet = argv.includes('--quiet');
const file = argv.find((a) => !a.startsWith('--'));
if (!file) die('usage: result-view.mjs <result.json> [--quiet]');

let doc;
try {
  doc = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) {
  die(`not parseable JSON: ${e.message}`);
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const iso = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

if (doc.schema !== SCHEMA) die(`schema must be "${SCHEMA}", got ${JSON.stringify(doc.schema)}`);
if (doc.mode !== 'simulation' && doc.mode !== 'live') die(`mode must be "simulation"|"live", got ${JSON.stringify(doc.mode)}`);
if (doc.mode === 'simulation') {
  if (typeof doc.disclaimer !== 'string' || doc.disclaimer.length < 40) {
    die('mode=simulation requires a non-empty disclaimer string');
  }
  if (typeof doc.seed !== 'string' || doc.seed.length === 0) {
    die('mode=simulation requires a non-empty seed');
  }
}
if (!isObj(doc.battery) || !doc.battery.id) die('battery.id is required');
if (!Number.isInteger(doc.battery.scenario_count) || doc.battery.scenario_count <= 0) die('battery.scenario_count must be a positive integer');
if (!isObj(doc.run) || !iso(doc.run.started_at) || !iso(doc.run.finished_at)) die('run.started_at/finished_at must be ISO-8601');
if (!Array.isArray(doc.scenarios) || doc.scenarios.length === 0) die('scenarios must be a non-empty array');
if (doc.battery.scenario_count !== doc.scenarios.length) die(`battery.scenario_count=${doc.battery.scenario_count} != scenarios.length=${doc.scenarios.length}`);

const warnings = [];
for (const s of doc.scenarios) {
  if (!s || !s.id) die('every scenario needs an id');
  if (!VERDICTS.includes(s.verdict)) die(`scenario ${s.id}: verdict ${JSON.stringify(s.verdict)} outside PASS|FAIL|UNKNOWN|HOLD|OBSERVED`);
  for (const e of Array.isArray(s.evidence) ? s.evidence : []) {
    if (!e || !HEX64.test(String(e.sha256 || ''))) die(`scenario ${s.id}: evidence entry needs a 64-hex sha256`);
    if (e.kind === 'file' && typeof e.path === 'string') {
      const abs = path.resolve(e.path);
      if (fs.existsSync(abs)) {
        const actual = fileSha256(abs);
        if (actual !== e.sha256) die(`scenario ${s.id}: evidence ${e.path} hashes to ${actual.slice(0, 12)}…, pinned ${e.sha256.slice(0, 12)}…`);
      } else {
        warnings.push(`evidence not on this runner (not verified): ${e.path}`);
      }
    }
  }
}

const tally = { pass: 0, fail: 0, unknown: 0 };
const failedIds = [], unknownIds = [];
for (const s of doc.scenarios) {
  if (s.verdict === 'PASS' || s.verdict === 'OBSERVED') tally.pass++;
  else if (s.verdict === 'FAIL') { tally.fail++; failedIds.push(s.id); }
  else { tally.unknown++; unknownIds.push(s.id); }
}
if (!isObj(doc.summary) || doc.summary.pass !== tally.pass || doc.summary.fail !== tally.fail || doc.summary.unknown !== tally.unknown) {
  die(`summary ${JSON.stringify(doc.summary)} != recount ${JSON.stringify(tally)}`);
}

const expected = tally.fail > 0 ? 'FAIL' : tally.unknown > 0 ? 'UNKNOWN' : 'PASS';
if (doc.verdict !== expected) die(`verdict ${JSON.stringify(doc.verdict)} != rollup ${expected} (any FAIL -> FAIL; else any UNKNOWN/HOLD -> UNKNOWN; else PASS)`);

const n = doc.scenarios.length;
if (!quiet) {
  const details = `details: ${file}`;
  if (expected === 'FAIL') process.stdout.write(`verdict: FAIL (${tally.fail}/${n} failed: ${failedIds.join(', ')}) — ${details}\n`);
  else if (expected === 'UNKNOWN') process.stdout.write(`verdict: UNKNOWN (${tally.fail} fail, ${tally.unknown} unknown of ${n}${unknownIds.length ? ': ' + unknownIds.join(', ') : ''}) — ${details}\n`);
  else process.stdout.write(`verdict: PASS (${n}/${n}) — ${details}\n`);
  for (const w of warnings) process.stdout.write(`note: ${w}\n`);
  if (doc.mode === 'simulation') process.stdout.write(`note: simulated verdict (seed ${String(doc.seed).slice(0, 16)}…) — not citable as evidence\n`);
}
process.exit(expected === 'PASS' ? 0 : expected === 'FAIL' ? 1 : 2);
