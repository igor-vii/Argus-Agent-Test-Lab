/**
 * A0 RE-AUDIT HARNESS (analysis-only; lives OUTSIDE canonical src/).
 * Drives the REAL canonical Argus pipeline against the local mock gateway:
 *   X402AgentAdapter -> AgentController -> ScenarioEngine -> EvidenceCollector
 *   -> AssertionEngine(S8 assertion) -> RunOrchestrator verdict.
 * Plus: computeB6BVerdict over the SAME canonical evidence set (report-only,
 * not wired into canonical pipeline).
 * No production logic is added to Argus.
 */
import { privateKeyToAccount } from 'viem/accounts';
import { writeFileSync } from 'fs';
import { RunOrchestrator } from '/workspace/src/core/RunOrchestrator';
import { AgentController } from '/workspace/src/core/AgentController';
import { X402AgentAdapter } from '/workspace/src/adapters/x402/X402AgentAdapter';
import { S8_X402Payment } from '/workspace/src/scenarios/S8_X402Payment';
import { computeB6BVerdict } from '/workspace/src/core/B6BEvidence';

const MOCK = process.env.MOCK_URL ?? 'http://127.0.0.1:8765/resource';
const PK = process.env.ARGUS_TEST_WALLET_PRIVATE_KEY as `0x${string}`;
const TIMEOUT_MS = Number(process.env.ARGUS_TIMEOUT_MS ?? 2000);
const OUT_DIR = process.env.A0_OUT_DIR ?? '/tmp/a0-runs';

async function setMode(mode: string) {
  await fetch('http://127.0.0.1:8765/__mode', { method: 'POST', body: JSON.stringify({ mode }) });
  await fetch('http://127.0.0.1:8765/__reset', { method: 'POST' });
}
async function getLedger(): Promise<any> {
  const j = await (await fetch('http://127.0.0.1:8765/__ledger')).json();
  return { ledger: j.ledger ?? j };
}

// Minimal PaymentAdapter facade for the sandbox: reuses the REAL EIP-3009
// typed-data signing semantics but supplies a network matching the mock's
// accepts so no RPC round-trip is required. This is a TEST-HARNESS
// composition at the existing RunOrchestrator paymentResolver seam —
// canonical classes are used unmodified.
function makeSigningAdapter() {
  const account = privateKeyToAccount(PK);
  return {
    getArgusAddress: () => account.address,
    signX402Payment: async (binding: any) => {
      const authorization = {
        from: binding.from as `0x${string}`,
        to: binding.to as `0x${string}`,
        value: BigInt(binding.value),
        validAfter: BigInt(binding.validAfter),
        validBefore: BigInt(binding.validBefore),
        nonce: binding.nonce as `0x${string}`,
      };
      const signature = await account.signTypedData({
        domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' },
        types: { TransferWithAuthorization: [
          { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
        ] },
        primaryType: 'TransferWithAuthorization',
        message: authorization,
      });
      return Buffer.from(JSON.stringify({
        x402Version: 2,
        accepted: { scheme: binding.scheme, network: binding.network, asset: binding.asset, amount: binding.value, payTo: binding.to, maxTimeoutSeconds: binding.maxTimeoutSeconds },
        payload: { signature, authorization: { ...authorization, value: authorization.value.toString(), validAfter: authorization.validAfter.toString(), validBefore: authorization.validBefore.toString() } },
      })).toString('base64');
    },
  };
}

async function oneRun(name: string, key: string, runId: string) {
  const scenario = {
    ...S8_X402Payment,
    actions: [{ ...S8_X402Payment.actions[0], payload: { resourceId: 'res-1', idempotencyKey: key } }],
  };
  const adapter = new X402AgentAdapter('x402-target');
  const controller = new AgentController(adapter, {
    connectionConfig: { transportType: 'x402', endpoint: MOCK, timeoutMs: TIMEOUT_MS, options: {} } as any,
    runId,
  });
  const orchestrator = new RunOrchestrator(
    scenario,
    new Map([['client-1', controller]]),
    scenario.assertions ?? [],
    makeSigningAdapter() as any
  );
  const result = await orchestrator.run();
  const evidence = orchestrator.getEvidence().map((r) => ({ source: r.source, type: r.type, data: r.data, timestamp: r.timestamp }));
  return { result, evidence, adapter };
}

async function runScenario(name: string, mode: string) {
  await setMode(mode);
  const { result, evidence } = await oneRun(name, `a0-${name}`, `run_${name}`);
  const b6b = computeB6BVerdict(evidence as any);
  const ld = await getLedger();
  const out = { name, mode, canonicalVerdict: result.verdict, runStatus: result.status, evidenceCount: result.evidenceCount, evidence, b6bVerdict: b6b, mockLedgerGroundTruth: ld };
  const file = `${OUT_DIR}/${name}.json`;
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`\n=== ${name} (mode ${mode}) ===`);
  console.log('canonical verdict :', JSON.stringify(result.verdict));
  console.log('computeB6BVerdict :', JSON.stringify(b6b));
  console.log('evidence types    :', evidence.map((e) => e.type).join(', '));
  console.log('mock ground truth : payments=' + ld.ledger.payments.length + ' executions=' + ld.ledger.executions.map((x: any) => `${x.executionId}:${x.status}`).join(','));
  console.log('raw json          :', file);
  return out;
}

