import { ScenarioDefinition } from './types';

/**
 * Secretariat Scenarios - 7 Canonical Adversarial Tests
 */

/**
 * S1 — Duplicate Request
 * 
 * Check: one logical request, one durable payment intent,
 * one economic payment, one execution.
 */
export const duplicateRequestScenario: ScenarioDefinition = {
  id: 'secretariat-duplicate-request',
  description: 'Test that duplicate requests do not cause duplicate economic operations',
  target: 'secretariat',
  agents: [
    {
      id: 'buyer-1',
      role: 'buyer',
      behaviorProfile: 'faulty',
      config: {},
      faults: [
        {
          type: 'duplicate_request',
          trigger: { event: 'request.created' },
          params: { count: 2 }
        }
      ]
    }
  ],
  timeline: [
    {
      stepId: 'step-1',
      action: 'createRequest',
      actor: 'buyer-1',
      description: 'Buyer creates a request (with duplicate fault)'
    },
    {
      stepId: 'step-2',
      action: 'submitPayment',
      actor: 'buyer-1',
      description: 'Buyer submits payment'
    },
    {
      stepId: 'step-3',
      action: 'executeRequest',
      actor: 'seller-1',
      description: 'Seller executes the request'
    }
  ],
  faults: [
    {
      id: 'fault-dup-req',
      type: 'duplicate_request',
      trigger: { event: 'request.created' },
      params: { count: 2 },
      targetAgentId: 'buyer-1'
    }
  ],
  invariants: [
    {
      id: 'inv-1',
      description: 'Only one payment intent is created',
      type: 'economic',
      check: 'payment_intent_count == 1'
    },
    {
      id: 'inv-2',
      description: 'Only one economic payment is settled',
      type: 'economic',
      check: 'settled_payment_count == 1'
    },
    {
      id: 'inv-3',
      description: 'Only one execution occurs',
      type: 'execution',
      check: 'execution_count == 1'
    }
  ],
  seed: 42,
  assumptions: [
    'Target supports idempotency keys',
    'Network delivers duplicate requests'
  ],
  expectedOutcome: {
    status: 'success',
    conditions: [
      'No duplicate economic operations',
      'Idempotency preserved'
    ]
  }
};

/**
 * S2 — Payment Before Execution
 * 
 * Check: execution impossible before correct settlement,
 * incorrect order does not lead to economically incorrect state.
 */
export const paymentBeforeExecutionScenario: ScenarioDefinition = {
  id: 'secretariat-payment-before-execution',
  description: 'Test that execution cannot occur before correct payment settlement',
  target: 'secretariat',
  agents: [
    {
      id: 'buyer-1',
      role: 'buyer',
      behaviorProfile: 'adversarial',
      config: {},
      faults: []
    },
    {
      id: 'seller-1',
      role: 'seller',
      behaviorProfile: 'adversarial',
      config: {},
      faults: [
        {
          type: 'seller_timeout',
          trigger: { event: 'payment.submitted' },
          params: { skipSettlement: true }
        }
      ]
    }
  ],
  timeline: [
    {
      stepId: 'step-1',
      action: 'createRequest',
      actor: 'buyer-1',
      description: 'Buyer creates a request'
    },
    {
      stepId: 'step-2',
      action: 'submitPayment',
      actor: 'buyer-1',
      description: 'Buyer submits payment'
    },
    {
      stepId: 'step-3',
      action: 'attemptExecution',
      actor: 'seller-1',
      description: 'Seller attempts execution before settlement'
    }
  ],
  faults: [],
  invariants: [
    {
      id: 'inv-1',
      description: 'Execution blocked before settlement',
      type: 'state',
      check: 'execution_status != "completed" when payment_status != "settled"'
    },
    {
      id: 'inv-2',
      description: 'No economically incorrect state',
      type: 'economic',
      check: 'no_execution_without_settlement'
    }
  ],
  seed: 42,
  assumptions: [
    'Target enforces payment-before-execution ordering'
  ],
  expectedOutcome: {
    status: 'success',
    conditions: [
      'Execution blocked until settlement',
      'State remains consistent'
    ]
  }
};

