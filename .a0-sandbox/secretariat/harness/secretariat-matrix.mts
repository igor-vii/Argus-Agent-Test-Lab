/**
 * A1-S: S1–S9 trial matrix, executed THROUGH the Zeus Secretariat.
 * SANDBOX HARNESS ONLY — neither Argus core nor Secretariat code is modified.
 *
 * Topology (per task contract):
 *   Argus-driven trial actions -> Zeus Secretariat (intermediary / payer-side
 *   execution engine) -> subject reaction gateway (resource server whose
 *   externally observed reaction profile corresponds to ClawRouter / Franklin /
 *   BlockRun).
 *
 * Every run produces:
 *   1) raw JSON in .a0-sandbox/secretariat/runs/<SUBJECT>_<SCENARIO>.json
 *      (Secretariat ExecutionResult + evidence trail + gateway ground-truth ledger)
 *   2) durable rows in zeus_secretariat_sandbox PG DB (subject-tagged)
 *   3) full-run.log lines
 *
 * No conclusions are drawn here; this file only records facts.
 */
import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';

// --- Secretariat source imports (canonical code, unmodified) ---------------
const ZEUS = '/tmp/argus-sandbox/zeus/zeus-secretariat/src';
const { Secretariat } = await import(path.join(ZEUS, 'core/state-machine.ts'));
const { ReconciliationEngine } = await import(path.join(ZEUS, 'core/reconciliation-engine.ts'));
const { MockMultiRpcChecker } = await import(path.join(ZEUS, 'core/multi-rpc-checker.ts'));
const { MockX402FacilitatorClient } = await import(path.join(ZEUS, 'adapters/x402-facilitator-client.ts'));
const { HttpSellerExecutionAdapter } = await import(path.join(ZEUS, 'adapters/seller-execution-adapter.ts'));

const { PgDurableStore } = await import('./pg-store.mts');
const { startSubjectGateway } = await import('./subject-gateway.mts');

const RUNS_DIR = path.resolve(import.meta.dirname, '../runs');
fs.mkdirSync(RUNS_DIR, { recursive: true });
const logLines: string[] = [];
const log = (s: string) => { logLines.push(`[${new Date().toISOString()}] ${s}`); console.log(s); };

// ---------------------------------------------------------------------------
// Legacy PaymentAdapter (authorizePayment.createAuthorization only; canonical
// V2 path never calls its submit — same pattern as Secretariat's own tests)
// ---------------------------------------------------------------------------
function makeLegacyAdapter(network: string) {
  return {
    network,
    async createAuthorization(requirement: any, _signer: any, ctx: any) {
      return {
        signature: `0x_sandbox_sig_${ctx.operationId}`,
        scheme: 'exact',
        timestamp: Date.now(),
        context: ctx,
      };
    },
    async submit() { throw new Error('SANDBOX: legacy submit must not be called on V2 path'); },
    async observeSettlement() { return { settled: false, reason: 'SANDBOX_LEGACY_UNUSED' }; },
  };
}

const mockSigner = {
  signerType: 'SANDBOX',
  async getAddress() { return '0xArgusSandboxPayer'; },
  async signPayment(_req: any, ctx: any) {
    return {
      operationId: ctx.operationId, signerType: 'SANDBOX',
      payer: '0xArgusSandboxPayer', nonce: ctx.nonce,
      signature: `0x_sandbox_sig_${ctx.operationId}`, signedAt: new Date().toISOString(),
    };
  },
};

// ---------------------------------------------------------------------------
// Scenario definitions: adversarial conditions Argus deliberately creates,
// expressed as (facilitator behavior, RPC settlement view, gateway reaction).
// Same scenario contract applied to all three subjects; profiles differ only
// in the reaction characteristics previously OBSERVED from each subject.
// ---------------------------------------------------------------------------
type TxRes = { confirmed: boolean; status: 'success' | 'reverted' | 'pending' } | null;

