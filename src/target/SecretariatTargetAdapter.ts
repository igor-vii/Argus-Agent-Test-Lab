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
export class SecretariatTargetAdapter implements TargetAdapter<SecretariatExecuteParams, SecretariatExecuteResult, SecretariatObserveResult> {
  readonly targetId = 'secretariat';

  private state: {
    requests: Map<string, { id: string; status: string; paymentId?: string }>;
    payments: Map<string, { id: string; status: string; amount: number }>;
    executions: Map<string, { id: string; requestId: string; status: string }>;
  } = {
    requests: new Map(),
    payments: new Map(),
    executions: new Map()
  };

  private requestCounter = 0;
  private paymentCounter = 0;
  private executionCounter = 0;

  /**
   * Execute an operation on the Secretariat mock
   */
  async execute(action: string, params: SecretariatExecuteParams): Promise<SecretariatExecuteResult> {
    const timestamp = Date.now();

    try {
      switch (params.action) {
        case 'createRequest':
          return this.handleCreateRequest(params, timestamp);
        
        case 'submitPayment':
          return this.handleSubmitPayment(params, timestamp);
        
        case 'settlePayment':
          return this.handleSettlePayment(params, timestamp);
        
        case 'executeRequest':
          return this.handleExecuteRequest(params, timestamp);
        
        case 'getExecutionStatus':
          return this.handleGetExecutionStatus(params, timestamp);
        
        default:
          return {
            success: false,
            error: `Unknown action: ${params.action}`,
            timestamp
          };
      }
    } catch (error) {
      return {
        success: false,
        error: String(error),
        timestamp
      };
    }
  }

  /**
   * Observe the current state of the Secretariat mock
   */
  async observe(): Promise<SecretariatObserveResult> {
    return {
      status: 'ready',
      pendingRequests: this.state.requests.size,
      lastUpdateTime: Date.now(),
      metadata: {
        totalPayments: this.state.payments.size,
        totalExecutions: this.state.executions.size
      }
    };
  }

  /**
   * Check if target is available
   */
  async isAvailable(): Promise<boolean> {
    // Mock always available
    return true;
  }

  /**
   * Handle createRequest action
   */
  private handleCreateRequest(
    params: SecretariatExecuteParams,
    timestamp: number
  ): SecretariatExecuteResult {
    const requestId = `req-${++this.requestCounter}`;
    
    this.state.requests.set(requestId, {
      id: requestId,
      status: 'created',
      paymentId: undefined
    });

    return {
      success: true,
      data: {
        requestId,
        status: 'created',
        timestamp
      },
      timestamp
    };
  }

  /**
   * Handle submitPayment action
   */
  private handleSubmitPayment(
    params: SecretariatExecuteParams,
    timestamp: number
  ): SecretariatExecuteResult {
    const paymentId = `pay-${++this.paymentCounter}`;
    
    this.state.payments.set(paymentId, {
      id: paymentId,
      status: 'submitted',
      amount: params.amount || 0
    });

    // Link payment to request if provided
    if (params.requestId && this.state.requests.has(params.requestId)) {
      const request = this.state.requests.get(params.requestId)!;
      request.paymentId = paymentId;
      request.status = 'payment_submitted';
    }

    return {
      success: true,
      data: {
        paymentId,
        status: 'submitted',
        timestamp
      },
      timestamp
    };
  }

  /**
   * Handle settlePayment action
   */
  private handleSettlePayment(
    params: SecretariatExecuteParams,
    timestamp: number
  ): SecretariatExecuteResult {
    if (!params.paymentId || !this.state.payments.has(params.paymentId)) {
      return {
        success: false,
        error: 'Payment not found',
        timestamp
      };
    }

    const payment = this.state.payments.get(params.paymentId)!;
    payment.status = 'settled';

    return {
      success: true,
      data: {
        paymentId: params.paymentId,
        status: 'settled',
        timestamp
      },
      timestamp
    };
  }

  /**
   * Handle executeRequest action
   */
  private handleExecuteRequest(
    params: SecretariatExecuteParams,
    timestamp: number
  ): SecretariatExecuteResult {
    if (!params.requestId || !this.state.requests.has(params.requestId)) {
      return {
        success: false,
        error: 'Request not found',
        timestamp
      };
    }

    const request = this.state.requests.get(params.requestId)!;
    const executionId = `exec-${++this.executionCounter}`;
    
    this.state.executions.set(executionId, {
      id: executionId,
      requestId: params.requestId,
      status: 'completed'
    });

    request.status = 'executed';

    return {
      success: true,
      data: {
        executionId,
        requestId: params.requestId,
        status: 'completed',
        timestamp
      },
      timestamp
    };
  }

  /**
   * Handle getExecutionStatus action
   */
  private handleGetExecutionStatus(
    params: SecretariatExecuteParams,
    timestamp: number
  ): SecretariatExecuteResult {
    if (!params.requestId) {
      return {
        success: false,
        error: 'Request ID required',
        timestamp
      };
    }

    const request = this.state.requests.get(params.requestId);
    if (!request) {
      return {
        success: false,
        error: 'Request not found',
        timestamp
      };
    }

    return {
      success: true,
      data: {
        requestId: params.requestId,
        status: request.status,
        paymentId: request.paymentId,
        timestamp
      },
      timestamp
    };
  }

  /**
   * Reset internal state (for testing)
   */
  reset(): void {
    this.state.requests.clear();
    this.state.payments.clear();
    this.state.executions.clear();
    this.requestCounter = 0;
    this.paymentCounter = 0;
    this.executionCounter = 0;
  }
}