/**
 * S3 — Crash After Settlement
 * 
 * Simulate crash after settlement.
 * Check: payment not repeated, execution not duplicated,
 * recovery preserves economic integrity.
 */
export const crashAfterSettlementScenario: ScenarioDefinition = {
  id: 'secretariat-crash-after-settlement',
  description: 'Test system behavior when crash occurs after payment settlement',
  target: 'secretariat',
  agents: [
    {
      id: 'buyer-1',
      role: 'buyer',
      behaviorProfile: 'honest',
      config: {},
      faults: []
    },
    {
      id: 'seller-1',
      role: 'seller',
      behaviorProfile: 'faulty',
      config: {},
      faults: [
        {
          type: 'crash_after_payment',
          trigger: { event: 'payment.settled' },
          params: { crashDelay: 0 }
        }
      ]
    }
  ],
  timeline: [
    {
      stepId: 'step-1',
      action: 'createRequest',
      actor: 'buyer-1',
      description: 'Buyer creates a request'
    },
    {
      stepId: 'step-2',
      action: 'submitPayment',
      actor: 'buyer-1',
      description: 'Buyer submits payment'
    },
    {
      stepId: 'step-3',
      action: 'settlePayment',
      actor: 'system',
      description: 'Payment is settled'
    },
    {
      stepId: 'step-4',
      action: 'simulateCrash',
      actor: 'seller-1',
      description: 'Seller crashes after settlement'
    },
    {
      stepId: 'step-5',
      action: 'recover',
      actor: 'seller-1',
      description: 'Seller recovers'
    }
  ],
  faults: [
    {
      id: 'fault-crash',
      type: 'crash_after_payment',
      trigger: { event: 'payment.settled' },
      params: { crashDelay: 0 },
      targetAgentId: 'seller-1'
    }
  ],
  invariants: [
    {
      id: 'inv-1',
      description: 'Payment not repeated after recovery',
      type: 'economic',
      check: 'payment_count == 1'
    },
    {
      id: 'inv-2',
      description: 'Execution not duplicated',
      type: 'execution',
      check: 'execution_count <= 1'
    },
    {
      id: 'inv-3',
      description: 'Economic integrity preserved',
      type: 'economic',
      check: 'total_settled_amount == expected_amount'
    }
  ],
  seed: 42,
  assumptions: [
    'System has crash recovery mechanism',
    'Payment state is persisted'
  ],
  expectedOutcome: {
    status: 'success',
    conditions: [
      'No duplicate payment',
      'No duplicate execution',
      'Economic integrity maintained'
    ]
  }
};

/**
 * S4 — Seller Timeout
 * 
 * Check: timeout not automatically treated as economic failure,
 * state remains correct/UNKNOWN where evidence is insufficient,
 * absence of response should not destroy payment truth.
 */
export const sellerTimeoutScenario: ScenarioDefinition = {
  id: 'secretariat-seller-timeout',
  description: 'Test that seller timeout does not cause incorrect economic state',
  target: 'secretariat',
  agents: [
    {
      id: 'buyer-1',
      role: 'buyer',
      behaviorProfile: 'honest',
      config: {},
      faults: []
    },
    {
      id: 'seller-1',
      role: 'seller',
      behaviorProfile: 'faulty',
      config: {},
      faults: [
        {
          type: 'seller_timeout',
          trigger: { event: 'execution.started' },
          params: { timeoutMs: 5000 }
        }
      ]
    }
  ],
  timeline: [
    {
      stepId: 'step-1',
      action: 'createRequest',
      actor: 'buyer-1',
      description: 'Buyer creates a request'
    },
    {
      stepId: 'step-2',
      action: 'submitPayment',
      actor: 'buyer-1',
      description: 'Buyer submits payment'
    },
    {
      stepId: 'step-3',
      action: 'startExecution',
      actor: 'seller-1',
      description: 'Seller starts execution but times out'
    },
    {
      stepId: 'step-4',
      action: 'timeout',
      actor: 'seller-1',
      description: 'Seller times out without response'
    }
  ],
  faults: [
    {
      id: 'fault-timeout',
      type: 'seller_timeout',
      trigger: { event: 'execution.started' },
      params: { timeoutMs: 5000 },
      targetAgentId: 'seller-1'
    }
  ],
  invariants: [
    {
      id: 'inv-1',
      description: 'Timeout not treated as automatic failure',
      type: 'state',
      check: 'state == "UNKNOWN" or state == "pending"'
    },
    {
      id: 'inv-2',
      description: 'Payment truth preserved',
      type: 'economic',
      check: 'payment_status != "failed" due to timeout alone'
    }
  ],
  seed: 42,
  assumptions: [
    'Timeout is detectable',
    'System distinguishes timeout from failure'
  ],
  expectedOutcome: {
    status: 'success',
    conditions: [
      'State remains UNKNOWN or pending',
      'Payment not incorrectly marked as failed'
    ]
  }
};

