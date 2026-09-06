/**
 * Fault Type definitions for MVP
 *
 * These are the primitive fault types that can be injected
 */
export type FaultType = 'duplicate_request' | 'delayed_payment' | 'unpaid_request' | 'crash_after_payment' | 'seller_timeout' | 'concurrent_request' | 'payment_retry' | 'lost_delivery';
/**
 * Event trigger for fault injection
 */
export interface FaultTrigger {
    event: string;
}
/**
 * Fault Configuration
 */
export interface FaultDefinition {
    id: string;
    type: FaultType;
    description?: string;
    trigger?: FaultTrigger;
    params: Record<string, unknown>;
    targetAgentId?: string;
}
/**
 * Fault Injection Result
 */
export interface FaultInjectionResult {
    faultId: string;
    applied: boolean;
    timestamp: number;
    effect: Record<string, unknown>;
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
