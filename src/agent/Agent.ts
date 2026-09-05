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
export class Agent {
  constructor(
    public readonly config: AgentConfig,
    private eventCallback?: (event: AgentEvent) => void
  ) {}

  /**
   * Execute an action based on agent's role and behavior profile
   */
  async act(action: string, context: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await this.executeAction(action, context);
    
    this.emit({
      eventType: `action.${action}`,
      data: { input: context, output: result }
    });

    return result;
  }

  /**
   * Observe the environment/target state
   */
  async observe(state: Record<string, unknown>): Promise<Record<string, unknown>> {
    const observation = await this.processObservation(state);
    
    this.emit({
      eventType: 'observation',
      data: { state, observation }
    });

    return observation;
  }

  /**
   * Get faults applicable to this agent
   */
  getFaults(): FaultConfig[] {
    return this.config.faults;
  }

  /**
   * Check if agent has a specific fault type
   */
  hasFault(faultType: string): boolean {
    return this.config.faults.some(f => f.type === faultType);
  }

  /**
   * Get fault configuration by type
   */
  getFaultConfig(faultType: string): FaultConfig | undefined {
    return this.config.faults.find(f => f.type === faultType);
  }

  /**
   * Emit an event
   */
  private emit(event: Omit<AgentEvent, 'timestamp' | 'runId' | 'agentId'>) {
    if (this.eventCallback) {
      this.eventCallback({
        ...event,
        timestamp: Date.now(),
        runId: '', // Will be set by ScenarioEngine
        agentId: this.config.id
      });
    }
  }

  /**
   * Execute action based on behavior profile
   * This is where faulty/adversarial behavior is applied
   */
  private async executeAction(
    action: string, 
    context: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // For MVP, behavior profile affects how faults are applied
    // The actual fault injection happens in the FaultInjection layer
    return context;
  }

  /**
   * Process observation based on behavior profile
   */
  private async processObservation(
    state: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return state;
  }
}
