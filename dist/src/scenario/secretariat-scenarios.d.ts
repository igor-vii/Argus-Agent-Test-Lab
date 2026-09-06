import { ScenarioDefinition } from './types';
/**
 * Secretariat Scenarios - 7 Canonical Adversarial Tests
 *
 * All invariants use explicit countEventsByType checks for evidence-based evaluation.
 */
/**
 * S1 — Duplicate Request
 *
 * Check: one logical request → one payment intent → one economic payment → one execution
 */
export declare const duplicateRequestScenario: ScenarioDefinition;
/**
 * S2 — Payment Before Execution
 *
 * Check: execution impossible before correct settlement
 */
export declare const paymentBeforeExecutionScenario: ScenarioDefinition;
/**
 * S3 — Crash After Settlement
 *
 * Simulate crash after settlement.
 * Check: payment not repeated, execution not duplicated, recovery preserves integrity.
 */
export declare const crashAfterSettlementScenario: ScenarioDefinition;
/**
 * S4 — Seller Timeout
 *
 * Check: timeout not automatically treated as economic failure,
 * state remains UNKNOWN where evidence is insufficient.
 */
export declare const sellerTimeoutScenario: ScenarioDefinition;
/**
 * S5 — Concurrent Duplicate
 *
 * Create concurrent duplicate requests simultaneously.
 * Check: no duplicate economic operation, idempotency, correct final state.
 */
export declare const concurrentDuplicateScenario: ScenarioDefinition;
/**
 * S6 — Payment Retry
 *
 * Simulate retry/payment resubmission.
 * Check: retry does not create second economic obligation.
 */
export declare const paymentRetryScenario: ScenarioDefinition;
/**
 * S7 — Lost Delivery
 *
 * Settlement/execution occur, but delivery/HTTP response is lost.
 * Check: payment settlement independent of HTTP response,
 * delivery uncertainty recorded separately.
 */
export declare const lostDeliveryScenario: ScenarioDefinition;
/**
 * All Secretariat Scenarios
 */
export declare const secretariatScenarios: Record<string, ScenarioDefinition>;
