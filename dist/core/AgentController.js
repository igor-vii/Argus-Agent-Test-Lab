/**
 * AgentController - Universal Orchestration Layer for Agent Interactions
 *
 * Controller manages the lifecycle of a single test interaction between
 * Argus and a target agent through the universal AgentTargetPort.
 *
 * ARCHITECTURAL PRINCIPLES:
 * - Controller is target-agnostic (doesn't know Secretariat, HTTP, MCP, etc.)
 * - Controller does NOT implement automatic retry
 * - Controller does NOT determine PASS/FAIL/INCONCLUSIVE verdicts
 * - Controller treats timeout as an observed outcome, not a semantic verdict
 * - Controller uses only the universal AgentTargetPort interface
 */
import { ExchangeStatus, } from '../core/AgentTargetPort';
/**
 * AgentController manages the lifecycle of agent interactions
 *
 * Lifecycle:
 *   connect → act/send → observe/receive → record outcome/evidence → disconnect
 *
 * The controller is responsible for:
 * - Managing connection lifecycle
 * - Executing actions with timeout support
 * - Recording outcomes and evidence
 * - Proper cleanup on failure
 *
 * The controller does NOT:
 * - Implement automatic retry
 * - Determine semantic verdicts (PASS/FAIL/INCONCLUSIVE)
 * - Know about specific targets or protocols
 * - Contain business/economic logic
 */
export class AgentController {
    port;
    config;
    isConnectedFlag = false;
    currentRunId;
    /**
     * Create a new AgentController
     * @param port - The AgentTargetPort implementation to use
     * @param config - Controller configuration
     */
    constructor(port, config) {
        this.port = port;
        this.config = {
            ...config,
            timeoutMs: config.timeoutMs ?? 30000, // Default 30s timeout
        };
        this.currentRunId = config.runId;
    }
    /**
     * Get the current run identifier
     */
    getRunId() {
        return this.currentRunId;
    }
    /**
     * Connect to the target agent
     * @returns Connection result
     */
    async connect() {
        const result = await this.port.connect(this.config.connectionConfig);
        if (result.success) {
            this.isConnectedFlag = true;
        }
        return result;
    }
    /**
     * Check if connected to the target
     */
    isConnected() {
        return this.isConnectedFlag && this.port.isConnected();
    }
    /**
     * Execute an action with timeout support
     *
     * This method sends a request/action to the target and waits for a response.
     * If the operation times out, it returns an outcome with TIMEOUT status.
     *
     * @param type - Type of action
     * @param payload - Action payload
     * @returns Interaction outcome
     */
    async act(type, payload) {
        if (!this.currentRunId) {
            throw new Error('RunId not set. Call setRunId() before act().');
        }
        if (!this.isConnected()) {
            return {
                runId: this.currentRunId,
                status: ExchangeStatus.FAILURE,
                error: 'Not connected to target',
            };
        }
        const startTime = Date.now();
        try {
            // Create a promise that races between the action and timeout
            const actionPromise = this.port.send(this.currentRunId, type, payload);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Action timeout after ${this.config.timeoutMs}ms`));
                }, this.config.timeoutMs);
            });
            const exchange = await Promise.race([actionPromise, timeoutPromise]);
            const durationMs = Date.now() - startTime;
            return {
                runId: this.currentRunId,
                status: exchange.status,
                exchange,
                durationMs,
            };
        }
        catch (error) {
            const durationMs = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            // Determine if it's a timeout or other error
            const isTimeout = errorMessage.includes('timeout');
            return {
                runId: this.currentRunId,
                status: isTimeout ? ExchangeStatus.TIMEOUT : ExchangeStatus.FAILURE,
                error: errorMessage,
                durationMs,
            };
        }
    }
    /**
     * Observe a response/observation from the target
     *
     * @param type - Type of observation
     * @param payload - Observation payload
     * @returns Interaction outcome
     */
    async observe(type, payload) {
        if (!this.currentRunId) {
            throw new Error('RunId not set. Call setRunId() before observe().');
        }
        if (!this.isConnected()) {
            return {
                runId: this.currentRunId,
                status: ExchangeStatus.FAILURE,
                error: 'Not connected to target',
            };
        }
        const startTime = Date.now();
        try {
            const exchange = await this.port.receive(this.currentRunId, type, payload);
            const durationMs = Date.now() - startTime;
            return {
                runId: this.currentRunId,
                status: exchange.status,
                exchange,
                durationMs,
            };
        }
        catch (error) {
            const durationMs = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                runId: this.currentRunId,
                status: ExchangeStatus.FAILURE,
                error: errorMessage,
                durationMs,
            };
        }
    }
    /**
     * Capture evidence during the interaction
     *
     * @param type - Type of evidence
     * @param data - Evidence data
     * @param description - Optional description
     * @returns Captured evidence or undefined if failed
     */
    async captureEvidence(type, data, description) {
        if (!this.currentRunId) {
            throw new Error('RunId not set. Call setRunId() before capturing evidence.');
        }
        try {
            return await this.port.captureEvidence(this.currentRunId, type, data, description);
        }
        catch (error) {
            // Evidence capture failure should not break the interaction
            // Just log and continue
            console.warn('Failed to capture evidence:', error);
            return undefined;
        }
    }
    /**
     * Execute a complete interaction lifecycle:
     * connect → act → observe → disconnect
     *
     * @param actionType - Type of action to perform
     * @param actionPayload - Action payload
     * @param observeType - Type of observation expected
     * @returns Combined outcome of the interaction
     */
    async executeInteraction(actionType, actionPayload, observeType) {
        if (!this.currentRunId) {
            throw new Error('RunId not set. Call setRunId() before executing interaction.');
        }
        // Connect
        const connectResult = await this.connect();
        if (!connectResult.success) {
            return {
                runId: this.currentRunId,
                status: ExchangeStatus.FAILURE,
                error: `Connection failed: ${connectResult.error}`,
            };
        }
        try {
            // Act
            const actOutcome = await this.act(actionType, actionPayload);
            if (actOutcome.status !== ExchangeStatus.SUCCESS) {
                // Record failure evidence if available
                if (actOutcome.error) {
                    await this.captureEvidence('interaction_failure', {
                        stage: 'act',
                        error: actOutcome.error,
                        status: actOutcome.status,
                    });
                }
                return actOutcome;
            }
            // Observe if requested
            if (observeType) {
                const observeOutcome = await this.observe(observeType);
                if (observeOutcome.status !== ExchangeStatus.SUCCESS) {
                    // Record failure evidence if available
                    if (observeOutcome.error) {
                        await this.captureEvidence('interaction_failure', {
                            stage: 'observe',
                            error: observeOutcome.error,
                            status: observeOutcome.status,
                        });
                    }
                    return observeOutcome;
                }
                // Return combined outcome
                return {
                    runId: this.currentRunId,
                    status: ExchangeStatus.SUCCESS,
                    exchange: observeOutcome.exchange,
                    evidence: observeOutcome.evidence,
                    durationMs: (actOutcome.durationMs ?? 0) + (observeOutcome.durationMs ?? 0),
                };
            }
            return actOutcome;
        }
        finally {
            // Always disconnect
            await this.disconnect();
        }
    }
    /**
     * Set the run identifier for the current interaction
     * @param runId - The run identifier
     */
    setRunId(runId) {
        this.currentRunId = runId;
    }
    /**
     * Disconnect from the target agent
     */
    async disconnect() {
        this.isConnectedFlag = false;
        await this.port.disconnect();
    }
}
//# sourceMappingURL=AgentController.js.map