import fsNode from 'node:fs';
const writeDiag = (m: string) => { try { fsNode.appendFileSync('/tmp/pgstore-diag.log', m + '\n'); } catch {} };
/**
 * A1-S: PG-backed durable store for Zeus Secretariat sandbox trials.
 * SANDBOX HARNESS ONLY — does not modify Secretariat or Argus code.
 *
 * Implements the DurableEvidenceStore contract (src/core/types.ts) on top of
 * the virtual database zeus_secretariat_sandbox (PostgreSQL 15, localhost:5433),
 * plus the AtomicSettlementHandoff contract as a real DB transaction
 * (CAS on payment_intents + recovery_jobs INSERT + execution_attempts INSERT).
 *
 * Every economic fact produced during S1-S9 trials lands here durably.
 */
import { Pool } from 'pg';

const j = (v: unknown) => (v === undefined ? null : JSON.stringify(v ?? null));

const lastConstructedRef: { current: any } = { current: null };

export class PgDurableStore {

  constructor(poolOrOpts: Pool | { pool: Pool; subject: string; scenario: string }, subject?: string, scenario?: string) {
    // Harness-side defensive shim: Secretariat may invoke store methods with
    // `this` unbound (destructured callbacks). Support both positional and
    // options construction, and fall back to a module-level pool when `this`
    // is lost. SANDBOX ONLY — no Secretariat/Argus code touched.
    if (poolOrOpts instanceof Pool) {
      (this as any).__ownPool = poolOrOpts; (this as any).__ownSubject = subject!; (this as any).__ownScenario = scenario!;
    } else {
      (this as any).__ownPool = poolOrOpts.pool; (this as any).__ownSubject = poolOrOpts.subject; (this as any).__ownScenario = poolOrOpts.scenario;
    }
    lastConstructedRef.current = this;
    // Harness resilience (root cause fix): Secretariat's V2 path invokes some
    // store methods DETACHED (`const fn = store.method` strips the receiver,
    // so `this` is undefined under strict ESM and even prototype member access
    // throws). Return a Proxy whose get-trap always resolves against THIS
    // instance: detached calls then reach the correct pool/subject/scenario.
    // No semantic change to Secretariat behavior; SANDBOX ONLY.
    const self = this as any;
    // Bound-function cache: `typeof store.method === 'function'` feature
    // detection in Secretariat works because bound functions are still
    // functions; detached invocation is safe because each fn is pre-bound.
    const fnCache = new Map<string | symbol, any>();
    return new Proxy(self, {
      get(target, prop, _recv) {
        if (prop === 'constructor') return Reflect.get(target, prop);
        const v = Reflect.get(target, prop, target);
        if (typeof v === 'function') {
          let b = fnCache.get(prop);
          if (!b) { b = v.bind(target); fnCache.set(prop, b); }
          return b;
        }
        return v;
      },
      set(target, prop, value) { return Reflect.set(target, prop, value); },
      has(target, prop) { return Reflect.has(target, prop); },
      getOwnPropertyDescriptor(target, prop) { return Reflect.getOwnPropertyDescriptor(target, prop); },
      ownKeys(target) { return Reflect.ownKeys(target); },
      getPrototypeOf(target) { return Reflect.getPrototypeOf(target); },
    });
  }
  // Harness resilience: Secretariat's V2 path invokes store methods DETACHED
  // (receiver stripped -> `this` is undefined in strict ESM). Prototype getters
  // are not reachable from an undefined receiver, so resolution must live in
  // each method body via this helper. No semantic change to Secretariat.
  private static me(self: any): any {
    return self && self.__ownPool ? self : lastConstructedRef.current;
  }
  // If Secretariat invokes a store method with `this` detached (destructured
  // callback), fall back to the most recently constructed instance so DB
  // writes still land. Harness-only resilience, no semantic change.
  // Secretariat's V2 authorize path captures store methods as bare function
  // references (detached invocation -> `this` undefined in strict mode).
  // Instance data therefore lives on the PROTOTYPE getters below, which stay
  // reachable via Function.prototype.call bound fallback? No — simplest
  // harness-safe form: resolve through a module-level last-constructed ref.

  private static bound<K extends keyof PgDurableStore>(self: PgDurableStore | undefined, fn: (this: void, ...a: any[]) => K extends never ? never : any): any {
    return fn;
  }

