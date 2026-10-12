/**
 * F1-RETRY Stage B: drive the REAL compiled Franklin HookEngine through a
 * synthetic PreSpend event with an unconditional deny hook.
 * No agent loop, no model request, no gateway call, no wallet, no handler.execute.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-retry-home-'));
process.env.HOME = TMP_HOME;                       // same isolation pattern as upstream test/hooks.local.mjs:16-17
const HOOK_LOG = path.join(TMP_HOME, 'hook-invocations.jsonl');
process.env.F1_HOOK_LOG = HOOK_LOG;

// Install test-only hook into documented user-scope location BEFORE engine construction
const hooksDir = path.join(TMP_HOME, '.blockrun', 'hooks');
fs.mkdirSync(hooksDir, { recursive: true });
fs.copyFileSync('/tmp/f1-testkit/f1-prespend-deny.json', path.join(hooksDir, 'f1-prespend-deny.json'));
fs.copyFileSync('/tmp/f1-testkit/deny-hook.sh', path.join(hooksDir, 'deny-hook.sh'));
fs.chmodSync(path.join(hooksDir, 'deny-hook.sh'), 0o755);
process.env.F1_HOOK_LOG = path.join(TMP_HOME, 'hook-invocations.jsonl'); // script will resolve via env below

const DIST = '/tmp/sandbox-franklin/franklin/dist';   // real compiled upstream artifact
const { loadHooks } = await import(path.join(DIST, 'hooks/loader.js'));
const { HookEngine } = await import(path.join(DIST, 'hooks/runner.js'));
const { estimateSpendUsd, isSpendTool } = await import(path.join(DIST, 'tools/spend-tools.js'));

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-retry-proj-'));
process.env.F1_HOOK_LOG = path.join(TMP_HOME, 'hook-invocations.jsonl');

console.log('STEP loaded hooks:', JSON.stringify(loadHooks(workDir).map(h => ({event: h.event, scope: h.scope, sourceFile: path.basename(h.sourceFile)}))));

const engine = new HookEngine({ workDir });
console.log('STEP hasHooks(PreSpend):', engine.hasHooks('PreSpend'));

// Envelope constructed EXACTLY as src/agent/streaming-executor.ts:89-106 does for a spend tool
const toolName = 'JupiterSwap';
const toolInput = { input_mint: 'USDC', amount: 10 };
console.log('STEP isSpendTool:', isSpendTool(toolName), 'estimateSpendUsd:', estimateSpendUsd(toolName, toolInput));
const input = {
  hookEventName: 'PreSpend',
  sessionId: 'f1-retry-session',
  cwd: workDir,
  timestamp: new Date().toISOString(),
  toolName,
  toolInput,
  spend: { estimatedUsd: estimateSpendUsd(toolName, toolInput), tool: toolName, params: toolInput },
};

const decision = await engine.dispatch('PreSpend', input);
console.log('RESULT dispatch decision:', JSON.stringify(decision));

// Evidence: what the hook actually received on stdin
const captured = fs.readFileSync(HOOK_LOG, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
console.log('EVIDENCE hook invocation count:', captured.length);
console.log('EVIDENCE hook received:', JSON.stringify(captured[0]));

// Evidence: denial recorded in approvals.jsonl (runner.ts:71-79 -> audit/approvals.ts)
const apPath = path.join(TMP_HOME, '.blockrun', 'approvals.jsonl');
console.log('EVIDENCE approvals.jsonl exists:', fs.existsSync(apPath));
if (fs.existsSync(apPath)) console.log('EVIDENCE approvals record:', fs.readFileSync(apPath, 'utf-8').trim());

// Negative control: without the deny hook, dispatch resolves allow (proves deny comes from the hook)
fs.rmSync(path.join(hooksDir, 'f1-prespend-deny.json'));
const engine2 = new HookEngine({ workDir });
const d2 = await engine2.dispatch('PreSpend', { ...input, sessionId: 'control-no-hook' });
console.log('CONTROL no-hook dispatch:', JSON.stringify(d2), 'hasHooks:', engine2.hasHooks('PreSpend'));

const ok = decision.decision === 'deny' && decision.reason === 'ARGUS_F1_PRESPEND_DENY_TEST'
  && captured.length === 1 && captured[0].hookEventName === 'PreSpend'
  && fs.existsSync(apPath);
console.log(ok ? 'VERDICT: DENY_ENFORCED_BY_FRANKLIN_ENGINE' : 'VERDICT: UNEXPECTED');
process.exit(ok ? 0 : 1);
