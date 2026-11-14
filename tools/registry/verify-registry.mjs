// Verifies the whole registry: signatures, hash chain, evidence file hashes.
// Exit 0 = registry intact. Any red flag -> non-zero exit.
import path from 'node:path';
import {
  REPO_ROOT, canonical, sha256Hex, fileSha256, loadPublicKeyById, verifyPayload, listRecords,
} from './lib.mjs';

// ARG-01/ARG-02 (external audit 2026-11): resolve each record's key by its
// signer_key_id instead of one hard-coded key, so pre/post-rotation records
// verify under their actual signing key. Unknown key id -> verification fails
// (fail closed).
const keyCache = new Map();
function keyFor(record, problems) {
  const id = record.signer_key_id;
  if (!id) {
    problems.push('missing signer_key_id');
    return null;
  }
  if (!keyCache.has(id)) {
    try {
      keyCache.set(id, loadPublicKeyById(id));
    } catch (err) {
      problems.push(`key unavailable for signer_key_id=${id}: ${err.message}`);
      keyCache.set(id, null);
    }
  }
  return keyCache.get(id);
}

const entries = listRecords();
if (entries.length === 0) {
  console.error('registry is empty');
  process.exit(2);
}

let prev = null;
let failures = 0;

for (const { file, record } of entries) {
  const problems = [];
  const { signature, ...payload } = record;
  const pub = keyFor(record, problems);
  if (pub && !verifyPayload(payload, signature, pub)) problems.push(`signature INVALID (key=${record.signer_key_id})`);
  const wantPrev = prev ? sha256Hex(canonical(prev)) : null;
  if ((record.prev_record_hash ?? null) !== wantPrev) {
    problems.push(`chain broken: expected prev=${wantPrev ? wantPrev.slice(0, 12) + '...' : 'null'}`);
  }
  for (const ev of record.evidence ?? []) {
    if (ev.kind === 'file') {
      let actual;
      try { actual = fileSha256(path.resolve(REPO_ROOT, ev.path)); }
      catch { problems.push(`evidence missing: ${ev.path}`); continue; }
      if (ev.sha256 && actual !== ev.sha256) problems.push(`evidence hash mismatch: ${ev.path}`);
    }
  }
  const tag = problems.length ? 'FAIL' : 'ok  ';
  if (problems.length) failures++;
  console.log(`${tag} #${record.seq} ${record.record_id} [${record.type}]`);
  for (const p of problems) console.log(`      - ${p}`);
  prev = record;
}

console.log(failures === 0
  ? `\nregistry intact: ${entries.length} records, chain head ${sha256Hex(canonical(prev)).slice(0, 16)}...`
  : `\n${failures} record(s) FAILED verification`);
process.exit(failures === 0 ? 0 : 1);