/**
 * S5 — Concurrent Duplicate
 * 
 * Create concurrent duplicate requests simultaneously.
 * Check: no duplicate economic operation, idempotency,
 * correct final state/evidence.
 */
export const concurrentDuplicateScenario: ScenarioDefinition = {
  id: 'secretariat-concurrent-duplicate',
  description: 'Test that concurrent duplicate requests are handled correctly',
  target: 'secretariat',
  agents: [
    {
      id: 'buyer-1',
      role: 'buyer',
      behaviorProfile: 'adversarial',
      config: {},
      faults: []
    },
    {
      id: 'buyer-2',
      role: 'buyer',
      behaviorProfile: 'adversarial',
      config: {},
      faults: []
    }
  ],
  timeline: [
    {
      stepId: 'step-1',
      action: 'createRequestConcurrent',
      actor: 'buyer-1,buyer-2',
      description: 'Both buyers create requests concurrently'
    },
    {
      stepId: 'step-2',
      action: 'submitPayment',
      actor: 'buyer-1,buyer-2',
      description: 'Both submit payments'
    }
  ],
  faults: [
    {
      id: 'fault-concurrent',
      type: 'concurrent_request',
      trigger: { event: 'request.created' },
      params: { concurrency: 2 },
      targetAgentId: 'buyer-1'
    }
  ],
  invariants: [
    {
      id: 'inv-1',
      description: 'No duplicate economic operation',
      type: 'economic',
      check: 'unique_payment_count == expected_count'
    },
    {
      id: 'inv-2',
      description: 'Idempotency preserved',
      type: 'state',
      check: 'idempotency_keys unique'
    },
    {
      id: 'inv-3',
      description: 'Correct final state',
      type: 'state',
      check: 'final_state matches expected'
    }
  ],
  seed: 42,
  assumptions: [
    'Concurrent requests can be simulated',
    'Target handles concurrency'
  ],
  expectedOutcome: {
    status: 'success',
    conditions: [
      'No duplicate economic operations',
      'Idempotency maintained',
      'Final state correct'
    ]
  }
};

/**
 * S6 — Payment Retry
 * 
 * Simulate retry/payment resubmission.
 * Check: retry does not create second economic obligation,
 * reconciliation tied to correct payment intent.
 */
export const paymentRetryScenario: ScenarioDefinition = {
  id: 'secretariat-payment-retry',
  description: 'Test that payment retry does not create duplicate obligations',
  target: 'secretariat',
  agents: [
    {
      id: 'buyer-1',
      role: 'buyer',
      behaviorProfile: 'faulty',
      config: {},
      faults: [
        {
          type: 'payment_retry',
          trigger: { event: 'payment.submitted' },
          params: { retryCount: 2 }
        }
      ]
    }
  ],
  timeline: [
    {
      stepId: 'step-1',
      action: 'createRequest',
      actor: 'buyer-1',
      description: 'Buyer creates a request'
    },
    {
      stepId: 'step-2',
      action: 'submitPayment',
      actor: 'buyer-1',
      description: 'Buyer submits payment (first attempt)'
    },
    {
      stepId: 'step-3',
      action: 'retryPayment',
      actor: 'buyer-1',
      description: 'Buyer retries payment'
    },
    {
      stepId: 'step-4',
      action: 'settlePayment',
      actor: 'system',
      description: 'Payment is settled'
    }
  ],
  faults: [
    {
      id: 'fault-retry',
      type: 'payment_retry',
      trigger: { event: 'payment.submitted' },
      params: { retryCount: 2 },
      targetAgentId: 'buyer-1'
    }
  ],
  invariants: [
    {
      id: 'inv-1',
      description: 'Retry does not create second obligation',
      type: 'economic',
      check: 'total_obligation == original_amount'
    },
    {
      id: 'inv-2',
      description: 'Reconciliation tied to correct intent',
      type: 'economic',
      check: 'reconciliation.payment_intent_id == original_intent_id'
    }
  ],
  seed: 42,
  assumptions: [
    'Payment retry is detectable',
    'Target supports idempotent payment handling'
  ],
  expectedOutcome: {
    status: 'success',
    conditions: [
      'No duplicate economic obligation',
      'Reconciliation correct'
    ]
  }
};