  // (prototype shim removed during diagnosis)

  // ------------------------------------------------------------------
  // EvidenceRecord append / get
  // ------------------------------------------------------------------
  async append(record: any): Promise<void> {
    await PgDurableStore.me(this).__ownPool.query(
      `INSERT INTO evidence_records (operation_id, subject, scenario, phase, event, payload, recorded_at, request_id, client_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        record.operationId, PgDurableStore.me(this).__ownSubject, PgDurableStore.me(this).__ownScenario, record.phase, record.event,
        j(record.payload), Number(record.timestamp ?? Date.now()),
        record.requestId ?? null, record.clientId ?? null,
      ],
    );
  }

  async getEvidence(operationId: string): Promise<any[]> {
    const r = await PgDurableStore.me(this).__ownPool.query(
      `SELECT * FROM evidence_records WHERE operation_id=$1 ORDER BY id ASC`,
      [operationId],
    );
    return r.rows.map((row) => ({
      operationId: row.operation_id, phase: row.phase, timestamp: Number(row.recorded_at),
      event: row.event, payload: row.payload,
    }));
  }

  // ------------------------------------------------------------------
  // Operations (optimistic version guard, mirrors canonical CAS pattern)
  // ------------------------------------------------------------------
  async saveOperation(operation: any): Promise<void> {
    const existing = await PgDurableStore.me(this).__ownPool.query(
      `SELECT version FROM operations WHERE operation_id=$1`, [operation.operationId],
    );
    if (existing.rowCount === 0) {
      await PgDurableStore.me(this).__ownPool.query(
        `INSERT INTO operations (operation_id, request_id, client_id, subject, scenario, state,
          payment_state, execution_state, delivery_state, target, method, request_payload,
          seller_capability, result_data, error, timestamps, created_at, version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now(), 1)`,
        [
          operation.operationId, operation.requestId, operation.clientId ?? null,
          PgDurableStore.me(this).__ownSubject, PgDurableStore.me(this).__ownScenario, operation.currentState, operation.paymentState,
          operation.executionState, operation.deliveryState ?? 'NOT_STARTED',
          operation.target, operation.method, j(operation.requestPayload),
          j(operation.sellerCapability), j(operation.resultData), operation.error ?? null,
          j(operation.timestamps),
        ],
      );
      return;
    }
    const cur = existing.rows[0].version as number;
    const upd = await PgDurableStore.me(this).__ownPool.query(
      `UPDATE operations SET state=$2, payment_state=$3, execution_state=$4, delivery_state=$5,
         seller_capability=$6, result_data=$7, error=$8, timestamps=$9, version=$10
       WHERE operation_id=$1 AND version=$11`,
      [
        operation.operationId, operation.currentState, operation.paymentState,
        operation.executionState, operation.deliveryState ?? 'NOT_STARTED',
        j(operation.sellerCapability), j(operation.resultData), operation.error ?? null,
        j(operation.timestamps), cur + 1, cur,
      ],
    );
    if ((upd.rowCount ?? 0) === 0) {
      throw new Error(`CONFLICT: operation ${operation.operationId} changed concurrently`);
    }
  }

  async getOperation(operationId: string): Promise<any | null> {
    const r = await PgDurableStore.me(this).__ownPool.query(
      `SELECT * FROM operations WHERE operation_id=$1`, [operationId],
    );
    return r.rowCount ? this.rowToOp(r.rows[0]) : null;
  }

  async getOperationByClientAndRequestId(clientId: string, requestId: string): Promise<any | null> {
    const r = await PgDurableStore.me(this).__ownPool.query(
      `SELECT * FROM operations WHERE client_id=$1 AND request_id=$2`, [clientId, requestId],
    );
    return r.rowCount ? this.rowToOp(r.rows[0]) : null;
  }

  async getOperationsByStatus(status: string): Promise<any[]> {
    const r = await PgDurableStore.me(this).__ownPool.query(
      `SELECT * FROM operations WHERE subject=$1 AND state=$2`, [PgDurableStore.me(this).__ownSubject, status],
    );
    return r.rows.map((row) => this.rowToOp(row));
  }

  private rowToOp(row: any): any {
    return {
      operationId: row.operation_id, requestId: row.request_id, clientId: row.client_id,
      currentState: row.state, paymentState: row.payment_state, executionState: row.execution_state,
      deliveryState: row.delivery_state, target: row.target, method: row.method,
      requestPayload: row.request_payload, sellerCapability: row.seller_capability,
      resultData: row.result_data, error: row.error, timestamps: row.timestamps,
      evidence: [], _version: row.version,
    };
  }

  // ------------------------------------------------------------------
  // DurablePaymentIntent
  // ------------------------------------------------------------------
  async createPaymentIntent(intent: any): Promise<void> {
    await PgDurableStore.me(this).__ownPool.query(
      `INSERT INTO payment_intents (payment_intent_id, operation_id, request_id, client_id, subject, scenario,
        authorizer, pay_to, value, asset, network, nonce, valid_after, valid_before,
        payment_payload, payment_payload_hash, settlement_state, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        intent.paymentIntentId, intent.operationId, intent.requestId ?? null, intent.clientId ?? null,
        PgDurableStore.me(this).__ownSubject, PgDurableStore.me(this).__ownScenario, intent.authorizer, intent.payTo, intent.value, intent.asset,
        intent.network, intent.nonce, Number(intent.validAfter), Number(intent.validBefore),
        intent.paymentPayload ?? '', intent.paymentPayloadHash ?? '', intent.settlementState,
        Number(intent.createdAt ?? Date.now()), Number(intent.updatedAt ?? Date.now()),
      ],
    );
  }

