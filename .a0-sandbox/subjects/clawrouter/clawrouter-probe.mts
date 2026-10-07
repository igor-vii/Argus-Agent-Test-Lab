/**
 * A1 SUBJECT PROBE — ClawRouter (CLIENT/PAYER role), unmodified upstream code.
 * Upstream: BlockRunAI/ClawRouter @ b758e036bbd1290c0997ad14c9812a106ef8d72b (v0.12.282)
 *
 * Attaches the REAL startProxy() from src/proxy.ts to a LOCAL mock gateway
 * (x402 boundary). NO real funds, NO mainnet, NO external RPC dependency on
 * the exercised path (api-key mode signs nothing; wallet-mode signing is local
 * EIP-712 but we do not settle anywhere).
 *
 * Probes (external observations only):
 *  CR1 startup + /health                     (proxy lifecycle)
 *  CR2 api-key mode: request routing        (Authorization forwarding, body, status)
 *  CR3 wallet mode vs mock 402              (x402 payment path: does it sign+retry?)
 *  CR4 seller timeout after payment accepted (what does client-side see?)
 *  CR5 seller HTTP 500 after payment        (error classification/fallback)
 *  CR6 retry same endpoint                  (does seller see 2 payments? duplicate economics)
 */
import { writeFileSync } from 'node:fs';

const results: any = {};
const MOCK = 'http://127.0.0.1:8766';

async function mockCtl(path: string, body?: any) {
  return (await fetch(`${MOCK}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })).json();
}
async function ledger() { return (await fetch(`${MOCK}/__ledger`)).json(); }

// ── CR1: startup via REAL upstream proxy (api-key mode) ─────────────────────
process.env.BLOCKRUN_API_BASE_URL = MOCK; // env-overridable base (src/api-key.ts:47)
const { startProxy } = await import('/tmp/clawrouter/src/proxy.ts');

const logLines: string[] = [];
const origLog = console.log; console.log = (...a: any[]) => { logLines.push(a.join(' ')); origLog(...a); };

const keyHandle = await startProxy({
  apiKey: 'brk_SANDBOX_FAKE_LOCAL_ONLY',
  port: 18402,
  allowExistingProxy: false,
  requestTimeoutMs: 4000,
});
console.log = origLog;
results.CR1_startup = {
  ok: true, port: keyHandle.port, authMode: keyHandle.authMode,
  walletAddress: keyHandle.walletAddress,
  startupLog: logLines.filter(l => l.includes('[ClawRouter]')),
};
const health = await (await fetch(`http://127.0.0.1:${keyHandle.port}/health`)).json();
results.CR1_startup.health = health;

// ── CR2: api-key routing (free/passthrough path; NOT x402 semantics) ────────
await mockCtl('/__mode', { mode: 'A' }); await mockCtl('/__reset');
const t0 = Date.now();
const r2 = await fetch(`http://127.0.0.1:${keyHandle.port}/v1/partner/echo`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ model: 'test-model', messages: [{ role: 'user', content: 'probe' }] }),
});
const b2 = await r2.text();
results.CR2_apikey_routing = {
  elapsedMs: Date.now() - t0, clientStatus: r2.status, clientBody: b2.slice(0, 400),
  mockLedger: await ledger(),
  note: 'api-key rail attaches Authorization bearer; no 402 dance occurs here — do NOT infer x402 behavior from this path',
};

// ── CR3: wallet mode against mock 402 → real x402 client path ───────────────
const throwawayKey = '0x59c6995e998f97a5a0044966f0945da7e1af7005fd2a5c7b1cfb421f4a0e3e3a' as const;
let walletErr: any = null; let walletHandle: any = null;
try {
  walletHandle = await startProxy({
    wallet: throwawayKey,
    apiBase: MOCK,           // direct override of upstream default
    port: 18403, allowExistingProxy: false,
    requestTimeoutMs: 4000,
    _balanceMonitorOverride: { checkBalance: async () => ({ sufficient: true, balanceUsd: 999, info: {} as any, cached: false }), checkSufficient: async () => ({ sufficient: true, info: {} as any }), refresh: async () => ({ sufficient: true, balanceUsd: 999, info: {} as any, cached: false }), invalidate: () => {} } as any,
    skipBalanceCheck: true,
  });
} catch (e) { walletErr = e instanceof Error ? e.message : String(e); }

