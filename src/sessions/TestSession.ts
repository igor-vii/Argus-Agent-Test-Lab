/**
 * TestSession — Mode A MVP vertical slice.
 *
 * In-memory session for testing an external BUYER agent.
 * Argus acts as ephemeral RESOURCE_SERVER / SELLER.
 *
 * B6 scope: create session, generate endpoint, collect evidence, produce verdict.
 * No database. No persistence. No multi-tenant isolation.
 */

import { randomUUID } from 'crypto';

export type TestMode = 'BUYER' | 'SELLER';
export type SessionStatus = 'ACTIVE' | 'COMPLETED' | 'EXPIRED';
export type VerdictStatus = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface SessionEvidence {
  session_id: string;
  timestamp: number;
  direction: 'inbound' | 'outbound';
  method: string;
  path: string;
  status_code?: number;
  headers: Record<string, string>;
  payment_validation_result?: 'valid' | 'invalid' | 'not_present';
  body_summary?: string;
}

export interface SessionResult {
  session_id: string;
  test_mode: TestMode;
  test_profile: string;
  verdict: VerdictStatus;
  summary: string;
  interactions: SessionEvidence[];
  created_at: number;
  completed_at?: number;
}

export interface CreateSessionRequest {
  test_mode: TestMode;
  test_profile: string;
  timeout_seconds?: number;
  max_interactions?: number;
}

export class TestSession {
  readonly session_id: string;
  readonly test_mode: TestMode;
  readonly test_profile: string;
  readonly created_at: number;
  readonly expires_at: number;
  readonly max_interactions: number;
  private readonly timeout_seconds: number;

  private _status: SessionStatus = 'ACTIVE';
  private _evidence: SessionEvidence[] = [];
  private _payment_received = false;
  private _payment_valid = false;

  constructor(req: CreateSessionRequest) {
    this.session_id = randomUUID();
    this.test_mode = req.test_mode;
    this.test_profile = req.test_profile;
    this.created_at = Date.now();
    this.timeout_seconds = req.timeout_seconds ?? 60;
    this.expires_at = this.created_at + this.timeout_seconds * 1000;
    this.max_interactions = req.max_interactions ?? 10;
  }

  get status(): SessionStatus {
    return this._status;
  }

  get evidence(): ReadonlyArray<SessionEvidence> {
    return this._evidence;
  }

  get isExpired(): boolean {
    return Date.now() >= this.expires_at;
  }

  get isComplete(): boolean {
    return this._status !== 'ACTIVE';
  }

  /**
   * Record an inbound interaction from the external BUYER SUT.
   */
  recordInteraction(ev: Omit<SessionEvidence, 'session_id'>): void {
    if (this._status !== 'ACTIVE') return;
    if (this._evidence.length >= this.max_interactions) {
      this.complete();
      return;
    }
    this._evidence.push({ ...ev, session_id: this.session_id });
  }

  /**
   * Mark that a PAYMENT-SIGNATURE was received and validated.
   */
  markPaymentReceived(valid: boolean): void {
    this._payment_received = true;
    this._payment_valid = valid;
  }

  /**
   * Complete the session and compute verdict.
   */
  complete(): SessionResult {
    if (this._status !== 'ACTIVE') {
      return this.getResult();
    }
    this._status = 'COMPLETED';
    return this.getResult();
  }

  /**
   * Check expiry and auto-complete if expired.
   */
  checkExpiry(): void {
    if (this._status === 'ACTIVE' && this.isExpired) {
      this._status = 'EXPIRED';
    }
  }

  /**
   * Compute verdict from collected evidence.
   *
   * - Valid payment received -> PASS
   * - Invalid payment or protocol violation -> FAIL
   * - Insufficient evidence (timeout, no interaction) -> UNKNOWN
   */
  getResult(): SessionResult {
    const hasInbound = this._evidence.some(e => e.direction === 'inbound');

    let verdict: VerdictStatus;
    let summary: string;

    if (this._payment_received && this._payment_valid) {
      verdict = 'PASS';
      summary = 'Valid payment signature received and accepted.';
    } else if (this._payment_received && !this._payment_valid) {
      verdict = 'FAIL';
      summary = 'Payment signature received but validation failed.';
    } else if (hasInbound && !this._payment_received) {
      verdict = 'UNKNOWN';
      summary = 'SUT interacted but no valid payment signature received.';
    } else {
      verdict = 'UNKNOWN';
      summary = this._status === 'EXPIRED'
        ? 'Session expired without sufficient evidence.'
        : 'No interactions recorded.';
    }

    return {
      session_id: this.session_id,
      test_mode: this.test_mode,
      test_profile: this.test_profile,
      verdict,
      summary,
      interactions: [...this._evidence],
      created_at: this.created_at,
      completed_at: Date.now(),
    };
  }

  /**
   * Generate the session endpoint URL path.
   */
  getEndpointPath(): string {
    return `/sessions/${this.session_id}/resource`;
  }
}