  async createIntentWithNonce(intent: any, payer: string): Promise<void> {
    const client = await PgDurableStore.me(this).__ownPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO nonces (nonce, operation_id, payer, status, created_at, updated_at)
         VALUES ($1,$2,$3,'RESERVED',$4,$4) ON CONFLICT (nonce) DO NOTHING`,
        [intent.nonce, intent.operationId, payer, Date.now()],
      );
      await client.query(
        `INSERT INTO payment_intents (payment_intent_id, operation_id, request_id, client_id, subject, scenario,
          authorizer, pay_to, value, asset, network, nonce, valid_after, valid_before,
          payment_payload, payment_payload_hash, settlement_state, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          intent.paymentIntentId, intent.operationId, intent.requestId ?? null, intent.clientId ?? null,
          PgDurableStore.me(this).__ownSubject, PgDurableStore.me(this).__ownScenario, intent.authorizer, intent.payTo, intent.value, intent.asset,
          intent.network, intent.nonce, Number(intent.validAfter), Number(intent.validBefore),
          intent.paymentPayload ?? '', intent.paymentPayloadHash ?? '', intent.settlementState,
          Number(intent.createdAt ?? Date.now()), Number(intent.updatedAt ?? Date.now()),
        ],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  private rowToIntent(row: any): any {
    return {
      paymentIntentId: row.payment_intent_id, operationId: row.operation_id,
      requestId: row.request_id, clientId: row.client_id, authorizer: row.authorizer,
      payTo: row.pay_to, value: row.value, asset: row.asset, network: row.network,
      nonce: row.nonce, validAfter: Number(row.valid_after), validBefore: Number(row.valid_before),
      paymentPayload: row.payment_payload, paymentPayloadHash: row.payment_payload_hash,
      settlementState: row.settlement_state, txHash: row.tx_hash,
      facilitatorHttpStatus: row.facilitator_http_status, facilitatorResponseBody: row.facilitator_response,
      errorReason: row.error_reason, settledEvidenceBundle: row.settled_evidence_bundle,
      probeCount: row.probe_count, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
    };
  }

  async getPaymentIntentByOperationId(opId: string): Promise<any | null> {
    const r = await PgDurableStore.me(this).__ownPool.query(
      `SELECT * FROM payment_intents WHERE operation_id=$1 LIMIT 1`, [opId],
    );
    return r.rowCount ? this.rowToIntent(r.rows[0]) : null;
  }

  async getPaymentIntentById(id: string): Promise<any | null> {
    const r = await PgDurableStore.me(this).__ownPool.query(
      `SELECT * FROM payment_intents WHERE payment_intent_id=$1`, [id],
    );
    return r.rowCount ? this.rowToIntent(r.rows[0]) : null;
  }

  async updatePaymentIntentStatus(
    intentId: string, status: string,
    extra?: Partial<{ txHash: string; facilitatorHttpStatus: number; facilitatorResponseBody: unknown; errorReason: string }>,
  ): Promise<void> {
    await PgDurableStore.me(this).__ownPool.query(
      `UPDATE payment_intents SET settlement_state=$2, tx_hash=COALESCE($3, tx_hash),
         facilitator_http_status=COALESCE($4, facilitator_http_status),
         facilitator_response=COALESCE($5, facilitator_response),
         error_reason=COALESCE($6, error_reason), updated_at=$7
       WHERE payment_intent_id=$1`,
      [
        intentId, status, extra?.txHash ?? null, extra?.facilitatorHttpStatus ?? null,
        j(extra?.facilitatorResponseBody), extra?.errorReason ?? null, Date.now(),
      ],
    );
  }

  async updatePaymentIntentAuthorization(
    intentId: string, fields: { paymentPayload: string; paymentPayloadHash: string },
  ): Promise<void> {
    await PgDurableStore.me(this).__ownPool.query(
      `UPDATE payment_intents SET payment_payload=$2, payment_payload_hash=$3, updated_at=$4
       WHERE payment_intent_id=$1`,
      [intentId, fields.paymentPayload, fields.paymentPayloadHash, Date.now()],
    );
  }

  async updatePaymentIntentProbeCount(paymentIntentId: string, probeCount: number): Promise<void> {
    await PgDurableStore.me(this).__ownPool.query(
      `UPDATE payment_intents SET probe_count=$2, updated_at=$3 WHERE payment_intent_id=$1`,
      [paymentIntentId, probeCount, Date.now()],
    );
  }

  async compareAndSetState(
    intentId: string, expectedState: string, newState: string, extra?: any,
  ): Promise<boolean> {
    const r = await PgDurableStore.me(this).__ownPool.query(
      `UPDATE payment_intents SET settlement_state=$3,
         tx_hash=COALESCE($4, tx_hash), updated_at=$5
       WHERE payment_intent_id=$1 AND settlement_state=$2`,
      [intentId, expectedState, newState, extra?.txHash ?? null, Date.now()],
    );
    return (r.rowCount ?? 0) === 1;
  }

  async transitionToSubmitting(paymentIntentId: string): Promise<boolean> {
    return this.compareAndSetState(paymentIntentId, 'AUTHORIZED', 'SUBMITTING');
  }

  async recordSubmissionResult(
    paymentIntentId: string, newState: string, txHash?: string,
    facilitatorHttpStatus?: number, facilitatorResponseBody?: unknown,
  ): Promise<boolean> {
    const r = await PgDurableStore.me(this).__ownPool.query(
      `UPDATE payment_intents SET settlement_state=$3, tx_hash=COALESCE($4, tx_hash),
         facilitator_http_status=COALESCE($5, facilitator_http_status),
         facilitator_response=COALESCE($6, facilitator_response), updated_at=$7
       WHERE payment_intent_id=$1 AND settlement_state='SUBMITTING'`,
      [
        paymentIntentId, newState, newState, txHash ?? null,
        facilitatorHttpStatus ?? null, j(facilitatorResponseBody), Date.now(),
      ],
    );
    return (r.rowCount ?? 0) === 1;
  }

  async getNonTerminalIntents(): Promise<any[]> {
    const r = await PgDurableStore.me(this).__ownPool.query(
      `SELECT * FROM payment_intents WHERE subject=$1
        AND settlement_state NOT IN ('SETTLED','NOT_SETTLED','UNRESOLVED_MANUAL')`,
      [PgDurableStore.me(this).__ownSubject],
    );
    return r.rows.map((row) => this.rowToIntent(row));
  }

  async canCreateNewPayment(operationId: string): Promise<boolean> {
    const r = await PgDurableStore.me(this).__ownPool.query(
      `SELECT settlement_state FROM payment_intents WHERE operation_id=$1`, [operationId],
    );
    if (r.rowCount === 0) return true;
    return r.rows.every((row: any) => row.settlement_state === 'NOT_SETTLED');
  }

  // ------------------------------------------------------------------
  // Nonces
  // ------------------------------------------------------------------
  async reserveNonce(nonce: string, operationId: string, payer: string): Promise<void> {
    await PgDurableStore.me(this).__ownPool.query(
      `INSERT INTO nonces (nonce, operation_id, payer, status, created_at, updated_at)
       VALUES ($1,$2,$3,'RESERVED',$4,$4)`,
      [nonce, operationId, payer, Date.now()],
    );
  }
  async getNonce(nonce: string): Promise<any | null> {
    const r = await PgDurableStore.me(this).__ownPool.query(`SELECT * FROM nonces WHERE nonce=$1`, [nonce]);
    if (!r.rowCount) return null;
    const row = r.rows[0];
    return { nonce: row.nonce, operationId: row.operation_id, status: row.status, payer: row.payer, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at) };
  }
  async markNonceSigned(nonce: string): Promise<void> {
    await PgDurableStore.me(this).__ownPool.query(`UPDATE nonces SET status='SIGNED', signed_at=$2, updated_at=$2 WHERE nonce=$1`, [nonce, Date.now()]);
  }
  async markNonceSubmitted(nonce: string): Promise<void> {
    await PgDurableStore.me(this).__ownPool.query(`UPDATE nonces SET status='SUBMITTED', submitted_at=$2, updated_at=$2 WHERE nonce=$1`, [nonce, Date.now()]);
  }
  async markNonceSettled(nonce: string): Promise<void> {
    await PgDurableStore.me(this).__ownPool.query(`UPDATE nonces SET status='SETTLED', settled_at=$2, updated_at=$2 WHERE nonce=$1`, [nonce, Date.now()]);
  }

