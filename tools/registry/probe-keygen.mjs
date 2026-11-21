// One-shot: probe-session Ed25519 keypair for sandbox probe runs.
// Distinct key id (never the lab's own key — the operator private key must not
// exist where the probes run). Private key -> $ARGUS_PROBE_PRIVKEY_DIR (never
// committed; default resolves OUTSIDE this repository), public key ->
// attestations/keys/<key_id>.pub.json so verify-registry resolves by id.
//
// Usage: node tools/registry/probe-keygen.mjs [keyId]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './lib.mjs';

const keyId = process.argv[2] || 'argus-lab-probe-2026q4';
const privDir = process.env.ARGUS_PROBE_PRIVKEY_DIR
  || path.resolve(REPO_ROOT, '../../keys');           // outside the repo
const pubDir = path.join(REPO_ROOT, 'attestations', 'keys');

if (fs.existsSync(path.join(pubDir, `${keyId}.pub.json`))) {
  console.log('probe key already present, skip generation');
  process.exit(0);
}
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const now = new Date().toISOString();
fs.mkdirSync(privDir, { recursive: true });
fs.writeFileSync(path.join(privDir, `${keyId}.priv.json`), JSON.stringify({
  key_id: keyId, algorithm: 'Ed25519', created_at: now,
  note: 'Probe-session key (sandbox-only). Revoke by removing the pub file from attestations/keys/.',
  private_jwk: privateKey.export({ format: 'jwk' }),
}, null, 2), { mode: 0o600 });
fs.writeFileSync(path.join(pubDir, `${keyId}.pub.json`), JSON.stringify({
  key_id: keyId, algorithm: 'Ed25519', created_at: now,
  note: 'Public key of a probe-session signer (see the signer_key_id on the records it signed).',
  public_jwk: publicKey.export({ format: 'jwk' }),
}, null, 2), { mode: 0o644 });
console.log(`probe key generated: ${keyId} (priv: ${privDir}, pub: ${pubDir})`);