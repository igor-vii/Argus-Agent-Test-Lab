/**
 * TASK F1-RETRY Stage B — dynamic PreSpend deny test.
 * Test-only harness OUTSIDE the Franklin source tree. Imports the official
 * compiled modules (dist/) at pinned commit 45b026c and drives Franklin's REAL
 * production dispatch path: StreamingExecutor.collectResults -> executeWithPermissions
 * -> isSpendTool gate -> HookEngine.dispatch('PreSpend') -> user hook -> deny enforcement.
 * No network, no wallet, no payment code executed (spend tool is a local stub).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const FR = '/workspace/sandbox-franklin-f1-retry/franklin';       // upstream repo (unmodified)
const TH = '/workspace/sandbox-franklin-f1-retry/test-home';      // HOME with the deny hook
const EV = '/workspace/sandbox-franklin-f1-retry/franklin-prespend-deny-2026-10-12-retry';

process.env.HOME = TH;                       // BLOCKRUN_DIR -> disposable dir
process.env.F1_HOOK_LOG = EV;                // hook writes event log here
delete process.env.FRANKLIN_HOOKS;           // hooks enabled (production default)

// Fresh audit + hook-event logs
fs.rmSync(path.join(TH, '.blockrun', 'approvals.jsonl'), { force: true });
fs.rmSync(path.join(EV, "f1_prespend_event.jsonl"), { force: true });

const { HookEngine } = await import(path.join(FR, 'dist/hooks/runner.js'));
const { loadHooks } = await import(path.join(FR, 'dist/hooks/loader.js'));
const { isSpendTool, estimateSpendUsd } = await import(path.join(FR, 'dist/tools/spend-tools.js'));
const { StreamingExecutor } = await import(path.join(FR, 'dist/agent/streaming-executor.js'));

console.log('[1] spend-tool registry checks (pure functions, official module)');
assert.equal(isSpendTool('JupiterSwap'), true);
assert.equal(isSpendTool('Read'), false);
const input = { input_mint: 'USDC', amount: 7.5 };
assert.equal(estimateSpendUsd('JupiterSwap', input), 7.5);
console.log('    isSpendTool(JupiterSwap)=true, estimateSpendUsd=7.5 USD');

console.log('[2] official loader discovers the test hook from $HOME/.blockrun/hooks');
const loaded = loadHooks(TH);
console.log('    loaded:', loaded.map(h => `${h.event}:${path.basename(h.sourceFile)}:${h.scope}`));
assert.ok(loaded.some(h => h.event === 'PreSpend'));

console.log('[3] real HookEngine + real StreamingExecutor.collectResults (production pipeline)');
const engine = new HookEngine({ workDir: TH });
let handlerExecuted = false;
const stubHandler = {
  concurrent: false,
  spec: { name: 'JupiterSwap', input_schema: { type: 'object', properties: {}, required: [] } },
  async execute() { handlerExecuted = true; return { output: 'SHOULD NEVER RUN', isError: false }; },
};
const exec = new StreamingExecutor({
  handlers: new Map([['JupiterSwap', stubHandler]]),
  scope: { workingDir: TH },
  hooks: engine,
  onStart: () => {},
  sessionId: 'f1-prespend-deny-session',
});
const invocation = { id: 'toolu_f1_1', name: 'JupiterSwap', input: { ...input } };
const results = await exec.collectResults([invocation]);   // <-- real gate runs here
const [, result] = results[0];

console.log('[4] observed executor result:');
console.log('    isError =', result.isError);
console.log('    output  =', JSON.stringify(result.output));
assert.equal(result.isError, true);
assert.match(result.output, /Spend blocked by a user hook/);
assert.match(result.output, /ARGUS_F1_PRESPEND_DENY_TEST/);

console.log('[5] enforcement check: tool handler must NOT have executed');
assert.equal(handlerExecuted, false);
console.log('    handlerExecuted =', handlerExecuted);

console.log('[6] hook-side evidence (envelope received on stdin)');
const evLog = fs.readFileSync(path.join(EV, 'f1_prespend_event.jsonl'), 'utf-8').trim();
const envelope = JSON.parse(evLog.split('\n')[0]);
console.log('    hookEventName =', envelope.hookEventName, '| spend =', JSON.stringify(envelope.spend));
assert.equal(envelope.hookEventName, 'PreSpend');
assert.equal(envelope.spend.estimatedUsd, 7.5);
assert.equal(envelope.spend.tool, 'JupiterSwap');
assert.equal(envelope.spend.params.amount, 7.5);

console.log('[7] Franklin audit record (~/.blockrun/approvals.jsonl under test HOME)');
const approvals = fs.readFileSync(path.join(TH, '.blockrun', 'approvals.jsonl'), 'utf-8').trim();
console.log('   ', approvals);
const rec = JSON.parse(approvals.split('\n')[0]);
assert.equal(rec.kind, 'hook'); assert.equal(rec.decision, 'deny');
assert.equal(rec.by, 'hook:f1-deny.json');
assert.equal(rec.reason, 'ARGUS_F1_PRESPEND_DENY_TEST');

console.log('[8] negative control: same pipeline with FRANKLIN_HOOKS=0-equivalent (no engine)');
const execNoHooks = new StreamingExecutor({
  handlers: new Map([['JupiterSwap', stubHandler]]),
  scope: { workingDir: TH },
  hooks: undefined,                      // loop.ts builds `undefined` when FRANKLIN_HOOKS=0
  onStart: () => {},
  sessionId: 'f1-control',
});
const r2 = (await execNoHooks.collectResults([{ id: 'toolu_f1_2', name: 'JupiterSwap', input: { ...input } }]))[0][1];
console.log('    without hook engine, stub handler ran:', handlerExecuted, '(expected true)');
assert.equal(handlerExecuted, true);
assert.equal(r2.output, 'SHOULD NEVER RUN');

console.log('F1-DYNAMIC-TEST: ALL ASSERTIONS PASSED');
