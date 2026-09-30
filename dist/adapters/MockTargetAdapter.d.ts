/**
 * MockTargetAdapter - Mock Implementation of AgentTargetAdapter
 *
 * This is a test/mock implementation that simulates a target agent
 * without requiring actual network connections or external dependencies.
 *
 * Used for:
 * - Unit testing the AgentTargetAdapter contract
 * - Testing Argus Core without external dependencies
 * - Demonstrating the adapter pattern
 */
import { AgentTargetPort, TargetConnectionConfig, ConnectionResult, Exchange, Evidence, RunId } from '../core/AgentTargetPort';
/**
 * Configuration specific to the mock target
 */
export interface MockTargetConfig extends TargetConnectionConfig {
    /** Simulate connection delay in ms */
    connectionDelayMs?: number;
    /** Simulate failure rate (0.0 - 1.0) */
    failureRate?: number;
    /** Pre-programmed responses for specific message types */
    cannedResponses?: Record<string, unknown>;
    /**
     * R2 lifecycle-observation plumbing (see docs/evidence-source-map.md):
     * per-action-type list of lifecycle observations that the simulated source
     * (Sut / settlement layer) is configured to report on a successful response.
     *
     * This does NOT invent facts: each type here must be a fact the simulated
     * source would legitimately report (e.g. a facilitator/settlement layer
     * answering "payment_settled" or "settlement_unknown" about a payment).
     * The mock merely relays what the scenario configures the source to say.
     * Unknown/invalid observation types are ignored by the mock itself;
     * validation lives in core/validateScenario (L0-F2 boundary).
     */
    lifecycleObservations?: Record<string, string[]>;
}
/**
 * Lifecycle observation types that represent an external economic/delivery
 * fact reported by the simulated source. Kept as a narrow allow-list so that
 * no speculative lifecycle emitter can enter the evidence path through the
 * mock: a type may appear here only if a canonical scenario assertion already
 * consumes it (docs/evidence-source-map.md, section 2).
 *
 * Deliberately absent (no legitimate source yet — see R1 map):
 * delivery_received (edge-mediated), recovery_completed (crash/restart),
 * forward_request, unhandled_exception.
 */
export declare const MOCK_LIFECYCLE_OBSERVATION_TYPES: ReadonlySet<string>;
/**
 * Mock implementation of AgentTargetPort
 */
export declare class MockTargetAdapter implements AgentTargetPort {
    private id;
    private targetType;
    private connected;
    private config?;
    private exchanges;
    private evidences;
    private paymentIntents;
    constructor(targetType?: string);
    getId(): string;
    getTargetType(): string;
    connect(config: TargetConnectionConfig): Promise<ConnectionResult>;
    isConnected(): boolean;
    send(runId: RunId, type: string, payload?: unknown): Promise<Exchange>;
    receive(runId: RunId, type: string, payload?: unknown): Promise<Exchange>;
    captureEvidence(runId: RunId, type: string, data: unknown, description?: string): Promise<Evidence>;
    disconnect(): Promise<void>;
    /**
     * Get all exchanges for this adapter (for testing/inspection)
     */
    getExchanges(): Exchange[];
    /**
     * Get all evidence for this adapter (for testing/inspection)
     */
    getEvidences(): Evidence[];
    /**
     * Reset the mock state (for testing)
     */
    reset(): void;
}
//# sourceMappingURL=MockTargetAdapter.d.ts.map