// A0 extras (re-run, clean slate):
// [1] 402-observation loss trace: run WITHOUT paymentAdapter on mode A and
//     dump BOTH the raw adapter exchange metadata AND canonical evidence.
// [3] duplicate-execution probe: two runs with the SAME idempotency key under
//     mode A (non-idempotent seller). Compares verdicts against ground truth.
// No changes to canonical Argus code.
import { writeFileSync } from 'fs';
import { privateKeyToAccount } from 'viem/accounts';
import { RunOrchestrator } from '/workspace/src/core/RunOrchestrator';
import { AgentController } from '/workspace/src/core/AgentController';
import { X402AgentAdapter } from '/workspace/src/adapters/x402/X402AgentAdapter';
import { S8_X402Payment } from '/workspace/src/scenarios/S8_X402Payment';

const MOCK = 'http://127.0.0.1:8765/resource';
const PK = process.env.ARGUS_TEST_WALLET_PRIVATE_KEY as `0x${string}`;
const OUT_DIR = process.env.A0_OUT_DIR ?? '/tmp/a0-runs';

async function mode(m: string, reset = true) {
  await fetch('http://127.0.0.1:8765/__mode', { method: 'POST', body: JSON.stringify({ mode: m }) });
  if (reset) await fetch('http://127.0.0.1:8765/__reset', { method: 'POST' });
}
async function ledger() {
  return await (await fetch('http://127.0.0.1:8765/__ledger')).json();
}
function signingAdapter() {
  const a = privateKeyToAccount(PK);
  return {
    getArgusAddress: () => a.address,
    signX402Payment: async (b: any) => {
      const authorization = { from: b.from, to: b.to, value: BigInt(b.value), validAfter: BigInt(b.validAfter), validBefore: BigInt(b.validBefore), nonce: b.nonce };
      const signature = await a.signTypedData({
        domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' },
        types: { TransferWithAuthorization: [
          { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
        ] },
        primaryType: 'TransferWithAuthorization',
        message: authorization,
      } as any);
      return Buffer.from(JSON.stringify({ x402Version: 2, accepted: { scheme: b.scheme, network: b.network, asset: b.asset, amount: b.value, payTo: b.to, maxTimeoutSeconds: b.maxTimeoutSeconds }, payload: { signature, authorization: { ...authorization, value: authorization.value.toString(), validAfter: authorization.validAfter.toString(), validBefore: authorization.validBefore.toString() } } })).toString('base64');
    },
  };
}
async function oneRun(key: string, runId: string, timeoutMs = 2000) {
  const scenario = { ...S8_X402Payment, actions: [{ ...S8_X402Payment.actions[0], payload: { resourceId: 'res-1', idempotencyKey: key } }] };
  const adapter = new X402AgentAdapter('x402-target');
  const c = new AgentController(adapter, { connectionConfig: { transportType: 'x402', endpoint: MOCK, timeoutMs, options: {} } as any, runId });
  const orch = new RunOrchestrator(scenario, new Map([['client-1', c]]), scenario.assertions ?? [], signingAdapter() as any);
  const res = await orch.run();
  const ev = orch.getEvidence().map((r) => ({ source: r.source, type: r.type, data: r.data }));
  return {
    verdict: res.verdict,
    ev,
    adapterExchanges: adapter.getExchanges().map((x) => ({
      status: x.status,
      statusCode: (x.metadata as any)?.statusCode,
      observations: (x.metadata as any)?.observations,
      paymentResponseHeader: !!(x.metadata as any)?.paymentResponse,
      body: x.payload,
    })),
  };
}

const out: Record<string, unknown> = {};

// [1] resolver-less run on mode A: proves payment_required_received IS observed
// at the adapter and shows exactly where it stops relative to canonical evidence.
await mode('A');
{
  const scenario = { ...S8_X402Payment, actions: [{ ...S8_X402Payment.actions[0], payload: { resourceId: 'res-1', idempotencyKey: 'a0-NORESOLVER' } }] };
  const adapter = new X402AgentAdapter('x402-target');
  const c = new AgentController(adapter, { connectionConfig: { transportType: 'x402', endpoint: MOCK, timeoutMs: 2000, options: {} } as any, runId: 'run_noresolver' });
  const orch = new RunOrchestrator(scenario, new Map([['client-1', c]]), scenario.assertions ?? [] /* NO paymentAdapter */);
  const res = await orch.run();
  const ex = adapter.getExchanges()[0];
  out.noResolver = {
    verdict: res.verdict,
    canonicalEvidenceTypes: orch.getEvidence().map((r) => r.type),
    rawExchange: {
      statusCode: (ex?.metadata as any)?.statusCode,
      observations: (ex?.metadata as any)?.observations,
      paymentRequiredParsed: !!ex?.paymentRequired,
    },
  };
  console.log('[1] NO-RESOLVER verdict:', JSON.stringify(res.verdict));
  console.log('[1] canonical evidence types:', orch.getEvidence().map((r) => r.type).join(', '));
  console.log('[1] raw exchange observations:', JSON.stringify((ex?.metadata as any)?.observations), 'paymentRequired parsed:', !!ex?.paymentRequired, 'statusCode:', (ex?.metadata as any)?.statusCode);
}

// [3] Case B duplicate execution under mode A (non-idempotent seller):
// two independent runs, SAME idempotency key, no reset in between.
await mode('A');
const d1 = await oneRun('a0-DUP', 'run_d1');
const d2 = await oneRun('a0-DUP', 'run_d2');
const dupLedger = await ledger();
out.duplicateProbe = { attempt1: d1, attempt2: d2, groundTruth: dupLedger };
console.log('[3] DUP attempt1 verdict:', JSON.stringify(d1.verdict));
console.log('[3] DUP attempt2 verdict:', JSON.stringify(d2.verdict));
console.log('[3] DUP attempt2 execIds seen by Argus:', JSON.stringify(d2.adapterExchanges.map((e) => (e.body as any)?.executionId ?? null)));
console.log('[3] DUP ground truth: payments=' + dupLedger.payments.length + ' executions=' + dupLedger.executions.map((x: any) => `${x.executionId}:${x.status}`).join(','));

writeFileSync(`${OUT_DIR}/EXTRA.json`, JSON.stringify(out, null, 2));
console.log('raw json          :', `${OUT_DIR}/EXTRA.json`);
