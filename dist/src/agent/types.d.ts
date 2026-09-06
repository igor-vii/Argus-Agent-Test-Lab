/**
 * Agent Role - defines the role of an agent in a scenario
 */
export type AgentRole = 'buyer' | 'seller';
/**
 * Behavior Profile - defines how an agent behaves
 */
export type BehaviorProfile = 'honest' | 'faulty' | 'adversarial';
/**
 * Fault Configuration for an agent
 */
export interface FaultConfig {
    type: string;
    trigger?: {
        event: string;
    };
    params?: Record<string, unknown>;
}
/**
 * Agent Configuration - defines a single agent instance
 *
 * This is the unified agent model: one implementation,
 * different behaviors based on configuration.
 */
export interface AgentConfig {
    id: string;
    role: AgentRole;
    behaviorProfile: BehaviorProfile;
    config: Record<string, unknown>;
    faults: FaultConfig[];
}
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
