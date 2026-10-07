import { Pool } from 'pg';
const pool = new Pool({ host:'localhost', port:5433, user:'postgres', password:'zeus_sandbox_pw', database:'zeus_secretariat_sandbox' });
const path = await import('node:path');
const ZEUS = '/tmp/argus-sandbox/zeus/zeus-secretariat/src';
const { Secretariat } = await import(path.join(ZEUS, 'core/state-machine.ts'));
const { PgDurableStore } = await import('./pg-store.mts');
const store: any = new PgDurableStore(pool, 'probe2', 'P2');
// DETECTION: log detached `this` at entry of every store method (bound fns carry original fn; wrap via Proxy get trap)
for (const name of ['updatePaymentIntentStatus','getPaymentIntentByOperationId','transitionToSubmitting','markNonceSubmitted','recordSubmissionResult','compareAndSetState','createPaymentIntent','getOperationById']) {
  const orig = store[name]; // bound function
  if (typeof orig !== 'function') { console.log('MISSING METHOD', name); continue; }
}
// Instead: patch the class prototype BEFORE binding happens? Binding already done in ctor.
// Alternative detection: wrap store itself with an outer logging proxy.
const logged = new Proxy(store, {
  get(t: any, p: any, r: any) {
    const v = Reflect.get(t, p, r);
    if (typeof v === 'function') {
      return (...args: any[]) => {
        console.log('CALL', String(p), 'args[0]=', typeof args[0] === 'string' ? args[0].slice(0, 40) : JSON.stringify(args[0])?.slice(0, 60));
        return v(...args);
      };
    }
    return v;
  },
});
const facilitatorMod = await import(path.join(ZEUS, 'adapters/x402-facilitator-client.ts'));
const rpcMod = await import(path.join(ZEUS, 'core/multi-rpc-checker.ts'));
const reconMod = await import(path.join(ZEUS, 'core/reconciliation-engine.ts'));
const { startSubjectGateway } = await import('./subject-gateway.mts');
const gw = await startSubjectGateway({ port: 8899, subject: 'probe2', fault: { executionMode: 'complete', honorIdempotency: true } } as any);
const fac = new facilitatorMod.MockX402FacilitatorClient(logged as any);
const rpc = new rpcMod.MockMultiRpcChecker(); rpc.setTxResult('0x_mock_tx_1', { confirmed: true, status: 'success' });
const recon = new reconMod.ReconciliationEngine(logged as any, rpc);
const adapters = new Map(); adapters.set('base-sepolia', { network:'base-sepolia', async createAuthorization(r:any,s:any,c:any){return {signature:'0xsig',scheme:'exact',timestamp:Date.now(),context:c};}, async submit(){throw new Error('no legacy submit');}, async observeSettlement(){return {settled:false,reason:'UNUSED'};} });
const sec = new Secretariat({ evidenceStore: logged, signer: { signerType:'S', async getAddress(){return '0xP';}, async signPayment(_r:any,c:any){return {operationId:c.operationId,signerType:'S',payer:'0xP',nonce:c.nonce,signature:'0xsig',signedAt:new Date().toISOString()};} }, adapters, settlementAdapter: fac, reconciliationEngine: recon, atomicSettlementHandoff: logged });
const policy = { maxPrice:'1000000', allowedNetworks:['base-sepolia'], allowedAssets:['0x83358AFC21F91A7B8E0BEC6AC3BC3A7C0D33BD01'], authorizationMode:'policy-bound' };
try {
  const res = await sec.execute({ target: gw.url, method:'POST', payload:{probe:'p2'}, policy, requestId:'a1s-probe2-v2', clientId:'argus-a1s-probe2' });
  console.log('STATUS', res.status, 'err', (res as any).error);
} catch(e){ console.log('THROWN', e); }
gw.server.close(); await pool.end(); process.exit(0);
