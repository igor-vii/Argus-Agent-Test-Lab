/**
 * AgentController - Universal Orchestration Layer for Agent Interactions
 *
 * Controller manages the lifecycle of a single test interaction between
 * Argus and a target agent through the universal AgentTargetPort.
 *
 * ARCHITECTURAL PRINCIPLES:
 * - Controller is target-agnostic (doesn't know any specific target like HTTP, MCP, etc.)
 * - Controller does NOT implement automatic retry
 * - Controller does NOT determine PASS/FAIL/INCONCLUSIVE verdicts
 * - Controller treats timeout as an observed outcome, not a semantic verdict
 * - Controller uses only the universal AgentTargetPort interface
 * - Controller does NOT collect evidence (ScenarioEngine does that)
 * - Controller does NOT know about actor
 */
import { AgentTargetPort, TargetConnectionConfig, ConnectionResult, Exchange, RunId, ExchangeStatus } from './AgentTargetPort';
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
 *   connect → act/send → observe/receive → disconnect
 *
 * The controller is responsible for:
 * - Managing connection lifecycle
 * - Executing actions with timeout support
 * - Proper cleanup on failure
 *
 * The controller does NOT:
 * - Implement automatic retry
 * - Determine semantic verdicts (PASS/FAIL/INCONCLUSIVE)
 * - Know about specific targets or protocols
 * - Contain business/economic logic
 * - Collect evidence
 * - Know about actor
 */
export declare class AgentController {
    private readonly port;
    private readonly config;
    private isConnectedFlag;
    private currentRunId?;
    constructor(port: AgentTargetPort, config: ControllerConfig);
    getRunId(): RunId | undefined;
    connect(): Promise<ConnectionResult>;
    isConnected(): boolean;
    /**
     * Execute an action with timeout support.
     * Returns raw outcome without evidence collection.
     */
    act(type: string, payload?: unknown): Promise<InteractionOutcome>;
    /**
     * Observe a response/observation from the target.
     * Returns raw outcome without evidence collection.
     */
    observe(type: string, payload?: unknown): Promise<InteractionOutcome>;
    /**
     * Execute a complete interaction lifecycle:
     * connect → act → observe → disconnect
     *
     * Returns raw outcome without evidence collection.
     */
    executeInteraction(actionType: string, actionPayload?: unknown, observeType?: string): Promise<InteractionOutcome>;
    setRunId(runId: RunId): void;
    disconnect(): Promise<void>;
}
//# sourceMappingURL=AgentController.d.ts.map