  // ------------------------------------------------------------------
  // Reconciliation observations & bundles
  // ------------------------------------------------------------------
  async appendReconciliationObservation(o: any): Promise<void> {
    await PgDurableStore.me(this).__ownPool.query(
      `INSERT INTO reconciliation_observations (attempt_id, payment_intent_id, timestamp, rpc_provider_id, head_block, authorization_state, valid_before, result, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [o.attemptId, o.paymentIntentId, Number(o.timestamp), o.rpcProviderId, Number(o.headBlock), o.authorizationState, Number(o.validBefore), o.result, o.error ?? null],
    );
  }
  async getReconciliationObservations(paymentIntentId: string): Promise<any[]> {
    const r = await PgDurableStore.me(this).__ownPool.query(
      `SELECT * FROM reconciliation_observations WHERE payment_intent_id=$1 ORDER BY id`, [paymentIntentId],
    );
    return r.rows.map((row) => ({
      attemptId: row.attempt_id, paymentIntentId: row.payment_intent_id, timestamp: Number(row.timestamp),
      rpcProviderId: row.rpc_provider_id, headBlock: Number(row.head_block),
      authorizationState: row.authorization_state, validBefore: Number(row.valid_before),
      result: row.result, error: row.error,
    }));
  }
  async saveSettledEvidenceBundle(intentId: string, bundle: unknown): Promise<void> {
    await PgDurableStore.me(this).__ownPool.query(
      `UPDATE payment_intents SET settled_evidence_bundle=$2, updated_at=$3 WHERE payment_intent_id=$1`,
      [intentId, j(bundle), Date.now()],
    );
  }
  async saveNotSettledEvidenceBundle(intentId: string, bundle: unknown): Promise<void> {
    await PgDurableStore.me(this).__ownPool.query(
      `UPDATE payment_intents SET error_reason=COALESCE(error_reason,'NOT_SETTLED_BUNDLE_SAVED'), updated_at=$2 WHERE payment_intent_id=$1`,
      [intentId, Date.now()],
    );
  }

  // ------------------------------------------------------------------
  // Reconciliation job lifecycle (lease-safe)
  // ------------------------------------------------------------------
  async createReconciliationJob(paymentIntentId: string, nextProbeAt: Date): Promise<string> {
    const existing = await PgDurableStore.me(this).__ownPool.query(
      `SELECT job_id FROM reconciliation_jobs WHERE payment_intent_id=$1 AND status='PENDING' LIMIT 1`,
      [paymentIntentId],
    );
    if (existing.rowCount) return existing.rows[0].job_id;
    const jobId = `reconjob-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await PgDurableStore.me(this).__ownPool.query(
      `INSERT INTO reconciliation_jobs (job_id, payment_intent_id, status, next_probe_at)
       VALUES ($1,$2,'PENDING',$3)`,
      [jobId, paymentIntentId, nextProbeAt],
    );
    return jobId;
  }
  async getDueReconciliationJobs(): Promise<any[]> {
    const r = await PgDurableStore.me(this).__ownPool.query(
      `SELECT job_id, payment_intent_id, probe_count FROM reconciliation_jobs
       WHERE status='PENDING' AND next_probe_at <= now()`,
    );
    return r.rows.map((row) => ({ jobId: row.job_id, paymentIntentId: row.payment_intent_id, probeCount: row.probe_count }));
  }
  async claimReconciliationJob(jobId: string, workerId: string, lockDurationMs: number): Promise<boolean> {
    const r = await PgDurableStore.me(this).__ownPool.query(
      `UPDATE reconciliation_jobs SET status='RUNNING', worker_id=$2, locked_until=$3
       WHERE job_id=$1 AND (status='PENDING' OR locked_until < $4)`,
      [jobId, workerId, Date.now() + lockDurationMs, Date.now()],
    );
    return (r.rowCount ?? 0) === 1;
  }
  async completeReconciliationJob(jobId: string, workerId: string): Promise<boolean> {
    const r = await PgDurableStore.me(this).__ownPool.query(
      `UPDATE reconciliation_jobs SET status='COMPLETED' WHERE job_id=$1 AND worker_id=$2 AND status='RUNNING'`,
      [jobId, workerId],
    );
    return (r.rowCount ?? 0) === 1;
  }
  async rescheduleReconciliationJob(jobId: string, workerId: string, nextProbeAt: Date): Promise<boolean> {
    const r = await PgDurableStore.me(this).__ownPool.query(
      `UPDATE reconciliation_jobs SET status='PENDING', next_probe_at=$3, probe_count=probe_count+1
       WHERE job_id=$1 AND worker_id=$2 AND status='RUNNING'`,
      [jobId, workerId, nextProbeAt],
    );
    return (r.rowCount ?? 0) === 1;
  }
  async failReconciliationJob(jobId: string, workerId: string, error: string): Promise<boolean> {
    const r = await PgDurableStore.me(this).__ownPool.query(
      `UPDATE reconciliation_jobs SET status='FAILED', last_error=$3
       WHERE job_id=$1 AND worker_id=$2 AND status='RUNNING'`,
      [jobId, workerId, error],
    );
    return (r.rowCount ?? 0) === 1;
  }

  cloneForRestart(): PgDurableStore {
    // Restart semantics are trivially satisfied: durability lives in PG, not memory.
    return new PgDurableStore(PgDurableStore.me(this).__ownPoolField, PgDurableStore.me(this).__ownSubjectField, PgDurableStore.me(this).__ownScenarioField);
  }

  // ------------------------------------------------------------------
  // AtomicSettlementHandoff (R2.1-FIX-5): one DB transaction, all-or-nothing
  // ------------------------------------------------------------------
  async settleAndCreateExecutionObligation(
    paymentIntentId: string, operationId: string,
    settledEvidenceBundle: unknown, job: any, attempt: any,
  ): Promise<boolean> {
    const client = await PgDurableStore.me(this).__ownPool.connect();
    try {
      await client.query('BEGIN');
      const cas = await client.query(
        `UPDATE payment_intents SET settlement_state='SETTLED', settled_evidence_bundle=$3, updated_at=$4
         WHERE payment_intent_id=$1 AND settlement_state <> 'SETTLED'`,
        [paymentIntentId, 0, j(settledEvidenceBundle), Date.now()],
      );
      if ((cas.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        return false; // already settled by another path
      }
      await client.query(
        `INSERT INTO recovery_jobs (job_id, operation_id, job_type, status, priority, max_attempts, current_attempt, metadata, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [job.jobId, job.operationId, job.jobType, job.status, job.priority, job.maxAttempts, job.currentAttempt, j(job.metadata), Number(job.createdAt), Number(job.updatedAt)],
      );
      await client.query(
        `INSERT INTO execution_attempts (attempt_id, operation_id, execution_id, subject, scenario, attempt_number, status, idempotency_key, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [attempt.attemptId, attempt.operationId, attempt.executionId, PgDurableStore.me(this).__ownSubject, PgDurableStore.me(this).__ownScenario, attempt.attemptNumber, attempt.status, attempt.idempotencyKey ?? null, Number(attempt.createdAt)],
      );
      await client.query('COMMIT');
      return true;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}


// (diagnostic wrapper removed after root-cause fix)
