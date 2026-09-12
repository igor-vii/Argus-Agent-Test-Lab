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
import { MessageDirection, ExchangeStatus, } from '../core/AgentTargetPort';
/**
 * Generate a unique ID (simplified for mock purposes)
 */
function generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
/**
 * Mock implementation of AgentTargetPort
 */
export class MockTargetAdapter {
    id;
    targetType;
    connected = false;
    config;
    exchanges = [];
    evidences = [];
    constructor(targetType = 'mock-target') {
        this.id = generateId('adapter');
        this.targetType = targetType;
    }
    getId() {
        return this.id;
    }
    getTargetType() {
        return this.targetType;
    }
    async connect(config) {
        const mockConfig = config;
        // Simulate connection delay
        const delay = mockConfig.options?.connectionDelayMs ?? 0;
        if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        // Simulate potential failure
        const failureRate = mockConfig.options?.failureRate ?? 0;
        if (Math.random() < failureRate) {
            return {
                success: false,
                error: 'Simulated connection failure',
            };
        }
        this.config = mockConfig;
        this.connected = true;
        return {
            success: true,
            connectionId: generateId('conn'),
        };
    }
    isConnected() {
        return this.connected;
    }
    async send(runId, type, payload) {
        if (!this.connected) {
            throw new Error('Not connected. Call connect() first.');
        }
        const exchange = {
            id: generateId('exch'),
            runId,
            direction: MessageDirection.OUTBOUND,
            type,
            timestamp: Date.now(),
            payload,
            status: ExchangeStatus.SUCCESS,
        };
        this.exchanges.push(exchange);
        return exchange;
    }
    async receive(runId, type, payload) {
        if (!this.connected) {
            throw new Error('Not connected. Call connect() first.');
        }
        // Check for canned response
        let responsePayload = payload;
        const cannedResponses = this.config?.options?.cannedResponses;
        if (cannedResponses && cannedResponses[type]) {
            responsePayload = cannedResponses[type];
        }
        const exchange = {
            id: generateId('exch'),
            runId,
            direction: MessageDirection.INBOUND,
            type,
            timestamp: Date.now(),
            payload: responsePayload,
            status: ExchangeStatus.SUCCESS,
        };
        this.exchanges.push(exchange);
        return exchange;
    }
    async captureEvidence(runId, type, data, description) {
        const evidence = {
            id: generateId('evid'),
            runId,
            type,
            timestamp: Date.now(),
            data,
            description,
        };
        this.evidences.push(evidence);
        return evidence;
    }
    async disconnect() {
        this.connected = false;
        this.config = undefined;
    }
    /**
     * Get all exchanges for this adapter (for testing/inspection)
     */
    getExchanges() {
        return [...this.exchanges];
    }
    /**
     * Get all evidence for this adapter (for testing/inspection)
     */
    getEvidences() {
        return [...this.evidences];
    }
    /**
     * Reset the mock state (for testing)
     */
    reset() {
        this.connected = false;
        this.config = undefined;
        this.exchanges = [];
        this.evidences = [];
    }
}
//# sourceMappingURL=MockTargetAdapter.js.map