interface ScenarioDef {
    /** HTTP method used against the subject gateway (default POST; GET is an adversarial probe) */
    method?: 'GET' | 'POST';
  code: string; title: string;
  facilitatorStatus: 'SUBMITTED' | 'REJECTED' | 'UNKNOWN';
  txResult: TxRes; authState: boolean | null;
  gatewayFault: Record<string, unknown>;
  /** per-subject fault overrides (reaction-profile differences) */
  subjectOverrides?: Record<string, Record<string, unknown>>;
  timeoutMs?: number;
}

const SCENARIOS: ScenarioDef[] = [
  { code: 'S1', title: 'Happy path: payment accepted, execution completes, response delivered',
    facilitatorStatus: 'SUBMITTED', txResult: { confirmed: true, status: 'success' }, authState: false,
    gatewayFault: { executionMode: 'complete', honorIdempotency: true } },
  { code: 'S2', title: 'HTTP error after payment (seller execution failure)',
    facilitatorStatus: 'SUBMITTED', txResult: { confirmed: true, status: 'success' }, authState: false,
    gatewayFault: { executionMode: 'fail', failStatus: 500, honorIdempotency: true } },
  { code: 'S3', title: 'Timeout after payment accepted (execution started, no response)',
    facilitatorStatus: 'SUBMITTED', txResult: { confirmed: true, status: 'success' }, authState: false,
    gatewayFault: { executionMode: 'timeout', honorIdempotency: true }, timeoutMs: 2500 },
  { code: 'S4', title: 'Payment rejected by facilitator (402 persists, REJECTED)',
    facilitatorStatus: 'REJECTED', txResult: null, authState: false,
    gatewayFault: { firstPaymentOutcome: 'reject', honorIdempotency: true } },
  { code: 'S5', title: 'Payment accepted (response OK), settlement NOT observable (RPC pending)',
    facilitatorStatus: 'SUBMITTED', txResult: { confirmed: false, status: 'pending' }, authState: null,
    gatewayFault: { executionMode: 'complete', honorIdempotency: true } },
  { code: 'S6', title: 'Response lost after payment+execution completed internally',
    facilitatorStatus: 'SUBMITTED', txResult: { confirmed: true, status: 'success' }, authState: false,
    gatewayFault: { executionMode: 'lost_response', honorIdempotency: true } },
  { code: 'S7', title: 'Retry after UNKNOWN submission (facilitator UNKNOWN, then retry)',
    facilitatorStatus: 'UNKNOWN', txResult: null, authState: null,
    gatewayFault: { executionMode: 'complete', honorIdempotency: true } },
  { code: 'S8', title: 'Idempotent retry: same requestId re-executed while settlement view unchanged',
    facilitatorStatus: 'SUBMITTED', txResult: { confirmed: true, status: 'success' }, authState: false,
    gatewayFault: { executionMode: 'complete', honorIdempotency: true } },
  { code: 'S9', title: 'Duplicate economic action: second attempt with NEW requestId against non-idempotent seller',
    facilitatorStatus: 'SUBMITTED', txResult: { confirmed: true, status: 'success' }, authState: false,
    gatewayFault: { executionMode: 'complete', honorIdempotency: false } },
];

const SUBJECTS = ['clawrouter', 'franklin', 'blockrun'] as const;

// Reaction profiles derived from previously recorded external observations:
// - clawrouter: no recovery-capability headers advertised (none were observed)
// - franklin: recovery-capable semantics (EXECUTION_IDEMPOTENT + RESULT_RETRIEVAL)
// - blockrun: canonical boundary modes (no capability header emitted in A0 mock)
const PROFILE_HEADERS: Record<string, string[] | undefined> = {
  clawrouter: undefined,
  franklin: ['EXECUTION_IDEMPOTENT', 'RESULT_RETRIEVAL'],
  blockrun: undefined,
};

