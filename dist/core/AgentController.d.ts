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
import { AgentTargetPort, TargetConnectionConfig, ConnectionResult, Exchange, Evidence, RunId, ExchangeStatus } from '../core/AgentTargetPort';
/**
 * Outcome of a controller-managed interaction
 * Represents the observed result without semantic interpretation
 */
export interface InteractionOutcome {
    /** The run identifier */
    runId: RunId;
    /** Status of the interaction */
    status: ExchangeStatus;
    /** The exchange record if available */
    exchange?: Exchange;
    /** Captured evidence if any */
    evidence?: Evidence;
    /** Error message if status is FAILURE or TIMEOUT */
    error?: string;
    /** Duration of the interaction in milliseconds */
    durationMs?: number;
}
/**
 * Configuration for the AgentController
 */
export interface ControllerConfig {
    /** Connection configuration for the target port */
    connectionConfig: TargetConnectionConfig;
    /** Default timeout in milliseconds for interactions */
    timeoutMs?: number;
    /** Optional run identifier (generated if not provided) */
    runId?: RunId;
}
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
export declare class AgentController {
    private readonly port;
    private readonly config;
    private isConnectedFlag;
    private currentRunId?;
    /**
     * Create a new AgentController
     * @param port - The AgentTargetPort implementation to use
     * @param config - Controller configuration
     */
    constructor(port: AgentTargetPort, config: ControllerConfig);
    /**
     * Get the current run identifier
     */
    getRunId(): RunId | undefined;
    /**
     * Connect to the target agent
     * @returns Connection result
     */
    connect(): Promise<ConnectionResult>;
    /**
     * Check if connected to the target
     */
    isConnected(): boolean;
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
    act(type: string, payload?: unknown): Promise<InteractionOutcome>;
    /**
     * Observe a response/observation from the target
     *
     * @param type - Type of observation
     * @param payload - Observation payload
     * @returns Interaction outcome
     */
    observe(type: string, payload?: unknown): Promise<InteractionOutcome>;
    /**
     * Capture evidence during the interaction
     *
     * @param type - Type of evidence
     * @param data - Evidence data
     * @param description - Optional description
     * @returns Captured evidence or undefined if failed
     */
    captureEvidence(type: string, data: unknown, description?: string): Promise<Evidence | undefined>;
    /**
     * Execute a complete interaction lifecycle:
     * connect → act → observe → disconnect
     *
     * @param actionType - Type of action to perform
     * @param actionPayload - Action payload
     * @param observeType - Type of observation expected
     * @returns Combined outcome of the interaction
     */
    executeInteraction(actionType: string, actionPayload?: unknown, observeType?: string): Promise<InteractionOutcome>;
    /**
     * Set the run identifier for the current interaction
     * @param runId - The run identifier
     */
    setRunId(runId: RunId): void;
    /**
     * Disconnect from the target agent
     */
    disconnect(): Promise<void>;
}
//# sourceMappingURL=AgentController.d.ts.map