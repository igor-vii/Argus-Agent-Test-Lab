import { FaultDefinition, FaultInjectionResult, FaultTrigger } from './types';

/**
 * Event-based Fault Injection Engine
 * 
 * Faults are triggered by events, not just time-based delays.
 * This allows precise control over when faults are injected.
 */
export class FaultInjector {
  private pendingFaults: Map<string, FaultDefinition> = new Map();
  private eventHandlers: Map<string, Array<(event: FaultEvent) => Promise<void>>> = new Map();

  /**
   * Register a fault for injection
   */
  registerFault(fault: FaultDefinition): void {
    this.pendingFaults.set(fault.id, fault);
    
    // Register event handler if trigger is defined
    if (fault.trigger) {
      this.registerTrigger(fault.trigger, fault);
    }
  }

  /**
   * Unregister a fault
   */
  unregisterFault(faultId: string): void {
    this.pendingFaults.delete(faultId);
  }

  /**
   * Emit an event that may trigger faults
   */
  async emitEvent(event: FaultEvent): Promise<FaultInjectionResult[]> {
    const results: FaultInjectionResult[] = [];
    const handlers = this.eventHandlers.get(event.type) || [];

    for (const handler of handlers) {
      try {
        await handler(event);
        results.push({
          faultId: event.faultId || 'unknown',
          applied: true,
          timestamp: Date.now(),
          effect: event.data
        });
      } catch (error) {
        results.push({
          faultId: event.faultId || 'unknown',
          applied: false,
          timestamp: Date.now(),
          effect: { error: String(error) }
        });
      }
    }

    return results;
  }

  /**
   * Check if a fault should be applied for a given event
   */
  shouldInjectFault(eventType: string, faultType?: string): boolean {
    if (!faultType) {
      return this.eventHandlers.has(eventType);
    }

    const handlers = this.eventHandlers.get(eventType) || [];
    return handlers.length > 0;
  }

  /**
   * Get all registered faults
   */
  getRegisteredFaults(): FaultDefinition[] {
    return Array.from(this.pendingFaults.values());
  }

  /**
   * Clear all registered faults
   */
  clear(): void {
    this.pendingFaults.clear();
    this.eventHandlers.clear();
  }

  /**
   * Register a trigger for a fault
   */
  private registerTrigger(trigger: FaultTrigger, fault: FaultDefinition): void {
    const eventType = trigger.event;
    
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }

    const handlers = this.eventHandlers.get(eventType)!;
    handlers.push(async (event: FaultEvent) => {
      // Apply fault logic based on type
      await this.applyFault(fault, event);
    });
  }

  /**
   * Apply a fault based on its type
   */
  private async applyFault(fault: FaultDefinition, event: FaultEvent): Promise<void> {
    // Fault application logic is handled by the ScenarioEngine
    // This is a hook for custom fault behavior
    event.faultId = fault.id;
    event.data = { ...event.data, ...fault.params };
  }
}

/**
 * Fault Event - represents an event that may trigger fault injection
 */
export interface FaultEvent {
  type: string;
  data: Record<string, unknown>;
  faultId?: string;
  timestamp?: number;
}
