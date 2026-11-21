// Agent-session Ed25519 keypair for the agent self-test registry (Variant A).
// One key per autonomous session. The private key NEVER enters the
// repository: it is written to $ARGUS_AGENT_PRIVKEY_DIR (default resolves
// OUTSIDE the repo, ../../keys). The public key lands in
// attestations/agent/keys/<key_id>.pub.json with class "agent-session" and is
// accepted only by `verify-registry.mjs --registry=agent` — the main registry
// rejects it (ARG-03 operator allowlist). Revoke = remove the pub file.
//
// Usage: node tools/registry/agent-keygen.mjs <session-id>
//   e.g. node tools/registry/agent-keygen.mjs 20261121-migration
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, AGENT_KEYS_DIR } from './lib.mjs';

const sessionId = process.argv[2];
if (!sessionId || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,40}$/.test(sessionId)) {
  console.error('usage: node tools/registry/agent-keygen.mjs <session-id>  (e.g. 20261121-migration)');
  process.exit(2);
}
const keyId = `argus-agent-session-${sessionId}`;
const privDir = process.env.ARGUS_AGENT_PRIVKEY_DIR
  || path.resolve(REPO_ROOT, '../../keys');            // outside the repo

if (fs.existsSync(path.join(AGENT_KEYS_DIR, `${keyId}.pub.json`))) {
  console.log('agent session key already present, skip generation');
  process.exit(0);
}
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const now = new Date().toISOString();
fs.mkdirSync(privDir, { recursive: true });
fs.writeFileSync(path.join(privDir, `${keyId}.priv.json`), JSON.stringify({
  key_id: keyId,
  algorithm: 'Ed25519',
  class: 'agent-session',
  session_id: sessionId,
  created_at: now,
  note: 'Agent-session key for attestations/agent (self-test registry). Sandbox-only; never committed. Revoke by removing the pub file from attestations/agent/keys/.',
  private_jwk: privateKey.export({ format: 'jwk' }),
}, null, 2), { mode: 0o600 });
fs.mkdirSync(AGENT_KEYS_DIR, { recursive: true });
fs.writeFileSync(path.join(AGENT_KEYS_DIR, `${keyId}.pub.json`), JSON.stringify({
  key_id: keyId,
  algorithm: 'Ed25519',
  class: 'agent-session',
  session_id: sessionId,
  created_at: now,
  note: 'Agent-session signer for the agent self-test registry (attestations/agent). NOT an operator key: main-registry verification rejects it (ARG-03 operator allowlist).',
  public_jwk: publicKey.export({ format: 'jwk' }),
}, null, 2), { mode: 0o644 });
console.log(`agent session key generated: ${keyId}`);
console.log(`  priv: ${path.join(privDir, `${keyId}.priv.json`)} (outside the repo, mode 0600)`);
console.log(`  pub : attestations/agent/keys/${keyId}.pub.json`);
