#!/usr/bin/env node
// Argus GitHub Action — reference consumer of docs/ci/api-contract-v0.md and
// docs/ci/result-contract-v0.md.
//
// Flow: POST /api/v1/runs (Bearer api-key, idempotency_key = sha256 of
// "argus.idem.v1:"+commit+":"+battery) → light-validate the argus.result.v0
// body (the backend runs the full result-view validator as its producer
// gate) → create the check run via the Checks API with the contracted
// conclusion → exit.
//
// Exit codes: 0 = PASS or UNKNOWN (job stays green; UNKNOWN's signal lives
// in the neutral check conclusion), 1 = FAIL or any action_required case
// (insufficient balance, bad key, rig failure, invalid result).
// Set ARGUS_DRY_RUN=1 to print the check-run payload instead of calling the
// Checks API (local testing / CI smoke).
// No dependencies. Node >= 18.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const key = process.env.INPUT_API_KEY || '';
const battery = process.env.INPUT_BATTERY_ID || 'x402-core';
const base = (process.env.INPUT_CONSOLE_URL || 'https://console.argus-lab.tech').replace(/\/+$/, '');
const repo = process.env.GITHUB_REPOSITORY || '';
const commit = process.env.GITHUB_SHA || '';
const token = process.env.GITHUB_TOKEN || '';
const dry = process.env.ARGUS_DRY_RUN === '1' || !token || !repo;

const ANN_PATH = 'argus-result.json';
const ann = (level, message) => ({ path: ANN_PATH, start_line: 1, end_line: 1, annotation_level: level, message });

async function record(conclusion, title, summary, annotations, exitCode) {
  const payload = {
    name: `argus-battery (${battery})`,
    head_sha: commit,
    status: 'completed',
    conclusion,
    output: { title, summary, annotations },
  };
  process.stdout.write(`verdict surface: ${title} — details: argus-result.json (check: ${conclusion}, exit: ${exitCode})\n`);
  if (dry) {
    process.stdout.write(`[dry-run] would create check run: ${payload.name} conclusion=${conclusion} annotations=${annotations.length}\n`);
    for (const a of annotations.slice(0, 3)) process.stdout.write(`[dry-run]   ${a.annotation_level}: ${a.message}\n`);
    process.exit(exitCode);
  }
  const res = await fetch(`https://api.github.com/repos/${repo}/check-runs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    process.stderr.write(`warning: Checks API returned ${res.status} — verdict survives in stdout and argus-result.json\n`);
  }
  process.exit(exitCode);
}

if (!key) record('action_required', 'Argus: api-key missing', 'Set the api-key input to ${{ secrets.ARGUS_API_KEY }}. Issue a key in Console → Settings → API keys.', [ann('notice', 'api-key input is empty')], 1);
if (!/^[0-9a-f]{40}$/.test(commit)) record('action_required', 'Argus: bad runner environment', `GITHUB_SHA is "${commit}", expected a 40-hex commit sha.`, [], 1);

const idem = sha256(`argus.idem.v1:${commit}:${battery}`);
let res, body;
try {
  res = await fetch(`${base}/api/v1/runs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ commit_sha: commit, battery_id: battery, idempotency_key: idem }),
  });
  body = await res.json().catch(() => null);
} catch (e) {
  record('action_required', 'Argus: API unreachable — rig failure', `POST ${base}/api/v1/runs failed: ${e.message}. No run was debited (api-contract-v0: refund-on-rig-failure).`, [ann('notice', `Argus API unreachable: ${e.message}`)], 1);
}

if (res.status === 402) {
  const topup = (body && body.topup_url) || 'https://console.argus-lab.tech/billing';
  const balance = body && typeof body.balance === 'number' ? body.balance : 'below floor';
  record('action_required', `Argus: insufficient balance (${balance} runs)`,
    `The battery did not run. Top up at ${topup} — crypto-paid, credited instantly; re-run the workflow afterwards. Advisory credit (3 runs) is exhausted.`,
    [ann('notice', `insufficient_balance — top up: ${topup}`)], 1);
}
if (res.status === 401) {
  record('action_required', 'Argus: invalid or revoked api-key', 'Issue a key in Console → Settings → API keys and update the ARGUS_API_KEY secret.', [ann('notice', '401 from /api/v1/runs')], 1);
}
if (res.status !== 201 && res.status !== 409) {
  record('action_required', `Argus: API returned HTTP ${res.status}`, 'Rig-side problem; no result exists. No debit on rig failure per api-contract-v0.', [ann('notice', `HTTP ${res.status} from /api/v1/runs`)], 1);
}

// Light consumer-side validation (producer already ran the full validator).
const valid = body
  && body.schema === 'argus.result.v0'
  && ['PASS', 'FAIL', 'UNKNOWN'].includes(body.verdict)
  && Array.isArray(body.scenarios)
  && body.scenarios.length > 0;
if (!valid) {
  record('action_required', 'Argus: invalid result object', 'Response is not a contract-valid argus.result.v0 — the rig needs attention (action_required, not failure: the agent was not measured).', [ann('notice', 'result failed consumer-side contract check')], 1);
}

writeFileSync('argus-result.json', JSON.stringify(body, null, 2) + '\n');
const n = body.scenarios.length;
const notes = [];
if (res.status === 409) notes.push('idempotent replay of an already-charged run (no re-debit)');
if (body.mode === 'simulation') notes.push(`simulated verdict (seed ${String(body.seed || '').slice(0, 16)}…) — not citable as evidence`);
const annotations = notes.map((m) => ann('notice', m));
for (const s of body.scenarios) {
  if (s.verdict === 'FAIL' && annotations.length < 50) annotations.push(ann('failure', `${s.id}: ${s.title || ''} — FAIL${s.notes ? ` (${s.notes})` : ''}`));
  if ((s.verdict === 'UNKNOWN' || s.verdict === 'HOLD') && annotations.length < 50) annotations.push(ann('warning', `${s.id}: ${s.title || ''} — ${s.verdict} (no deterministic answer)`));
}
for (const a of body.advisory || []) if (annotations.length < 50) annotations.push(ann('notice', `advisory: ${a}`));

const summary = [
  `Battery: ${body.battery?.id || battery} — ${n} scenarios (${body.summary?.pass ?? '?'} pass / ${body.summary?.fail ?? '?'} fail / ${body.summary?.unknown ?? '?'} unknown).`,
  notes.length ? `Notes: ${notes.join('; ')}.` : '',
  'Full object: argus-result.json (artifact of this run).',
].filter(Boolean).join(' ');

if (body.verdict === 'PASS') record('success', `Argus: PASS (${n}/${n})`, summary, annotations, 0);
if (body.verdict === 'UNKNOWN') record('neutral', `Argus: UNKNOWN (${body.summary?.fail ?? 0} fail, ${body.summary?.unknown ?? '?'} unknown of ${n})`, summary, annotations, 0);
record('failure', `Argus: FAIL (${body.summary?.fail ?? '?'} of ${n} failed)`, summary, annotations, 1);
