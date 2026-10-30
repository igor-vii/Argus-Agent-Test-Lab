// Shared primitives for the Argus registry: canonical JSON, hashing, signing.
// No dependencies. Node >= 18.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const REPO_ROOT = path.resolve(new URL('../../', import.meta.url).pathname);
export const REGISTRY_DIR = path.join(REPO_ROOT, 'attestations');
export const RECORDS_DIR = path.join(REGISTRY_DIR, 'records');
export const PUBKEY_PATH = path.join(REGISTRY_DIR, 'keys', 'argus-lab-2026q4r2.pub.json');
// The private key NEVER lives in this repository (see attestations/README.md).
// Default location is the lab sandbox; override with ARGUS_PRIVKEY_PATH to sign
// from any machine that holds the key.
export const PRIVKEY_PATH = process.env.ARGUS_PRIVKEY_PATH || '/home/z/my-project/keys/argus-lab-2026q4r2.priv.json';

// Deterministic JSON: recursively sorted object keys, no whitespace. Two
// implementations of `canonical()` on any machine must produce byte-identical
// output for the same logical object — this is what signatures and chain
// hashes are computed over.
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}

export function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function fileSha256(absPath) {
  return sha256Hex(fs.readFileSync(absPath));
}

export function loadPrivateKey() {
  const jwk = JSON.parse(fs.readFileSync(PRIVKEY_PATH, 'utf8'));
  return crypto.createPrivateKey({ key: jwk.private_jwk, format: 'jwk' });
}

export function loadPublicKey() {
  const jwk = JSON.parse(fs.readFileSync(PUBKEY_PATH, 'utf8'));
  return crypto.createPublicKey({ key: jwk.public_jwk, format: 'jwk' });
}

// Signs the canonical form of `payload` (which must NOT contain a signature
// field) and returns base64.
export function signPayload(payload, privateKey) {
  return crypto.sign(null, Buffer.from(canonical(payload)), privateKey).toString('base64');
}

export function verifyPayload(payload, signatureB64, publicKey) {
  return crypto.verify(
    null,
    Buffer.from(canonical(payload)),
    publicKey,
    Buffer.from(signatureB64, 'base64')
  );
}

export function listRecords() {
  if (!fs.existsSync(RECORDS_DIR)) return [];
  return fs.readdirSync(RECORDS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({
      file: f,
      record: JSON.parse(fs.readFileSync(path.join(RECORDS_DIR, f), 'utf8')),
    }))
    .sort((a, b) => {
      // Order by numeric seq, NOT by filename: the zero-padded 4-digit prefix
      // stops being lexically ordered the moment seq reaches 10000 (a file
      // "10000-…" would sort before "2541-…"), which would walk signer,
      // verifier and index through the chain in a false order.
      const na = Number(a.record.seq);
      const nb = Number(b.record.seq);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      return a.file.localeCompare(b.file); // fallback: same seq (must not happen)
    });
}

export function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
