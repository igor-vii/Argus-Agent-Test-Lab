import { AgentConfig, FaultConfig } from './types';
/**
 * Event emitted by the agent during execution
 */
export interface AgentEvent {
    timestamp: number;
    runId: string;
    agentId: string;
    eventType: string;
    data: Record<string, unknown>;
}
/**
 * Unified Agent Runtime
 *
 * Single implementation that supports different roles and behaviors
 * through configuration. Not separate BuyerAgent/SellerAgent classes.
 */
export declare class Agent {
    readonly config: AgentConfig;
    private eventCallback?;
    constructor(config: AgentConfig, eventCallback?: ((event: AgentEvent) => void) | undefined);
    /**
     * Execute an action based on agent's role and behavior profile
     */
    act(action: string, context: Record<string, unknown>): Promise<Record<string, unknown>>;
    /**
     * Observe the environment/target state
     */
    observe(state: Record<string, unknown>): Promise<Record<string, unknown>>;
    /**
     * Get faults applicable to this agent
     */
    getFaults(): FaultConfig[];
    /**
     * Check if agent has a specific fault type
     */
    hasFault(faultType: string): boolean;
    /**
     * Get fault configuration by type
     */
    getFaultConfig(faultType: string): FaultConfig | undefined;
    /**
     * Emit an event
     */
    private emit;
    /**
     * Execute action based on behavior profile
     * This is where faulty/adversarial behavior is applied
     */
    private executeAction;
    /**
     * Process observation based on behavior profile
     */
    private processObservation;
}