const which = process.argv[2] ?? 'ALL';
const runs: Array<[string, string]> = [
  ['P3_HAPPY_PATH', 'A'],
  ['S1_TIMEOUT', 'B'],
  ['S2_RESPONSE_LOST', 'C'],
  ['S3_EXEC_FAILURE', 'D'],
];
if (which === 'ALL') {
  for (const [n, m] of runs) await runScenario(n, m);

  // S4: retry after UNKNOWN — two sequential paid attempts under mode E
  await setMode('E');
  const results: any[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { result, evidence } = await oneRun('S4', 'a0-S4', `run_S4_${attempt}`);
    results.push({ attempt, verdict: result.verdict, runId: result.runId, evidenceTypes: evidence.map((e) => e.type), b6b: computeB6BVerdict(evidence as any) });
  }
  const ld = await getLedger();
  const out = { name: 'S4_RETRY_AFTER_UNKNOWN', mode: 'E', runs: results, mockLedgerGroundTruth: ld };
  writeFileSync(`${OUT_DIR}/S4_RETRY_AFTER_UNKNOWN.json`, JSON.stringify(out, null, 2));
  console.log('\n=== S4_RETRY_AFTER_UNKNOWN (mode E, two independent runs) ===');
  for (const r of results) console.log(`attempt ${r.attempt}: verdict=${JSON.stringify(r.verdict)} evidence=[${r.evidenceTypes.join(', ')}] b6b=${r.b6b.status}`);
  console.log('mock ground truth : payments=' + ld.ledger.payments.length + ' executions=' + ld.ledger.executions.map((x: any) => `${x.executionId}:${x.status}`).join(','));

  // S5: idempotent retry — same idempotency key twice under mode F, NO reset between attempts
  await fetch('http://127.0.0.1:8765/__mode', { method: 'POST', body: JSON.stringify({ mode: 'F' }) });
  await fetch('http://127.0.0.1:8765/__reset', { method: 'POST' });
  const results5: any[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { result, evidence } = await oneRun('S5', 'a0-S5-fixed', `run_S5_${attempt}`);
    results5.push({ attempt, verdict: result.verdict, evidenceTypes: evidence.map((e) => e.type), payloads: evidence.filter((e) => e.source === 'sut-1').map((e) => JSON.stringify(e.data).slice(0, 300)) });
  }
  const ld5 = await getLedger();
  const out5 = { name: 'S5_IDEMPOTENT_RETRY', mode: 'F', runs: results5, mockLedgerGroundTruth: ld5 };
  writeFileSync(`${OUT_DIR}/S5_IDEMPOTENT_RETRY.json`, JSON.stringify(out5, null, 2));
  console.log('\n=== S5_IDEMPOTENT_RETRY (mode F, two independent runs, same idempotency key) ===');
  for (const r of results5) console.log(`attempt ${r.attempt}: verdict=${JSON.stringify(r.verdict)} payloads=${r.payloads.join(' | ')}`);
  console.log('mock ground truth : payments=' + ld5.ledger.payments.length + ' executions=' + ld5.ledger.executions.map((x: any) => `${x.executionId}:${x.status}`).join(','));
} else {
  const found = runs.find(([n]) => n === which);
  if (!found) throw new Error('unknown run ' + which);
  await runScenario(found[0], found[1]);
}
