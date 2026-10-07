process.env.TZ='UTC';
import { Pool } from 'pg';
const path = await import('node:path');
const pool = new Pool({ host:'localhost', port:5433, user:'postgres', password:'zeus_sandbox_pw', database:'zeus_secretariat_sandbox' });
await pool.query('SELECT 1');
const ZEUS = '/tmp/argus-sandbox/zeus/zeus-secretariat/src';
const { PgDurableStore } = await import('./pg-store.mts');
const store: any = new PgDurableStore(pool, 'probe5', 'P5');
// outer logging proxy like probe-two, but ALSO capture stack of every rejection
const errs: string[] = [];
(store as any).__logErr = (m: string, e?: any) => { const line = `${m}${e ? ' | ERR=' + (e.stack ?? e.message ?? String(e)).split('\n').slice(0,4).join(' // ') : ''}`; errs.push(line); console.log('STOREERR:', line); };
const logged = new Proxy(store, {
  get(t: any, p: any, r: any) {
    const v = Reflect.get(t, p, r);
    if (typeof v === 'function') {
      return (...args: any[]) => {
        console.log('CALL', String(p), JSON.stringify(args)?.slice(0, 90));
        const out = v(...args);
        if (out && typeof out.then === 'function') return out.catch((e: any) => { t.__logErr(`REJECT ${String(p)}`, e); throw e; });
        return out;
      };
    }
    return v;
  },
});
const { Secretariat } = await import(path.join(ZEUS, 'core/state-machine.ts'));
const fm = await import(path.join(ZEUS, 'adapters/x402-facilitator-client.ts'));
const rm = await import(path.join(ZEUS, 'core/multi-rpc-checker.ts'));
const cm = await import(path.join(ZEUS, 'core/reconciliation-engine.ts'));
const { startSubjectGateway } = await import('./subject-gateway.mts');
const gw = await startSubjectGateway({ port: 8901, subject: 'probe5', fault: { executionMode: 'complete', honorIdempotency: true } } as any);
const fac = new fm.MockX402FacilitatorClient(logged);
fac.forceStatus = 'SUBMITTED';
const rpc = new rm.MockMultiRpcChecker(); rpc.setTxResult('0x_mock_tx_1', { confirmed: true, status: 'success' });
const recon = new cm.ReconciliationEngine(logged, rpc);
const adapters = new Map(); adapters.set('base-sepolia', { network:'base-sepolia', async createAuthorization(r:any,s:any,c:any){return {signature:'0xsig',scheme:'exact',timestamp:Date.now(),context:c};}, async submit(){throw new Error('no legacy submit');}, async observeSettlement(){return {settled:false,reason:'UNUSED'};} });
const sec = new Secretariat({ evidenceStore: logged, signer: { signerType:'S', async getAddress(){return '0xP';}, async signPayment(_r:any,c:any){return {operationId:c.operationId,signerType:'S',payer:'0xP',nonce:c.nonce,signature:'0xsig',signedAt:new Date().toISOString()};} }, adapters, settlementAdapter: fac, reconciliationEngine: recon, atomicSettlementHandoff: logged });
try {
  const res = await sec.execute({ target: gw.url, method:'POST', payload:{probe:'p5'}, policy: { maxPrice:'1000000', allowedNetworks:['base-sepolia'], allowedAssets:['0x83358AFC21F91A7B8E0BEC6AC3BC3A7C0D33BD01'], authorizationMode:'policy-bound' }, requestId:'a1s-probe5-v1', clientId:'argus-a1s-probe5' });
  console.log('STATUS', res.status, 'PAY', (res as any).paymentStatus, 'EXEC', (res as any).executionStatus);
  console.log('RESULT ERROR FIELD:', JSON.stringify((res as any).error));
} catch (e: any) { console.log('THROWN STACK:', e.stack?.split('\n').slice(0,6).join('\n')); }
gw.server.close(); await pool.end(); process.exit(0);
