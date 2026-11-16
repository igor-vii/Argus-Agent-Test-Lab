// External-audit follow-up, 2026-11-15 (second-pass report + A2 byte access).
// Read-only: recomputes the ARG-12 hash identification, byte-verifies every
// pinned evidence path (A2), and re-checks the #0020 runner naming observation.
// Reproduce: node tools/registry/audit-followup-2026-11-15.mjs
import { canonical, sha256Hex, fileSha256, RECORDS_DIR, REGISTRY_DIR } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = path.resolve(path.join(RECORDS_DIR, '..', '..'));
const out = (s) => process.stdout.write(s + '\n');
const DA9 = 'da9ce991a7d63032199a443630b848465e8042a42722a43117f91274c60a49bc';

const recordFiles = fs.readdirSync(RECORDS_DIR).filter((f) => f.endsWith('.json')).sort();
const records = recordFiles.map((f) => ({ file: f, json: JSON.parse(fs.readFileSync(path.join(RECORDS_DIR, f), 'utf8')) }));
out(`records loaded: ${records.length}`);

/* ---- 1. ARG-12: identification of da9ce991… cited in #0022 ---- */
const rec0000 = records.find((r) => r.file.startsWith('0000')).json;
const rec0001 = records.find((r) => r.file.startsWith('0001')).json;
const rec0002 = records.find((r) => r.file.startsWith('0002')).json;
const pre = (f) => JSON.parse(fs.readFileSync(path.join(REGISTRY_DIR, 'evidence', 'rekey-2026-10-24', f), 'utf8'));
const pre0000 = pre('0000-x402-reference-client-signs-any-server-declared-402-amount-o.finding.pre-rekey.json');
const pre0001 = pre('0001-block-d-live-run-s10-s11-against-amw-paypal-agent-demo.seal.pre-rekey.json');
const strip = (o, ...keys) => { const c = { ...o }; for (const k of keys) delete c[k]; return c; };

out('\n== ARG-12 candidates ==');
const rows = [
  ['H(pre #0001 minus signature)  = signing-message digest of the 2026q4 signature', sha256Hex(canonical(strip(pre0001, 'signature')))],
  ['H(pre #0001) full canonical   = chain-link hash, pre-rekey', sha256Hex(canonical(pre0001))],
  ['H(pre #0000) full canonical   = prev_record_hash in pre-rekey #0001', sha256Hex(canonical(pre0000))],
  ['H(cur #0000) full canonical   = rebound prev_record_hash in #0001', sha256Hex(canonical(rec0000))],
  ['H(cur #0001) full canonical   = prev_record_hash in #0002', sha256Hex(canonical(rec0001))],
];
for (const [name, v] of rows) out(`${v === DA9 ? '>>> MATCH ' : '          '}${name}: ${v}`);
out(`prev_record_hash now: #0000=${rec0000.prev_record_hash} #0001=${rec0001.prev_record_hash.slice(0, 16)}… #0002=${rec0002.prev_record_hash.slice(0, 16)}…`);

/* ---- 2. A2: byte-verify every pinned evidence path ---- */
out('\n== A2: evidence hash sweep ==');
const pins = new Map();
const addPin = (p, sha, src) => {
  if (typeof p !== 'string' || typeof sha !== 'string' || !/^[a-f0-9]{64}$/.test(sha)) return;
  if (!pins.has(p)) pins.set(p, []);
  pins.get(p).push({ expected: sha, source: src });
};
for (const r of records) for (const e of r.json.evidence ?? []) addPin(e.path, e.sha256, r.file.slice(0, 4));
const manifestFiles = [];
const walk = (dir) => { for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith('.json')) manifestFiles.push(p); } };
walk(path.join(REGISTRY_DIR, 'evidence'));
let manifestEntries = 0;
for (const mf of manifestFiles) {
  let doc; try { doc = JSON.parse(fs.readFileSync(mf, 'utf8')); } catch { continue; }
  const rel = path.relative(REPO_ROOT, mf);
  const scan = (node) => {
    if (Array.isArray(node)) return node.forEach(scan);
    if (!node || typeof node !== 'object') return;
    const keys = Object.keys(node);
    const pKey = keys.find((k) => /^(path|file|file_path|relpath)$/.test(k));
    const sKey = keys.find((k) => /^(sha256|hash|sha256_hex)$/.test(k));
    if (pKey && sKey) { addPin(node[pKey], node[sKey], rel); manifestEntries++; }
    keys.forEach((k) => scan(node[k]));
  };
  scan(doc);
}
let match = 0, mismatch = 0, missing = 0; const problems = [];
for (const [p, variants] of pins) {
  const abs = path.join(REPO_ROOT, p);
  if (!fs.existsSync(abs)) { missing++; problems.push(`ABSENT    ${p}`); continue; }
  const actual = fileSha256(abs);
  if (variants.every((v) => v.expected === actual)) match++;
  else { mismatch++; problems.push(`MISMATCH  ${p} expected=${variants[0].expected.slice(0, 12)} actual=${actual.slice(0, 12)}`); }
}
out(`pinned paths: ${pins.size} (23 records + ${manifestEntries} manifest entries in ${manifestFiles.length} files)`);
out(`public-repo byte check: MATCH ${match} / MISMATCH ${mismatch} / ABSENT ${missing}`);
if (problems.length) out('details:\n  ' + problems.map((s) => s).join('\n  '));

/* ---- 3. #0020 runner naming observation ---- */
out('\n== #0020 runner names ==');
const runnerSha = (records.find((r) => r.file.startsWith('0020')).json.evidence ?? []).find((e) => /battery-wave2/.test(e.path ?? ''))?.sha256;
const refs = [];
for (const r of records) for (const e of r.json.evidence ?? []) if (e.sha256 === runnerSha) refs.push({ path: e.path, src: r.file.slice(0, 4) });
for (const mf of manifestFiles) {
  let doc; try { doc = JSON.parse(fs.readFileSync(mf, 'utf8')); } catch { continue; }
  const scan = (node) => {
    if (Array.isArray(node)) return node.forEach(scan);
    if (!node || typeof node !== 'object') return;
    for (const v of Object.values(node)) {
      if (v === runnerSha) refs.push({ path: String(node.path ?? node.file ?? '?'), src: path.relative(REPO_ROOT, mf) });
      else scan(v);
    }
  };
  scan(doc);
}
for (const u of [...new Set(refs.map((r) => r.path))]) {
  const abs = path.join(REPO_ROOT, u);
  out(`  - ${u} | exists=${fs.existsSync(abs)} | sha_ok=${fs.existsSync(abs) && fileSha256(abs) === runnerSha} | cited by ${refs.filter((r) => r.path === u).map((r) => r.src).join(', ')}`);
}
out(`distinct names for the runner artifact: ${new Set(refs.map((r) => r.path)).size}`);

/* ---- 4. chain integrity of the working tree ---- */
out('\n== verifier ==');
out(execSync('node tools/registry/verify-registry.mjs | tail -1', { cwd: REPO_ROOT, encoding: 'utf8' }).trim());
