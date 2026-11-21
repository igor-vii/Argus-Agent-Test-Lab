// Signs agent self-test drafts into the agent registry
// (attestations/agent/records) under an agent-session key. Same canonical /
// chain primitives as the main registry (lib.mjs), but:
//   - the signer is an agent-session key — the operator key is never touched
//     and never needed here;
//   - record ids use the argus-agent-self-<seq> namespace, type "self-test",
//     class "agent-self-test";
//   - every record pins main_head_at_issuance = SHA-256 of the canonical head
//     of the MAIN registry at signing time (tamper-evident ordering against
//     the operator chain, without merging chains);
//   - quality gates (anti-flood): a spend block and at least one file
//     evidence entry are mandatory — no evidence, no record.
//
// Usage: node tools/registry/agent-sign.mjs <draft.json> <session-key-id>
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  REPO_ROOT, AGENT_RECORDS_DIR, canonical, sha256Hex, fileSha256, slugify,
  listRecords, listAgentRecords,
} from './lib.mjs';

const draftPath = process.argv[2];
const keyId = process.argv[3];
if (!draftPath || !keyId) {
  console.error('usage: node tools/registry/agent-sign.mjs <draft.json> <session-key-id>');
  process.exit(2);
}
const privDir = process.env.ARGUS_AGENT_PRIVKEY_DIR
  || path.resolve(REPO_ROOT, '../../keys');            // outside the repo
const privJwk = JSON.parse(fs.readFileSync(path.join(privDir, `${keyId}.priv.json`), 'utf8'));
const privateKey = crypto.createPrivateKey({ key: privJwk.private_jwk, format: 'jwk' });

const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
if (draft.type !== 'self-test') {
  throw new Error(`agent draft.type must be "self-test", got: ${draft.type}`);
}
if (draft.class !== 'agent-self-test') {
  throw new Error(`agent draft.class must be "agent-self-test", got: ${draft.class}`);
}
for (const f of ['seq', 'record_id', 'signature', 'prev_record_hash', 'main_head_at_issuance']) {
  if (draft[f] !== undefined) {
    throw new Error(`draft must not contain ${f} — the signer assigns it`);
  }
}
if (!draft.spend || !draft.spend.currency || draft.spend.spent === undefined) {
  throw new Error('agent draft requires spend: { currency, spent, cap?, note? } — report the money the run actually used');
}
const fileEvidence = (draft.evidence ?? []).filter((ev) => ev.kind === 'file');
if (fileEvidence.length === 0) {
  throw new Error('agent draft requires at least one evidence entry of kind "file"');
}
for (const ev of fileEvidence) {
  if (!ev.sha256) ev.sha256 = fileSha256(path.resolve(REPO_ROOT, ev.path));
}

const main = listRecords();
if (main.length === 0) throw new Error('main registry is empty — nothing to anchor main_head_at_issuance to');
const mainHead = main[main.length - 1].record;
const mainHeadHash = sha256Hex(canonical(mainHead));

const existing = listAgentRecords();
const nextSeq = existing.length
  ? String(Number(existing[existing.length - 1].record.seq) + 1).padStart(4, '0')
  : '0001';
const prev = existing.length ? existing[existing.length - 1].record : null;
const prevHash = prev ? sha256Hex(canonical(prev)) : null;

const record = {
  seq: nextSeq,
  record_id: `argus-agent-self-${nextSeq}`,
  issued_at: new Date().toISOString(),
  signer_key_id: keyId,
  prev_record_hash: prevHash,
  main_head_at_issuance: mainHeadHash,
  ...draft,
};
const signature = crypto.sign(null, Buffer.from(canonical(record)), privateKey).toString('base64');

// Self-check with the derived public key before writing anything — catches
// canonicalization drift (same discipline as offline-sign.mjs).
const { signature: selfCheckSig, ...payload } = { ...record, signature };
const pub = crypto.createPublicKey(privateKey);
if (!crypto.verify(null, Buffer.from(canonical(payload)), pub, Buffer.from(selfCheckSig, 'base64'))) {
  throw new Error('SELF-CHECK FAILED — canonicalization drift; nothing written');
}

fs.mkdirSync(AGENT_RECORDS_DIR, { recursive: true });
const out = path.join(AGENT_RECORDS_DIR, `${nextSeq}-${slugify(record.title)}.self-test.json`);
fs.writeFileSync(out, JSON.stringify({ ...record, signature }, null, 2) + '\n');
console.log(`signed agent record #${nextSeq} (${keyId}) -> ${path.relative(REPO_ROOT, out)}`);
console.log(`  chain : prev = ${prevHash ? prevHash.slice(0, 16) + '...' : '(genesis)'}`);
console.log(`  anchor: main_head_at_issuance = ${mainHeadHash.slice(0, 16)}... (${mainHead.record_id})`);
