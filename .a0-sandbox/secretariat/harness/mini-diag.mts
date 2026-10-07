// minimal single-trial reproduction of the matrix failure, with stack capture
import { Pool } from 'pg';
const origErr = console.error;
let caught: any = null;
process.on('unhandledRejection', (e) => { caught = e; });
const ZEUS = '/tmp/argus-sandbox/zeus/zeus-secretariat/src';
const path = await import('node:path');
const pool = new Pool({ host:'localhost', port:5433, user:'postgres', password:'zeus_sandbox_pw', database:'zeus_secretariat_sandbox' });
await pool.query('SELECT 1');
const { PgDurableStore } = await import('/workspace/.a0-sandbox/secretariat/harness/pg-store.mts');
const store: any = new PgDurableStore(pool, 'blockrun', 'S1DIAG');
console.log('pool instanceof Pool:', pool instanceof Pool, '| ownPool:', !!store.__ownPool);
// monkey-patch pg Client to see who reads _pool? Instead wrap all store methods to log errors w/ stack:
for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(store.__proto__ ?? {}))) {} 
const target = store; // proxy
async function callAll() {
  const names = ['append','saveOperation','getOperationByClientAndRequestId','createPaymentIntent','getPaymentIntentByOperationId','transitionToSubmitting','markNonceSubmitted','recordSubmissionResult','compareAndSetState','updatePaymentIntentStatus','settleAndCreateExecutionObligation'];
  for (const n of names) {
    try { await target[n]('x', {}, 'y'); console.log('direct', n, 'OK-ish'); }
    catch (e: any) { console.log('direct', n, 'ERR:', e.message); }
  }
}
await callAll();
await pool.end();
