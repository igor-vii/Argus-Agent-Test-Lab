// Signs probe-run draft records under an explicit signer_key_id (default: the
// probe-session key). Chain/evidence/slug semantics are identical to
// sign-record.mjs — same lib.mjs primitives — but it never touches the
// operator key: use this only for sandbox probe findings like #0025/#0026.
//
// Usage: node tools/registry/probe-sign.mjs <draft.json> [keyId]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  REPO_ROOT, canonical, sha256Hex, fileSha256, slugify, listRecords,
} from './lib.mjs';

const draftPath = process.argv[2];
const keyId = process.argv[3] || 'argus-lab-probe-2026q4';
if (!draftPath) {
  console.error('usage: node tools/registry/probe-sign.mjs <draft.json> [keyId]');
  process.exit(2);
}
const privDir = process.env.ARGUS_PROBE_PRIVKEY_DIR
  || path.resolve(REPO_ROOT, '../../keys');           // outside the repo
const privJwk = JSON.parse(
  fs.readFileSync(path.join(privDir, `${keyId}.priv.json`), 'utf8'));
const privateKey = crypto.createPrivateKey({ key: privJwk.private_jwk, format: 'jwk' });
const RECORDS_DIR = path.join(REPO_ROOT, 'attestations', 'records');

const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
if (!['seal', 'finding', 'correction'].includes(draft.type)) {
  throw new Error(`draft.type must be "seal"|"finding"|"correction", got: ${draft.type}`);
}
if (draft.seq !== undefined || draft.signature !== undefined || draft.prev_record_hash !== undefined) {
  throw new Error('draft must not contain seq, prev_record_hash or signature — the signer assigns them');
}
for (const ev of draft.evidence ?? []) {
  if (ev.kind === 'file' && !ev.sha256) {
    ev.sha256 = fileSha256(path.resolve(REPO_ROOT, ev.path));
  }
}

const existing = listRecords();
const nextSeq = String(Number(existing[existing.length - 1].record.seq) + 1).padStart(4, '0');
const prev = existing[existing.length - 1].record;
const prevHash = prev ? sha256Hex(canonical(prev)) : null;

const record = {
  seq: nextSeq,
  record_id: `argus-${draft.type}-${nextSeq}`,
  issued_at: new Date().toISOString(),
  signer_key_id: keyId,
  prev_record_hash: prevHash,
  ...draft,
};
const signature = crypto.sign(null, Buffer.from(canonical(record)), privateKey).toString('base64');
const out = path.join(RECORDS_DIR, `${nextSeq}-${slugify(record.title)}.${draft.type}.json`);
fs.writeFileSync(out, JSON.stringify({ ...record, signature }, null, 2) + '\n');
console.log(`signed #${nextSeq} (${keyId}) -> ${path.basename(out)}`);