if (walletHandle) {
  await mockCtl('/__mode', { mode: 'A' }); await mockCtl('/__reset');
  const lg: string[] = []; const ol = console.log; console.log = (...a: any[]) => { lg.push(a.join(' ')); };
  const r3 = await fetch(`http://127.0.0.1:${walletHandle.port}/v1/partner/echo`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'test-model', messages: [] }),
  }).catch(e => ({ __fetchError: String(e) } as any));
  console.log = ol;
  const b3 = r3.text ? (await r3.text().catch(() => '')) : r3.__fetchError;
  results.CR3_wallet_x402 = {
    clientStatus: r3.status ?? null, clientBody: String(b3).slice(0, 500),
    clawrouterLogs: lg.filter(l => /payment|402|x402/i.test(l)),
    mockLedger: await ledger(),
    walletAddress: walletHandle.walletAddress,
  };

  // ── CR4: seller accepts payment then times out ────────────────────────────
  await mockCtl('/__mode', { mode: 'B' }); await mockCtl('/__reset');
  const t4 = Date.now();
  const lg4: string[] = []; const ol4 = console.log; console.log = (...a: any[]) => { lg4.push(a.join(' ')); };
  const r4res = await fetch(`http://127.0.0.1:${walletHandle.port}/v1/partner/echo`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'test-model', messages: [] }),
  }).then(async res => ({ status: res.status, body: (await res.text().catch(() => '')).slice(0, 500) }))
    .catch(e => ({ status: null, fetchError: String(e) }));
  console.log = ol4;
  results.CR4_timeout_after_payment = {
    elapsedMs: Date.now() - t4, clientView: r4res,
    clawrouterLogs: lg4.filter(l => /payment|402|timeout|error/i.test(l)),
    mockLedger: await ledger(),
    groundTruth: 'mock: payment ACCEPTED, execution STARTED, response never sent',
  };

  // ── CR5: seller 500 after payment accepted ────────────────────────────────
  await mockCtl('/__mode', { mode: 'D' }); await mockCtl('/__reset');
  const lg5: string[] = []; const ol5 = console.log; console.log = (...a: any[]) => { lg5.push(a.join(' ')); };
  const r5 = await fetch(`http://127.0.0.1:${walletHandle.port}/v1/partner/echo`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'test-model', messages: [] }),
  }).then(async res => ({ status: res.status, body: (await res.text()).slice(0, 600) }))
    .catch(e => ({ fetchError: String(e) }));
  console.log = ol5;
  results.CR5_500_after_payment = {
    clientView: r5, clawrouterLogs: lg5.filter(l => /payment|402|error|fallback/i.test(l)),
    mockLedger: await ledger(),
    groundTruth: 'mock: payment ACCEPTED, execution FAILED, HTTP 500 returned',
  };

  // ── CR6: plain retry of the same paid endpoint (duplicate-economics probe) ─
  await mockCtl('/__mode', { mode: 'A' }); await mockCtl('/__reset');
  const attempts: any[] = [];
  for (let i = 0; i < 2; i++) {
    const r = await fetch(`http://127.0.0.1:${walletHandle.port}/v1/partner/echo`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'test-model', messages: [], attempt: i }),
    }).then(async res => ({ status: res.status, body: (await res.text()).slice(0, 300) }))
      .catch(e => ({ fetchError: String(e) }));
    attempts.push(r);
  }
  results.CR6_retry_duplicate = {
    attempts, mockLedger: await ledger(),
    question: 'did the CLIENT (ClawRouter) cause two economic executions at the seller for one user action?',
  };

  await walletHandle.close();
} else {
  results.CR3_wallet_x402 = { blocked: true, error: walletErr,
    note: 'startProxy(wallet) failed before any request was sent; no funds involved' };
}

await keyHandle.close();
writeFileSync('/tmp/subject-runs/CLAWROUTER_probe.json', JSON.stringify(results, null, 2));
console.log('\n=== CLAWROUTER PROBE DONE ===');