/**
 * S7 — Lost Delivery
 * 
 * Settlement/execution occur, but delivery/HTTP response is lost.
 * Check: payment settlement independent of HTTP response,
 * delivery uncertainty recorded separately,
 * system does not declare unjustified success.
 */
export const lostDeliveryScenario: ScenarioDefinition = {
  id: 'secretariat-lost-delivery',
  description: 'Test system behavior when delivery/response is lost after settlement',
  target: 'secretariat',
  agents: [
    {
      id: 'buyer-1',
      role: 'buyer',
      behaviorProfile: 'honest',
      config: {},
      faults: []
    },
    {
      id: 'seller-1',
      role: 'seller',
      behaviorProfile: 'faulty',
      config: {},
      faults: [
        {
          type: 'lost_delivery',
          trigger: { event: 'delivery.sent' },
          params: { lossProbability: 1.0 }
        }
      ]
    }
  ],
  timeline: [
    {
      stepId: 'step-1',
      action: 'createRequest',
      actor: 'buyer-1',
      description: 'Buyer creates a request'
    },
    {
      stepId: 'step-2',
      action: 'submitPayment',
      actor: 'buyer-1',
      description: 'Buyer submits payment'
    },
    {
      stepId: 'step-3',
      action: 'settlePayment',
      actor: 'system',
      description: 'Payment is settled'
    },
    {
      stepId: 'step-4',
      action: 'executeRequest',
      actor: 'seller-1',
      description: 'Seller executes request'
    },
    {
      stepId: 'step-5',
      action: 'sendDelivery',
      actor: 'seller-1',
      description: 'Seller sends delivery (lost)'
    }
  ],
  faults: [
    {
      id: 'fault-lost',
      type: 'lost_delivery',
      trigger: { event: 'delivery.sent' },
      params: { lossProbability: 1.0 },
      targetAgentId: 'seller-1'
    }
  ],
  invariants: [
    {
      id: 'inv-1',
      description: 'Payment settlement independent of delivery',
      type: 'economic',
      check: 'payment_settled == true regardless of delivery_status'
    },
    {
      id: 'inv-2',
      description: 'Delivery uncertainty recorded',
      type: 'evidence',
      check: 'delivery_status == "unknown" or "lost"'
    },
    {
      id: 'inv-3',
      description: 'No unjustified success declared',
      type: 'state',
      check: 'status != "success" without delivery confirmation'
    }
  ],
  seed: 42,
  assumptions: [
    'Delivery can be simulated as lost',
    'Target tracks delivery status separately'
  ],
  expectedOutcome: {
    status: 'success',
    conditions: [
      'Payment settled correctly',
      'Delivery uncertainty recorded',
      'No false success'
    ]
  }
};

/**
 * All Secretariat Scenarios
 */
export const secretariatScenarios: Record<string, ScenarioDefinition> = {
  'secretariat-duplicate-request': duplicateRequestScenario,
  'secretariat-payment-before-execution': paymentBeforeExecutionScenario,
  'secretariat-crash-after-settlement': crashAfterSettlementScenario,
  'secretariat-seller-timeout': sellerTimeoutScenario,
  'secretariat-concurrent-duplicate': concurrentDuplicateScenario,
  'secretariat-payment-retry': paymentRetryScenario,
  'secretariat-lost-delivery': lostDeliveryScenario
};
