// Offline signer for the Argus registry — mirrors tools/registry/sign-record.mjs
// for a machine that holds the key but not the repo (see attestations/README.md).
//
// Usage:
//   node offline-sign.mjs <draft.json> <privkey.json> --seq NNNN --prev <sha256hex>
//
// Prints the signed record JSON to stdout; human-readable log goes to stderr.
// Node >= 18, no dependencies. The private key is ONLY read locally — nothing
// is transmitted anywhere, nothing is written to disk.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { canonical, slugify } from './lib.mjs';

const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const [draftPath, keyPath] = args;
const seq = get('--seq');
const prev = get('--prev');

if (!draftPath || !keyPath || !seq || !prev) {
  console.error('usage: node offline-sign.mjs <draft.json> <privkey.json> --seq NNNN --prev <prev_record_hash_hex>');
  process.exit(2);
}
if (!/^\d{4}$/.test(seq)) {
  console.error('--seq must be a 4-digit number, e.g. 0017');
  process.exit(2);
}
if (!/^[0-9a-f]{64}$/.test(prev)) {
  console.error('--prev must be 64 lowercase hex chars (SHA-256 of the canonical previous record)');
  process.exit(2);
}

const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
if (!['seal', 'finding', 'correction'].includes(draft.type)) {
  throw new Error(`draft.type must be "seal", "finding" or "correction", got: ${draft.type}`);
}
if (draft.seq !== undefined || draft.signature !== undefined || draft.prev_record_hash !== undefined) {
  throw new Error('draft must not contain seq, prev_record_hash or signature — pass --seq/--prev instead');
}
for (const ev of draft.evidence ?? []) {
  if (ev.kind === 'file' && !ev.sha256) {
    throw new Error(`evidence not hash-pinned (offline mode has no repo files to hash): ${ev.path}`);
  }
}

const privDoc = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
const privateKey = crypto.createPrivateKey({ key: privDoc.private_jwk ?? privDoc, format: 'jwk' });

const record = {
  seq,
  record_id: `argus-${draft.type}-${seq}`,
  issued_at: new Date().toISOString(),
  signer_key_id: 'argus-lab-2026q4r2',
  prev_record_hash: prev,
  ...draft,
};
const signature = crypto.sign(null, Buffer.from(canonical(record)), privateKey).toString('base64');
const final = { ...record, signature };

// Self-check: verify the signature with the public key derived from the
// private one before printing anything. Catches canonicalization drift.
const pub = crypto.createPublicKey(privateKey);
const { signature: sigOut, ...payload } = final;
const ok = crypto.verify(null, Buffer.from(canonical(payload)), pub, Buffer.from(sigOut, 'base64'));
if (!ok) {
  console.error('SELF-CHECK FAILED — do not use this output');
  process.exit(1);
}

process.stdout.write(JSON.stringify(final, null, 2) + '\n');
console.error('self-check : signature verifies (pubkey derived from private key)');
console.error('record_id  :', final.record_id);
console.error('save as    : attestations/records/' + seq + '-' + slugify(draft.title) + '.' + draft.type + '.json');