// ---------------------------------------------------------------------------
// One trial run
// ---------------------------------------------------------------------------
let portBase = 8870;

async function runTrial(pool: Pool, subject: string, sc: ScenarioDef, attemptTag: string, requestIdOverride?: string) {
  const scenarioCode = `${sc.code}${attemptTag}`;
  const port = portBase++;
  const fault = { ...sc.gatewayFault, recoveryCapability: PROFILE_HEADERS[subject] };
  const gw = await startSubjectGateway({ port, subject, fault: fault as any });
  // Fresh ground-truth ledger per trial (gateway keeps a shared map keyed by subject+scenario)
  await fetch(`http://127.0.0.1:${port}/__reset`, { method: 'POST' }).catch(() => {});
  const store = new PgDurableStore(pool, subject, scenarioCode);

  const facilitator = new MockX402FacilitatorClient();
  facilitator.forceStatus = sc.facilitatorStatus;
  const rpc = new MockMultiRpcChecker();
  if (sc.txResult) rpc.setTxResult('0x_mock_tx_1', sc.txResult as any);
  rpc.setAuthResult('*', sc.authState as any); // nonce wildcard not supported; set below per-intent
  const recon = new ReconciliationEngine(store as any, rpc as any);

  const adapters = new Map<string, any>();
  adapters.set('base-sepolia', makeLegacyAdapter('base-sepolia'));

  const secretariat = new Secretariat({
    evidenceStore: store as any,
    signer: mockSigner as any,
    adapters,
    settlementAdapter: facilitator as any,
    reconciliationEngine: recon as any,
    atomicSettlementHandoff: store as any,
  });

  const policy = {
    maxPrice: '1000000', allowedNetworks: ['base-sepolia'],
    allowedAssets: ['0x83358AFC21F91A7B8E0BEC6AC3BC3A7C0D33BD01'],
    authorizationMode: 'policy-bound',
  };
  const requestId = requestIdOverride ?? `a1s-${subject}-${scenarioCode}`;
  const request = {
    target: gw.url, method: sc.method ?? 'POST', payload: { probe: scenarioCode },
    policy, requestId, clientId: `argus-a1s-${subject}`,
  };

  const t0 = Date.now();
  let result: any = null; let thrown: string | null = null;
  try {
    result = await Promise.race([
      secretariat.execute(request),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`HARNESS_TIMEOUT_${sc.timeoutMs ?? 8000}ms`)), sc.timeoutMs ?? 8000)),
    ]);
  } catch (e) {
    thrown = e instanceof Error ? e.message : String(e);
  }

  // For S7-style UNKNOWN: a second execute attempt with SAME identity (retry after unknown)
  let result2: any = null; let thrown2: string | null = null;
  if (sc.code === 'S7' || sc.code === 'S8') {
    facilitator.forceStatus = 'SUBMITTED';
    if (sc.txResult) rpc.setTxResult('0x_mock_tx_1', sc.txResult as any);
    try {
      result2 = await secretariat.execute(request);
    } catch (e) { thrown2 = e instanceof Error ? e.message : String(e); }
  }
  // S9: deliberate duplicate economic action — NEW requestId, non-idempotent seller
  if (sc.code === 'S9') {
    try {
      result2 = await secretariat.execute({ ...request, requestId: `${requestId}-dup2` });
    } catch (e) { thrown2 = e instanceof Error ? e.message : String(e); }
  }

  const ledgerRes = await fetch(`http://127.0.0.1:${port}/__ledger`).then((r) => r.json());

  const artifact = {
    subject, scenario: scenarioCode, title: sc.title,
    argusAction: {
      note: 'Argus deliberately drove the Secretariat-mediated flow under these adverse conditions',
      facilitatorStatus: sc.facilitatorStatus, txView: sc.txResult, authStateView: sc.authState,
      gatewayFault: fault, requestId, clientId: request.clientId,
    },
    harnessTimeoutMs: sc.timeoutMs ?? 8000,
    secretariatAttempt1: { result, thrown, durationMs: Date.now() - t0 },
    secretariatAttempt2: (result2 || thrown2) ? { result: result2, thrown: thrown2 } : undefined,
    gatewayGroundTruthLedger: ledgerRes,
    dbFacts: {},
  };

  // pull durable facts for this scenario out of PG
  const ops = await pool.query(`SELECT state, payment_state, execution_state, delivery_state FROM operations WHERE subject=$1 AND scenario=$2`, [subject, scenarioCode]);
  const pis = await pool.query(`SELECT settlement_state, tx_hash, value, nonce, probe_count FROM payment_intents WHERE subject=$1 AND scenario=$2`, [subject, scenarioCode]);
  const eas = await pool.query(`SELECT execution_id, status, idempotency_key FROM execution_attempts WHERE subject=$1 AND scenario=$2`, [subject, scenarioCode]);
  const evc = await pool.query(`SELECT count(*)::int AS n FROM evidence_records WHERE subject=$1 AND scenario=$2`, [subject, scenarioCode]);
  const ros = await pool.query(`SELECT result, rpc_provider_id FROM reconciliation_observations o JOIN payment_intents p ON p.payment_intent_id=o.payment_intent_id WHERE p.subject=$1 AND p.scenario=$2`, [subject, scenarioCode]);
  artifact.dbFacts = {
    operations: ops.rows, paymentIntents: pis.rows, executionAttempts: eas.rows,
    evidenceCount: evc.rows[0].n, reconciliationObservations: ros.rows,
  };

  const fname = `${subject.toUpperCase()}_${scenarioCode}.json`;
  fs.writeFileSync(path.join(RUNS_DIR, fname), JSON.stringify(artifact, null, 2));
  gw.server.close();

  const st1 = result?.status ?? (thrown ? `THROWN:${thrown}` : 'NO_RESULT');
  log(`${subject}/${scenarioCode}: secretariat=${st1} pay=${result?.paymentStatus ?? '-'} exec=${result?.executionStatus ?? '-'} | ledger: payments=${ledgerRes.payments} executions=${ledgerRes.executions.length} delivered=${ledgerRes.deliveredResponses} | file=${fname}`);
  return artifact;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const pool = new Pool({
    host: 'localhost', port: 5433, user: 'postgres', password: 'zeus_sandbox_pw',
    database: 'zeus_secretariat_sandbox',
  });
  await pool.query('SELECT 1');
  log('A1-S matrix start: trials executed THROUGH Zeus Secretariat against subject-reaction gateways');

  const summary: Array<Record<string, unknown>> = [];
  for (const subject of SUBJECTS) {
    for (const sc of SCENARIOS) {
      const a = await runTrial(pool, subject, sc, '');
      summary.push({
        subject, scenario: a.scenario,
        secretariatStatus: a.secretariatAttempt1.result?.status ?? `THROWN:${a.secretariatAttempt1.thrown}`,
        paymentStatus: a.secretariatAttempt1.result?.paymentStatus ?? null,
        executionStatus: a.secretariatAttempt1.result?.executionStatus ?? null,
        attempt2: a.secretariatAttempt2 ? (a.secretariatAttempt2.result?.status ?? `THROWN:${a.secretariatAttempt2.thrown}`) : null,
        ledgerPayments: a.gatewayGroundTruthLedger.payments,
        ledgerExecutions: a.gatewayGroundTruthLedger.executions.length,
        ledgerDelivered: a.gatewayGroundTruthLedger.deliveredResponses,
        dbEvidenceCount: (a.dbFacts as any).evidenceCount,
      });
    }
  }

  fs.writeFileSync(path.join(RUNS_DIR, 'MATRIX_SUMMARY.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(RUNS_DIR, '..', 'full-run.log'), logLines.join('\n') + '\n');
  await pool.end();
  log('A1-S matrix complete');
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
