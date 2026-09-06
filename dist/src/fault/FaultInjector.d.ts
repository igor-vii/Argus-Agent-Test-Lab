import { FaultDefinition, FaultInjectionResult, FaultEvent } from './types';
/**
 * Event-based Fault Injection Engine
 *
 * Faults are triggered by events, not just time-based delays.
 * This allows precise control over when faults are injected.
 */
export declare class FaultInjector {
    private pendingFaults;
    private eventHandlers;
    /**
     * Register a fault for injection
     */
    registerFault(fault: FaultDefinition): void;
    /**
     * Unregister a fault
     */
    unregisterFault(faultId: string): void;
    /**
     * Emit an event that may trigger faults
     */
    emitEvent(event: FaultEvent): Promise<FaultInjectionResult[]>;
    /**
     * Check if a fault should be applied for a given event
     */
    shouldInjectFault(eventType: string, faultType?: string): boolean;
    /**
     * Get all registered faults
     */
    getRegisteredFaults(): FaultDefinition[];
    /**
     * Clear all registered faults
     */
    clear(): void;
    /**
     * Register a trigger for a fault
     */
    private registerTrigger;
    /**
     * Apply a fault based on its type
     */
    private applyFault;
}
