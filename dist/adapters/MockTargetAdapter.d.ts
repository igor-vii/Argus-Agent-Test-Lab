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
}
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