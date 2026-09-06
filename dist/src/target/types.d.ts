/**
 * Target Adapter Interface
 *
 * Abstract interface for interacting with different target systems.
 * Only SecretariatTargetAdapter is implemented for MVP.
 */
export interface TargetAdapter<TExecuteParams = unknown, TExecuteResult = unknown, TObserveResult = unknown> {
    /**
     * Target identifier
     */
    readonly targetId: string;
    /**
     * Execute an operation on the target
     */
    execute(action: string, params: TExecuteParams): Promise<TExecuteResult>;
    /**
     * Observe the current state of the target
     */
    observe(): Promise<TObserveResult>;
    /**
     * Check if target is available/connected
     */
    isAvailable(): Promise<boolean>;
}
/**
 * Secretariat-specific execution parameters
 */
export interface SecretariatExecuteParams {
    action: 'createRequest' | 'submitPayment' | 'settlePayment' | 'executeRequest' | 'getExecutionStatus';
    requestId?: string;
    paymentId?: string;
    amount?: number;
    payload?: Record<string, unknown>;
}
/**
 * Secretariat execution result
 */
export interface SecretariatExecuteResult {
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
    timestamp: number;
}
/**
 * Secretariat observation result
 */
export interface SecretariatObserveResult {
    status: 'ready' | 'busy' | 'error' | 'unknown';
    pendingRequests: number;
    lastUpdateTime: number;
    metadata?: Record<string, unknown>;
}
