// Verifies a registry: signatures, hash chain, evidence file hashes.
//   default            — the main operator-signed registry (attestations/records)
//   --registry=agent   — the agent self-test registry (attestations/agent/records)
// Exit 0 = registry intact. Any red flag -> non-zero exit.
import path from 'node:path';
import {
  REPO_ROOT, canonical, sha256Hex, fileSha256, verifyPayload,
  loadOperatorKeyById, loadAgentKeyById, listRecords, listAgentRecords,
} from './lib.mjs';

const AGENT_MODE = process.argv.includes('--registry=agent');

// ARG-01/ARG-02 (external audit 2026-11): resolve each record's key by its
// signer_key_id instead of one hard-coded key, so pre/post-rotation records
// verify under their actual signing key. Unknown key id -> verification fails
// (fail closed).
// ARG-03 (operator canon, 2026-11-21): a main-registry signer must be on the
// OPERATOR_KEY_IDS allowlist in lib.mjs — a session/probe key dropped into
// keys/ cannot self-promote into the operator trust root. Agent mode resolves
// keys from attestations/agent/keys/ and requires class "agent-session"; the
// two trust roots cannot absorb each other.
function makeKeyFor(loadKey, label) {
  const cache = new Map();
  return (record, problems) => {
    const id = record.signer_key_id;
    if (!id) {
      problems.push('missing signer_key_id');
      return null;
    }
    if (!cache.has(id)) {
      try {
        cache.set(id, loadKey(id));
      } catch (err) {
        problems.push(`${label} key unavailable for signer_key_id=${id}: ${err.message}`);
        cache.set(id, null);
      }
    }
    return cache.get(id);
  };
}
const keyForMain = makeKeyFor(loadOperatorKeyById, 'operator');
const keyForAgent = makeKeyFor(loadAgentKeyById, 'agent-session');

function checkEvidence(record, problems) {
  for (const ev of record.evidence ?? []) {
    if (ev.kind === 'file') {
      let actual;
      try { actual = fileSha256(path.resolve(REPO_ROOT, ev.path)); }
      catch { problems.push(`evidence missing: ${ev.path}`); continue; }
      if (ev.sha256 && actual !== ev.sha256) problems.push(`evidence hash mismatch: ${ev.path}`);
    }
  }
}

function verifyMain() {
  const entries = listRecords();
  if (entries.length === 0) {
    console.error('registry is empty');
    process.exit(2);
  }
  let prev = null;
  let failures = 0;
  for (const { record } of entries) {
    const problems = [];
    const { signature, ...payload } = record;
    const pub = keyForMain(record, problems);
    if (pub && !verifyPayload(payload, signature, pub)) problems.push(`signature INVALID (key=${record.signer_key_id})`);
    const wantPrev = prev ? sha256Hex(canonical(prev)) : null;
    if ((record.prev_record_hash ?? null) !== wantPrev) {
      problems.push(`chain broken: expected prev=${wantPrev ? wantPrev.slice(0, 12) + '...' : 'null'}`);
    }
    checkEvidence(record, problems);
    const tag = problems.length ? 'FAIL' : 'ok  ';
    if (problems.length) failures++;
    console.log(`${tag} #${record.seq} ${record.record_id} [${record.type}]`);
    for (const p of problems) console.log(`      - ${p}`);
    prev = record;
  }
  console.log(failures === 0
    ? `\nregistry intact: ${entries.length} records, chain head ${sha256Hex(canonical(prev)).slice(0, 16)}...`
    : `\n${failures} record(s) FAILED verification`);
  return failures === 0 ? 0 : 1;
}

// Agent self-test registry: agent-session signatures, own hash chain,
// namespace discipline, evidence hashes, and the main-chain anchor —
// main_head_at_issuance must equal the canonical hash of some main-registry
// record. Anchors stay checkable after the main chain grows past them, so
// the check is a permanent property, not a point-in-time one. An empty agent
// registry is OK (exit 0) — only breakage is an error.
function verifyAgent() {
  const entries = listAgentRecords();
  if (entries.length === 0) {
    console.log('agent registry empty (0 records) — nothing to verify');
    return 0;
  }
  const mainHashes = new Set(listRecords().map(({ record }) => sha256Hex(canonical(record))));
  let prev = null;
  let failures = 0;
  for (const { record } of entries) {
    const problems = [];
    const { signature, ...payload } = record;
    const pub = keyForAgent(record, problems);
    if (pub && !verifyPayload(payload, signature, pub)) problems.push(`signature INVALID (key=${record.signer_key_id})`);
    if (record.record_id !== `argus-agent-self-${record.seq}`) {
      problems.push(`record_id must be "argus-agent-self-${record.seq}", got "${record.record_id}"`);
    }
    if (record.type !== 'self-test') problems.push(`agent record type must be "self-test", got "${record.type}"`);
    if (record.class !== 'agent-self-test') problems.push(`agent record class must be "agent-self-test", got "${record.class}"`);
    const wantPrev = prev ? sha256Hex(canonical(prev)) : null;
    if ((record.prev_record_hash ?? null) !== wantPrev) {
      problems.push(`chain broken: expected prev=${wantPrev ? wantPrev.slice(0, 12) + '...' : 'null'}`);
    }
    if (!record.main_head_at_issuance || !mainHashes.has(record.main_head_at_issuance)) {
      problems.push('main_head_at_issuance does not match any main-registry record hash');
    }
    checkEvidence(record, problems);
    const tag = problems.length ? 'FAIL' : 'ok  ';
    if (problems.length) failures++;
    console.log(`${tag} #${record.seq} ${record.record_id} [${record.type}]`);
    for (const p of problems) console.log(`      - ${p}`);
    prev = record;
  }
  console.log(failures === 0
    ? `\nagent registry intact: ${entries.length} records, chain head ${sha256Hex(canonical(prev)).slice(0, 16)}...`
    : `\n${failures} agent record(s) FAILED verification`);
  return failures === 0 ? 0 : 1;
}

process.exit(AGENT_MODE ? verifyAgent() : verifyMain());
