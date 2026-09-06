import { TargetAdapter, SecretariatExecuteParams, SecretariatExecuteResult, SecretariatObserveResult } from './types';
/**
 * Secretariat Target Adapter - MVP Implementation
 *
 * This is a MOCK implementation for autonomous unit/integration tests.
 * It does NOT connect to real production Secretariat API.
 *
 * IMPORTANT: This mock explicitly simulates target behavior for testing.
 * It should not be mistaken for real production integration.
 */
export declare class SecretariatTargetAdapter implements TargetAdapter<SecretariatExecuteParams, SecretariatExecuteResult, SecretariatObserveResult> {
    readonly targetId = "secretariat";
    private state;
    private requestCounter;
    private paymentCounter;
    private executionCounter;
    /**
     * Execute an operation on the Secretariat mock
     */
    execute(action: string, params: SecretariatExecuteParams): Promise<SecretariatExecuteResult>;
    /**
     * Observe the current state of the Secretariat mock
     */
    observe(): Promise<SecretariatObserveResult>;
    /**
     * Check if target is available
     */
    isAvailable(): Promise<boolean>;
    /**
     * Handle createRequest action
     */
    private handleCreateRequest;
    /**
     * Handle submitPayment action
     */
    private handleSubmitPayment;
    /**
     * Handle settlePayment action
     */
    private handleSettlePayment;
    /**
     * Handle executeRequest action
     */
    private handleExecuteRequest;
    /**
     * Handle getExecutionStatus action
     */
    private handleGetExecutionStatus;
    /**
     * Reset internal state (for testing)
     */
    reset(): void;
}
