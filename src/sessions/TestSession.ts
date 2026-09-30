/**
 * TestSession — Mode A MVP vertical slice.
 *
 * In-memory session representation for testing an external BUYER agent.
 * Argus acts as ephemeral RESOURCE_SERVER / SELLER.
 *
 * PRINCIPLES:
 * - No database. State is in-memory only.
 * - No autonomous discovery. Role is declared by customer.
 * - Argus controls test conditions, NOT the SUT.
 */

export type TestMode = 'BUYER' | 'SELLER';
export type SessionStatus = 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'FAILED';
export type VerdictStatus = 'PASS' | 'FAIL' | 'UNKNOWN' | 'AMBIGUOUS' | 'DELIVERY_UNKNOWN';

export interface SessionEvidence {
  /** Unique evidence ID within this session */
  id: string;
  /** ISO timestamp */
  timestamp: string;
  /** Direction relative to Argus seller */
  direction: 'inbound' | 'outbound';
  /** HTTP method */
  method: string;
  /** Request path */
  path: string;
  /** HTTP status code returned by Argus */
  statusCode: number;
  /** Whether PAYMENT-REQUIRED was emitted */
  paymentRequiredEmitted: boolean;
  /** Whether PAYMENT-SIGNATURE was received */
  paymentSignatureReceived: boolean;
  /** Whether signature validation passed */
  paymentSignatureValid?: boolean;
  /** Validation error if signature was invalid */
  paymentValidationError?: string;
  /** Raw PAYMENT-SIGNATURE header value (Base64) */
  rawPaymentSignature?: string;
}

export interface SessionResult {
  sessionId: string;
  testMode: TestMode;
  testProfile: string;
  verdict: VerdictStatus;
  summary: string;
  interactions: SessionEvidence[];
  economicSummary: {
    paymentRequiredEmitted: boolean;
    paymentSignatureReceived: boolean;
    paymentSignatureValid: boolean;
    resourceDelivered: boolean;
  };
  startedAt: string;
  finishedAt: string;
}

export interface TestSession {
  sessionId: string;
  testMode: TestMode;
  testProfile: string;
  status: SessionStatus;
  sessionEndpoint: string;
  createdAt: number;
  expiresAt: number;
  evidence: SessionEvidence[];
  /** Fault profile for configurable seller behavior */
  faultProfile: 'none' | 'timeout' | 'malformed_response' | 'delivery_loss';
  /** Payment parameters for 402 response */
  paymentConfig: {
    scheme: string;
    network: string;
    amount: string;
    asset: string;
    payTo: string;
    maxTimeoutSeconds: number;
  };
}

let evidenceCounter = 0;

export function createSessionEvidence(
  direction: 'inbound' | 'outbound',
  method: string,
  path: string,
  statusCode: number,
  opts: Partial<SessionEvidence> = {}
): SessionEvidence {
  return {
    id: `ev_${evidenceCounter++}`,
    timestamp: new Date().toISOString(),
    direction,
    method,
    path,
    statusCode,
    paymentRequiredEmitted: opts.paymentRequiredEmitted ?? false,
    paymentSignatureReceived: opts.paymentSignatureReceived ?? false,
    ...opts,
  };
}

export function evaluateSessionVerdict(session: TestSession): SessionResult {
  const hasPaymentRequired = session.evidence.some(e => e.paymentRequiredEmitted);
  const hasSignature = session.evidence.some(e => e.paymentSignatureReceived);
  const hasValidSignature = session.evidence.some(e => e.paymentSignatureValid === true);
  const hasDelivery = hasValidSignature && session.status === 'COMPLETED';

  let verdict: VerdictStatus;
  let summary: string;

  if (session.evidence.length === 0) {
    verdict = 'UNKNOWN';
    summary = 'No interactions received before session expiry';
  } else if (hasValidSignature && hasDelivery) {
    verdict = 'PASS';
    summary = 'SUT correctly requested resource, submitted valid payment, and received resource';
  } else if (hasSignature && !hasValidSignature) {
    verdict = 'FAIL';
    summary = 'SUT submitted payment signature but validation failed';
  } else if (hasPaymentRequired && !hasSignature) {
    verdict = 'FAIL';
    summary = 'SUT received 402 but did not submit PAYMENT-SIGNATURE';
  } else {
    verdict = 'UNKNOWN';
    summary = 'Insufficient evidence to determine pass/fail';
  }

  return {
    sessionId: session.sessionId,
    testMode: session.testMode,
    testProfile: session.testProfile,
    verdict,
    summary,
    interactions: session.evidence,
    economicSummary: {
      paymentRequiredEmitted: hasPaymentRequired,
      paymentSignatureReceived: hasSignature,
      paymentSignatureValid: hasValidSignature,
      resourceDelivered: hasDelivery,
    },
    startedAt: new Date(session.createdAt).toISOString(),
    finishedAt: new Date().toISOString(),
  };
}
