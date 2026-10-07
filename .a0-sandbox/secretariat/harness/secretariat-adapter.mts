/**
 * A1-S: Secretariat-backed target adapter for the canonical Argus pipeline.
 *
 * This file is SANDBOX TEST-HARNESS ONLY. It does not modify Argus core,
 * ScenarioEngine, EvidenceCollector, AssertionEngine or any S1-S9 scenario.
 *
 * Topology under test (per task contract):
 *   Argus (client-1) --AgentTargetPort--> Zeus Secretariat (sut-1)
 *        Secretariat --HTTP--> subject mock gateway (resource-server role,
 *        reaction profile of ClawRouter / Franklin / BlockRun boundary)
 *
 * The Secretariat instance is wired with PG-backed durable stores so that
 * every economic step it takes lands in zeus_secretariat_sandbox DB.
 */
import { Pool } from 'pg';
import type {
  AgentTargetPort,
  TargetConnectionConfig,
  ConnectionResult,
  Exchange,
  Evidence as ArgusEvidence,
  RunId,
} from '../../../src/core/AgentTargetPort.ts';
import { MessageDirection, ExchangeStatus } from '../../../src/core/AgentTargetPort.ts';

let idc = 0;
const gid = (p: string) => `${p}_${Date.now()}_${(idc++).toString(36)}`;

export interface SecretariatAdapterOptions {
  pool: Pool;
  /** base URL of the subject-mock gateway (Secretariat's downstream seller) */
  gatewayUrl: string;
  subjectName: string;
  scenarioCode: string;
  /** factory returning a FRESH Secretariat instance per run (clean state) */
  createSecretariat: (opts: { pool: Pool; gatewayUrl: string }) => Promise<{
    execute(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  }>;
  /** optional per-scenario fault config passed into execute input */
  extraInput?: Record<string, unknown>;
}

export class SecretariatBackedAdapter implements AgentTargetPort {
  private id = gid('sec_adapter');
  private connected = false;
  private exchanges: Exchange[] = [];
  private evidences: ArgusEvidence[] = [];
  private opts: SecretariatAdapterOptions;
  private secretariat?: { execute(input: Record<string, unknown>): Promise<Record<string, unknown>> };

  constructor(opts: SecretariatAdapterOptions) {
    this.opts = opts;
  }

  getId(): string { return this.id; }
  getTargetType(): string { return 'zeus-secretariat'; }

  async connect(_config: TargetConnectionConfig): Promise<ConnectionResult> {
    this.secretariat = await this.opts.createSecretariat({
      pool: this.opts.pool,
      gatewayUrl: this.opts.gatewayUrl,
    });
    this.connected = true;
    return { success: true, connectionId: gid('conn') };
  }

  isConnected(): boolean { return this.connected; }

  async send(runId: RunId, type: string, payload?: unknown): Promise<Exchange> {
    if (!this.connected || !this.secretariat) throw new Error('not connected');
    const p = (payload ?? {}) as Record<string, unknown>;
    const started = Date.now();
    let status = ExchangeStatus.SUCCESS;
    let responsePayload: Record<string, unknown> = {};
    const observations: string[] = [];

    try {
      const result = await this.secretariat.execute({
        ...p,
        ...(this.opts.extraInput ?? {}),
      });
      responsePayload = result;
      // Map Secretariat terminal state to observations (facts returned by
      // the Secretariat itself — no invented semantics).
      const st = String((result as any).status ?? (result as any).state ?? 'unknown');
      observations.push(`secretariat_terminal_state_${st.toLowerCase()}`);
      if ((result as any).paymentIntent) observations.push('payment_intent_recorded');
      if ((result as any).settlement) observations.push(`settlement_${String((result as any).settlement).toLowerCase()}`);
      if ((result as any).executionId) observations.push('execution_id_returned');
      if ((result as any).delivery) observations.push(`delivery_${String((result as any).delivery).toLowerCase()}`);
      if (st === 'UNKNOWN' || st === 'RECONCILING') status = ExchangeStatus.UNKNOWN;
      else if (st === 'FAILED' || st === 'FAILURE') status = ExchangeStatus.FAILURE;
      else if (st === 'TIMEOUT') status = ExchangeStatus.TIMEOUT;
    } catch (err) {
      status = ExchangeStatus.FAILURE;
      observations.push('secretariat_call_threw');
      responsePayload = { error: err instanceof Error ? err.message : String(err) };
    }

    const exchange: Exchange = {
      id: gid('exch'),
      runId,
      direction: MessageDirection.OUTBOUND,
      type,
      timestamp: started,
      payload: responsePayload,
      status,
      metadata: {
        observations,
        participantId: 'sut-1',
        subject: this.opts.subjectName,
        scenario: this.opts.scenarioCode,
        durationMs: Date.now() - started,
      },
    };
    this.exchanges.push(exchange);
    return exchange;
  }

  async receive(runId: RunId, type: string, payload?: unknown): Promise<Exchange> {
    const exchange: Exchange = {
      id: gid('exch'), runId, direction: MessageDirection.INBOUND, type,
      timestamp: Date.now(), payload: payload ?? {}, status: ExchangeStatus.SUCCESS,
    };
    this.exchanges.push(exchange);
    return exchange;
  }

  async captureEvidence(runId: RunId, type: string, data: unknown, description?: string): Promise<ArgusEvidence> {
    const e: ArgusEvidence = { id: gid('evid'), runId, type, timestamp: Date.now(), data, description };
    this.evidences.push(e);
    return e;
  }

  async disconnect(): Promise<void> { this.connected = false; }
  getExchanges(): Exchange[] { return [...this.exchanges]; }
}
