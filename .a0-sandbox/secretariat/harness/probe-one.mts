process.env.TZ='UTC';
import { Pool } from 'pg';
const pool = new Pool({ host:'localhost', port:5433, user:'postgres', password:'zeus_sandbox_pw', database:'zeus_secretariat_sandbox' });
const { PgDurableStore } = await import('/workspace/.a0-sandbox/secretariat/harness/pg-store.mts');
const store:any = new PgDurableStore(pool,'probe','P1');
try {
  const r = await store.getOperationByClientAndRequestId('x','y');
  console.log('direct call OK ->', r);
} catch(e){ console.log('direct FAIL:', e); }
// detached invocation
const fn = store.getOperationByClientAndRequestId;
try {
  const r2 = await fn('x','y');
  console.log('detached OK ->', r2);
} catch(e){ console.log('detached FAIL:', (e as Error).message); }
await pool.end();
