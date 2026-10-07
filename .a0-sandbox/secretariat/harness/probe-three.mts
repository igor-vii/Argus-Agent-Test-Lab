import { Pool } from 'pg';
const pool = new Pool({ host:'localhost', port:5433, user:'postgres', password:'zeus_sandbox_pw', database:'zeus_secretariat_sandbox' });
const path = await import('node:path');
const ZEUS = '/tmp/argus-sandbox/zeus/zeus-secretariat/src';
const { Secretariat } = await import(path.join(ZEUS, 'core/state-machine.ts'));
const { PgDurableStore } = await import('./pg-store.mts');
const store: any = new PgDurableStore(pool, 'probe3', 'P3');
// instrument every prototype method: log name + this-defined at entry
const proto = Object.getPrototypeOf(store.__proto__ ?? store);
let count = 0;
for (const p of [store]) { /* proxy wraps; instead wrap via monkey test below */ }
// direct check: call each durable method the facilitator uses
for (const m of ['getPaymentIntentByOperationId','transitionToSubmitting','updatePaymentIntentStatus','markNonceSubmitted','recordSubmissionResult','compareAndSetState']) {
  try { const r = await store[m]('__nonexistent__', 'X' as any); console.log('OK ', m, JSON.stringify(r)); }
  catch (e: any) { console.log('ERR', m, e.message); }
}
await pool.end(); process.exit(0);
