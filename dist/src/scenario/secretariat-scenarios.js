"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.secretariatScenarios = exports.lostDeliveryScenario = exports.paymentRetryScenario = exports.concurrentDuplicateScenario = exports.sellerTimeoutScenario = exports.crashAfterSettlementScenario = exports.paymentBeforeExecutionScenario = exports.duplicateRequestScenario = void 0;
/**
 * Secretariat Scenarios - 7 Canonical Adversarial Tests
 *
 * All invariants use explicit countEventsByType checks for evidence-based evaluation.
 */
/**
 * S1 — Duplicate Request
 *
 * Check: one logical request → one payment intent → one economic payment → one execution
 */
exports.duplicateRequestScenario = {
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
            check: "countEventsByType('target.createRequest') == 1"
        },
        {
            id: 'inv-2',
            description: 'Only one economic payment is settled',
            type: 'economic',
            check: "countEventsByType('target.submitPayment') == 1"
        },
        {
            id: 'inv-3',
            description: 'Only one execution occurs',
            type: 'execution',
            check: "countEventsByType('system.executeRequest') == 1"
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
 * Check: execution impossible before correct settlement
 */
exports.paymentBeforeExecutionScenario = {
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
            faults: []
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
            description: 'Payment submitted before execution attempt',
            type: 'state',
            check: "hasSequence(['action.submitPayment', 'action.attemptExecution'])"
        },
        {
            id: 'inv-2',
            description: 'No execution without settlement',
            type: 'economic',
            check: "countEventsByType('target.executeRequest') <= 0"
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
 * Check: payment not repeated, execution not duplicated, recovery preserves integrity.
 */
exports.crashAfterSettlementScenario = {
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
            description: 'Payment settled exactly once',
            type: 'economic',
            check: "countEventsByType('system.settlePayment') == 1"
        },
        {
            id: 'inv-2',
            description: 'No duplicate execution after recovery',
            type: 'execution',
            check: "countEventsByType('system.executeRequest') <= 1"
        },
        {
            id: 'inv-3',
            description: 'Recovery event recorded',
            type: 'state',
            check: "countEventsByType('system.recover') >= 1"
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
 * state remains UNKNOWN where evidence is insufficient.
 */
exports.sellerTimeoutScenario = {
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
            description: 'Order completed exactly once (will be INCONCLUSIVE due to timeout)',
            type: 'state',
            check: "countEventsByType('target.executeRequest') == 1"
        },
        {
            id: 'inv-2',
            description: 'Payment truth preserved (not failed due to timeout alone)',
            type: 'economic',
            check: "countEventsByType('action.submitPayment') >= 1"
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
 * Check: no duplicate economic operation, idempotency, correct final state.
 */
exports.concurrentDuplicateScenario = {
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
            description: 'Each request has unique payment',
            type: 'economic',
            check: "countEventsByType('action.submitPayment') >= 1"
        },
        {
            id: 'inv-2',
            description: 'Idempotency preserved',
            type: 'state',
            check: "countEventsByType('run.completed') == 1"
        },
        {
            id: 'inv-3',
            description: 'Final state recorded',
            type: 'state',
            check: "countEventsByType('run.completed') == 1"
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
 * Check: retry does not create second economic obligation.
 */
exports.paymentRetryScenario = {
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
            description: 'Single payment submission recorded',
            type: 'economic',
            check: "countEventsByType('target.submitPayment') == 1"
        },
        {
            id: 'inv-2',
            description: 'Settlement occurs once',
            type: 'economic',
            check: "countEventsByType('system.settlePayment') == 1"
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
 * delivery uncertainty recorded separately.
 */
exports.lostDeliveryScenario = {
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
            description: 'Payment settled regardless of delivery',
            type: 'economic',
            check: "countEventsByType('system.settlePayment') == 1"
        },
        {
            id: 'inv-2',
            description: 'Execution occurred',
            type: 'execution',
            check: "countEventsByType('action.executeRequest') == 1"
        },
        {
            id: 'inv-3',
            description: 'Delivery confirmation missing (INCONCLUSIVE expected)',
            type: 'evidence',
            check: "countEventsByType('target.sendDelivery') == 1"
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
exports.secretariatScenarios = {
    'secretariat-duplicate-request': exports.duplicateRequestScenario,
    'secretariat-payment-before-execution': exports.paymentBeforeExecutionScenario,
    'secretariat-crash-after-settlement': exports.crashAfterSettlementScenario,
    'secretariat-seller-timeout': exports.sellerTimeoutScenario,
    'secretariat-concurrent-duplicate': exports.concurrentDuplicateScenario,
    'secretariat-payment-retry': exports.paymentRetryScenario,
    'secretariat-lost-delivery': exports.lostDeliveryScenario
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjcmV0YXJpYXQtc2NlbmFyaW9zLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NjZW5hcmlvL3NlY3JldGFyaWF0LXNjZW5hcmlvcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQTs7OztHQUlHO0FBRUg7Ozs7R0FJRztBQUNVLFFBQUEsd0JBQXdCLEdBQXVCO0lBQzFELEVBQUUsRUFBRSwrQkFBK0I7SUFDbkMsV0FBVyxFQUFFLHlFQUF5RTtJQUN0RixNQUFNLEVBQUUsYUFBYTtJQUNyQixNQUFNLEVBQUU7UUFDTjtZQUNFLEVBQUUsRUFBRSxTQUFTO1lBQ2IsSUFBSSxFQUFFLE9BQU87WUFDYixlQUFlLEVBQUUsUUFBUTtZQUN6QixNQUFNLEVBQUUsRUFBRTtZQUNWLE1BQU0sRUFBRTtnQkFDTjtvQkFDRSxJQUFJLEVBQUUsbUJBQW1CO29CQUN6QixPQUFPLEVBQUUsRUFBRSxLQUFLLEVBQUUsaUJBQWlCLEVBQUU7b0JBQ3JDLE1BQU0sRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUU7aUJBQ3JCO2FBQ0Y7U0FDRjtLQUNGO0lBQ0QsUUFBUSxFQUFFO1FBQ1I7WUFDRSxNQUFNLEVBQUUsUUFBUTtZQUNoQixNQUFNLEVBQUUsZUFBZTtZQUN2QixLQUFLLEVBQUUsU0FBUztZQUNoQixXQUFXLEVBQUUsZ0RBQWdEO1NBQzlEO1FBQ0Q7WUFDRSxNQUFNLEVBQUUsUUFBUTtZQUNoQixNQUFNLEVBQUUsZUFBZTtZQUN2QixLQUFLLEVBQUUsU0FBUztZQUNoQixXQUFXLEVBQUUsdUJBQXVCO1NBQ3JDO1FBQ0Q7WUFDRSxNQUFNLEVBQUUsUUFBUTtZQUNoQixNQUFNLEVBQUUsZ0JBQWdCO1lBQ3hCLEtBQUssRUFBRSxVQUFVO1lBQ2pCLFdBQVcsRUFBRSw2QkFBNkI7U0FDM0M7S0FDRjtJQUNELE1BQU0sRUFBRTtRQUNOO1lBQ0UsRUFBRSxFQUFFLGVBQWU7WUFDbkIsSUFBSSxFQUFFLG1CQUFtQjtZQUN6QixP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QUFrQyxFQUFFLG1DQUEyQjtJQUMvRCwyQkFBMkIsRUFBRSw0QkFBb0I7SUFDakQsMkJBQTJCLEVBQUUsNEJBQW9CO0NBQ2xELENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTY2VuYXJpb0RlZmluaXRpb24gfSBmcm9tICcuL3R5cGVzJztcblxuLyoqXG4gKiBTZWNyZXRhcmlhdCBTY2VuYXJpb3MgLSA3IENhbm9uaWNhbCBBZHZlcnNhcmlhbCBUZXN0c1xuICogXG4gKiBBbGwgaW52YXJpYW50cyB1c2UgZXhwbGljaXQgY291bnRFdmVudHNCeVR5cGUgY2hlY2tzIGZvciBldmlkZW5jZS1iYXNlZCBldmFsdWF0aW9uLlxuICovXG5cbi8qKlxuICogUzEg4oCUIER1cGxpY2F0ZSBSZXF1ZXN0XG4gKiBcbiAqIENoZWNrOiBvbmUgbG9naWNhbCByZXF1ZXN0IOKGkiBvbmUgcGF5bWVudCBpbnRlbnQg4oaSIG9uZSBlY29ub21pYyBwYXltZW50IOKGkiBvbmUgZXhlY3V0aW9uXG4gKi9cbmV4cG9ydCBjb25zdCBkdXBsaWNhdGVSZXF1ZXN0U2NlbmFyaW86IFNjZW5hcmlvRGVmaW5pdGlvbiA9IHtcbiAgaWQ6ICdzZWNyZXRhcmlhdC1kdXBsaWNhdGUtcmVxdWVzdCcsXG4gIGRlc2NyaXB0aW9uOiAnVGVzdCB0aGF0IGR1cGxpY2F0ZSByZXF1ZXN0cyBkbyBub3QgY2F1c2UgZHVwbGljYXRlIGVjb25vbWljIG9wZXJhdGlvbnMnLFxuICB0YXJnZXQ6ICdzZWNyZXRhcmlhdCcsXG4gIGFnZW50czogW1xuICAgIHtcbiAgICAgIGlkOiAnYnV5ZXItMScsXG4gICAgICByb2xlOiAnYnV5ZXInLFxuICAgICAgYmVoYXZpb3JQcm9maWxlOiAnZmF1bHR5JyxcbiAgICAgIGNvbmZpZzoge30sXG4gICAgICBmYXVsdHM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHR5cGU6ICdkdXBsaWNhdGVfcmVxdWVzdCcsXG4gICAgICAgICAgdHJpZ2dlcjogeyBldmVudDogJ3JlcXVlc3QuY3JlYXRlZCcgfSxcbiAgICAgICAgICBwYXJhbXM6IHsgY291bnQ6IDIgfVxuICAgICAgICB9XG4gICAgICBdXG4gICAgfVxuICBdLFxuICB0aW1lbGluZTogW1xuICAgIHtcbiAgICAgIHN0ZXBJZDogJ3N0ZXAtMScsXG4gICAgICBhY3Rpb246ICdjcmVhdGVSZXF1ZXN0JyxcbiAgICAgIGFjdG9yOiAnYnV5ZXItMScsXG4gICAgICBkZXNjcmlwdGlvbjogJ0J1eWVyIGNyZWF0ZXMgYSByZXF1ZXN0ICh3aXRoIGR1cGxpY2F0ZSBmYXVsdCknXG4gICAgfSxcbiAgICB7XG4gICAgICBzdGVwSWQ6ICdzdGVwLTInLFxuICAgICAgYWN0aW9uOiAnc3VibWl0UGF5bWVudCcsXG4gICAgICBhY3RvcjogJ2J1eWVyLTEnLFxuICAgICAgZGVzY3JpcHRpb246ICdCdXllciBzdWJtaXRzIHBheW1lbnQnXG4gICAgfSxcbiAgICB7XG4gICAgICBzdGVwSWQ6ICdzdGVwLTMnLFxuICAgICAgYWN0aW9uOiAnZXhlY3V0ZVJlcXVlc3QnLFxuICAgICAgYWN0b3I6ICdzZWxsZXItMScsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlbGxlciBleGVjdXRlcyB0aGUgcmVxdWVzdCdcbiAgICB9XG4gIF0sXG4gIGZhdWx0czogW1xuICAgIHtcbiAgICAgIGlkOiAnZmF1bHQtZHVwLXJlcScsXG4gICAgICB0eXBlOiAnZHVwbGljYXRlX3JlcXVlc3QnLFxuICAgICAgdHJpZ2dlcjogeyBldmVudDogJ3JlcXVlc3QuY3JlYXRlZCcgfSxcbiAgICAgIHBhcmFtczogeyBjb3VudDogMiB9LFxuICAgICAgdGFyZ2V0QWdlbnRJZDogJ2J1eWVyLTEnXG4gICAgfVxuICBdLFxuICBpbnZhcmlhbnRzOiBbXG4gICAge1xuICAgICAgaWQ6ICdpbnYtMScsXG4gICAgICBkZXNjcmlwdGlvbjogJ09ubHkgb25lIHBheW1lbnQgaW50ZW50IGlzIGNyZWF0ZWQnLFxuICAgICAgdHlwZTogJ2Vjb25vbWljJyxcbiAgICAgIGNoZWNrOiBcImNvdW50RXZlbnRzQnlUeXBlKCd0YXJnZXQuY3JlYXRlUmVxdWVzdCcpID09IDFcIlxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6ICdpbnYtMicsXG4gICAgICBkZXNjcmlwdGlvbjogJ09ubHkgb25lIGVjb25vbWljIHBheW1lbnQgaXMgc2V0dGxlZCcsXG4gICAgICB0eXBlOiAnZWNvbm9taWMnLFxuICAgICAgY2hlY2s6IFwiY291bnRFdmVudHNCeVR5cGUoJ3RhcmdldC5zdWJtaXRQYXltZW50JykgPT0gMVwiXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogJ2ludi0zJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnT25seSBvbmUgZXhlY3V0aW9uIG9jY3VycycsXG4gICAgICB0eXBlOiAnZXhlY3V0aW9uJyxcbiAgICAgIGNoZWNrOiBcImNvdW50RXZlbnRzQnlUeXBlKCdzeXN0ZW0uZXhlY3V0ZVJlcXVlc3QnKSA9PSAxXCJcbiAgICB9XG4gIF0sXG4gIHNlZWQ6IDQyLFxuICBhc3N1bXB0aW9uczogW1xuICAgICdUYXJnZXQgc3VwcG9ydHMgaWRlbXBvdGVuY3kga2V5cycsXG4gICAgJ05ldHdvcmsgZGVsaXZlcnMgZHVwbGljYXRlIHJlcXVlc3RzJ1xuICBdLFxuICBleHBlY3RlZE91dGNvbWU6IHtcbiAgICBzdGF0dXM6ICdzdWNjZXNzJyxcbiAgICBjb25kaXRpb25zOiBbXG4gICAgICAnTm8gZHVwbGljYXRlIGVjb25vbWljIG9wZXJhdGlvbnMnLFxuICAgICAgJ0lkZW1wb3RlbmN5IHByZXNlcnZlZCdcbiAgICBdXG4gIH1cbn07XG5cbi8qKlxuICogUzIg4oCUIFBheW1lbnQgQmVmb3JlIEV4ZWN1dGlvblxuICogXG4gKiBDaGVjazogZXhlY3V0aW9uIGltcG9zc2libGUgYmVmb3JlIGNvcnJlY3Qgc2V0dGxlbWVudFxuICovXG5leHBvcnQgY29uc3QgcGF5bWVudEJlZm9yZUV4ZWN1dGlvblNjZW5hcmlvOiBTY2VuYXJpb0RlZmluaXRpb24gPSB7XG4gIGlkOiAnc2VjcmV0YXJpYXQtcGF5bWVudC1iZWZvcmUtZXhlY3V0aW9uJyxcbiAgZGVzY3JpcHRpb246ICdUZXN0IHRoYXQgZXhlY3V0aW9uIGNhbm5vdCBvY2N1ciBiZWZvcmUgY29ycmVjdCBwYXltZW50IHNldHRsZW1lbnQnLFxuICB0YXJnZXQ6ICdzZWNyZXRhcmlhdCcsXG4gIGFnZW50czogW1xuICAgIHtcbiAgICAgIGlkOiAnYnV5ZXItMScsXG4gICAgICByb2xlOiAnYnV5ZXInLFxuICAgICAgYmVoYXZpb3JQcm9maWxlOiAnYWR2ZXJzYXJpYWwnLFxuICAgICAgY29uZmlnOiB7fSxcbiAgICAgIGZhdWx0czogW11cbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiAnc2VsbGVyLTEnLFxuICAgICAgcm9sZTogJ3NlbGxlcicsXG4gICAgICBiZWhhdmlvclByb2ZpbGU6ICdhZHZlcnNhcmlhbCcsXG4gICAgICBjb25maWc6IHt9LFxuICAgICAgZmF1bHRzOiBbXVxuICAgIH1cbiAgXSxcbiAgdGltZWxpbmU6IFtcbiAgICB7XG4gICAgICBzdGVwSWQ6ICdzdGVwLTEnLFxuICAgICAgYWN0aW9uOiAnY3JlYXRlUmVxdWVzdCcsXG4gICAgICBhY3RvcjogJ2J1eWVyLTEnLFxuICAgICAgZGVzY3JpcHRpb246ICdCdXllciBjcmVhdGVzIGEgcmVxdWVzdCdcbiAgICB9LFxuICAgIHtcbiAgICAgIHN0ZXBJZDogJ3N0ZXAtMicsXG4gICAgICBhY3Rpb246ICdzdWJtaXRQYXltZW50JyxcbiAgICAgIGFjdG9yOiAnYnV5ZXItMScsXG4gICAgICBkZXNjcmlwdGlvbjogJ0J1eWVyIHN1Ym1pdHMgcGF5bWVudCdcbiAgICB9LFxuICAgIHtcbiAgICAgIHN0ZXBJZDogJ3N0ZXAtMycsXG4gICAgICBhY3Rpb246ICdhdHRlbXB0RXhlY3V0aW9uJyxcbiAgICAgIGFjdG9yOiAnc2VsbGVyLTEnLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWxsZXIgYXR0ZW1wdHMgZXhlY3V0aW9uIGJlZm9yZSBzZXR0bGVtZW50J1xuICAgIH1cbiAgXSxcbiAgZmF1bHRzOiBbXSxcbiAgaW52YXJpYW50czogW1xuICAgIHtcbiAgICAgIGlkOiAnaW52LTEnLFxuICAgICAgZGVzY3JpcHRpb246ICdQYXltZW50IHN1Ym1pdHRlZCBiZWZvcmUgZXhlY3V0aW9uIGF0dGVtcHQnLFxuICAgICAgdHlwZTogJ3N0YXRlJyxcbiAgICAgIGNoZWNrOiBcImhhc1NlcXVlbmNlKFsnYWN0aW9uLnN1Ym1pdFBheW1lbnQnLCAnYWN0aW9uLmF0dGVtcHRFeGVjdXRpb24nXSlcIlxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6ICdpbnYtMicsXG4gICAgICBkZXNjcmlwdGlvbjogJ05vIGV4ZWN1dGlvbiB3aXRob3V0IHNldHRsZW1lbnQnLFxuICAgICAgdHlwZTogJ2Vjb25vbWljJyxcbiAgICAgIGNoZWNrOiBcImNvdW50RXZlbnRzQnlUeXBlKCd0YXJnZXQuZXhlY3V0ZVJlcXVlc3QnKSA8PSAwXCJcbiAgICB9XG4gIF0sXG4gIHNlZWQ6IDQyLFxuICBhc3N1bXB0aW9uczogW1xuICAgICdUYXJnZXQgZW5mb3JjZXMgcGF5bWVudC1iZWZvcmUtZXhlY3V0aW9uIG9yZGVyaW5nJ1xuICBdLFxuICBleHBlY3RlZE91dGNvbWU6IHtcbiAgICBzdGF0dXM6ICdzdWNjZXNzJyxcbiAgICBjb25kaXRpb25zOiBbXG4gICAgICAnRXhlY3V0aW9uIGJsb2NrZWQgdW50aWwgc2V0dGxlbWVudCcsXG4gICAgICAnU3RhdGUgcmVtYWlucyBjb25zaXN0ZW50J1xuICAgIF1cbiAgfVxufTtcblxuLyoqXG4gKiBTMyDigJQgQ3Jhc2ggQWZ0ZXIgU2V0dGxlbWVudFxuICogXG4gKiBTaW11bGF0ZSBjcmFzaCBhZnRlciBzZXR0bGVtZW50LlxuICogQ2hlY2s6IHBheW1lbnQgbm90IHJlcGVhdGVkLCBleGVjdXRpb24gbm90IGR1cGxpY2F0ZWQsIHJlY292ZXJ5IHByZXNlcnZlcyBpbnRlZ3JpdHkuXG4gKi9cbmV4cG9ydCBjb25zdCBjcmFzaEFmdGVyU2V0dGxlbWVudFNjZW5hcmlvOiBTY2VuYXJpb0RlZmluaXRpb24gPSB7XG4gIGlkOiAnc2VjcmV0YXJpYXQtY3Jhc2gtYWZ0ZXItc2V0dGxlbWVudCcsXG4gIGRlc2NyaXB0aW9uOiAnVGVzdCBzeXN0ZW0gYmVoYXZpb3Igd2hlbiBjcmFzaCBvY2N1cnMgYWZ0ZXIgcGF5bWVudCBzZXR0bGVtZW50JyxcbiAgdGFyZ2V0OiAnc2VjcmV0YXJpYXQnLFxuICBhZ2VudHM6IFtcbiAgICB7XG4gICAgICBpZDogJ2J1eWVyLTEnLFxuICAgICAgcm9sZTogJ2J1eWVyJyxcbiAgICAgIGJlaGF2aW9yUHJvZmlsZTogJ2hvbmVzdCcsXG4gICAgICBjb25maWc6IHt9LFxuICAgICAgZmF1bHRzOiBbXVxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6ICdzZWxsZXItMScsXG4gICAgICByb2xlOiAnc2VsbGVyJyxcbiAgICAgIGJlaGF2aW9yUHJvZmlsZTogJ2ZhdWx0eScsXG4gICAgICBjb25maWc6IHt9LFxuICAgICAgZmF1bHRzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICB0eXBlOiAnY3Jhc2hfYWZ0ZXJfcGF5bWVudCcsXG4gICAgICAgICAgdHJpZ2dlcjogeyBldmVudDogJ3BheW1lbnQuc2V0dGxlZCcgfSxcbiAgICAgICAgICBwYXJhbXM6IHsgY3Jhc2hEZWxheTogMCB9XG4gICAgICAgIH1cbiAgICAgIF1cbiAgICB9XG4gIF0sXG4gIHRpbWVsaW5lOiBbXG4gICAge1xuICAgICAgc3RlcElkOiAnc3RlcC0xJyxcbiAgICAgIGFjdGlvbjogJ2NyZWF0ZVJlcXVlc3QnLFxuICAgICAgYWN0b3I6ICdidXllci0xJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQnV5ZXIgY3JlYXRlcyBhIHJlcXVlc3QnXG4gICAgfSxcbiAgICB7XG4gICAgICBzdGVwSWQ6ICdzdGVwLTInLFxuICAgICAgYWN0aW9uOiAnc3VibWl0UGF5bWVudCcsXG4gICAgICBhY3RvcjogJ2J1eWVyLTEnLFxuICAgICAgZGVzY3JpcHRpb246ICdCdXllciBzdWJtaXRzIHBheW1lbnQnXG4gICAgfSxcbiAgICB7XG4gICAgICBzdGVwSWQ6ICdzdGVwLTMnLFxuICAgICAgYWN0aW9uOiAnc2V0dGxlUGF5bWVudCcsXG4gICAgICBhY3RvcjogJ3N5c3RlbScsXG4gICAgICBkZXNjcmlwdGlvbjogJ1BheW1lbnQgaXMgc2V0dGxlZCdcbiAgICB9LFxuICAgIHtcbiAgICAgIHN0ZXBJZDogJ3N0ZXAtNCcsXG4gICAgICBhY3Rpb246ICdzaW11bGF0ZUNyYXNoJyxcbiAgICAgIGFjdG9yOiAnc2VsbGVyLTEnLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWxsZXIgY3Jhc2hlcyBhZnRlciBzZXR0bGVtZW50J1xuICAgIH0sXG4gICAge1xuICAgICAgc3RlcElkOiAnc3RlcC01JyxcbiAgICAgIGFjdGlvbjogJ3JlY292ZXInLFxuICAgICAgYWN0b3I6ICdzZWxsZXItMScsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlbGxlciByZWNvdmVycydcbiAgICB9XG4gIF0sXG4gIGZhdWx0czogW1xuICAgIHtcbiAgICAgIGlkOiAnZmF1bHQtY3Jhc2gnLFxuICAgICAgdHlwZTogJ2NyYXNoX2FmdGVyX3BheW1lbnQnLFxuICAgICAgdHJpZ2dlcjogeyBldmVudDogJ3BheW1lbnQuc2V0dGxlZCcgfSxcbiAgICAgIHBhcmFtczogeyBjcmFzaERlbGF5OiAwIH0sXG4gICAgICB0YXJnZXRBZ2VudElkOiAnc2VsbGVyLTEnXG4gICAgfVxuICBdLFxuICBpbnZhcmlhbnRzOiBbXG4gICAge1xuICAgICAgaWQ6ICdpbnYtMScsXG4gICAgICBkZXNjcmlwdGlvbjogJ1BheW1lbnQgc2V0dGxlZCBleGFjdGx5IG9uY2UnLFxuICAgICAgdHlwZTogJ2Vjb25vbWljJyxcbiAgICAgIGNoZWNrOiBcImNvdW50RXZlbnRzQnlUeXBlKCdzeXN0ZW0uc2V0dGxlUGF5bWVudCcpID09IDFcIlxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6ICdpbnYtMicsXG4gICAgICBkZXNjcmlwdGlvbjogJ05vIGR1cGxpY2F0ZSBleGVjdXRpb24gYWZ0ZXIgcmVjb3ZlcnknLFxuICAgICAgdHlwZTogJ2V4ZWN1dGlvbicsXG4gICAgICBjaGVjazogXCJjb3VudEV2ZW50c0J5VHlwZSgnc3lzdGVtLmV4ZWN1dGVSZXF1ZXN0JykgPD0gMVwiXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogJ2ludi0zJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUmVjb3ZlcnkgZXZlbnQgcmVjb3JkZWQnLFxuICAgICAgdHlwZTogJ3N0YXRlJyxcbiAgICAgIGNoZWNrOiBcImNvdW50RXZlbnRzQnlUeXBlKCdzeXN0ZW0ucmVjb3ZlcicpID49IDFcIlxuICAgIH1cbiAgXSxcbiAgc2VlZDogNDIsXG4gIGFzc3VtcHRpb25zOiBbXG4gICAgJ1N5c3RlbSBoYXMgY3Jhc2ggcmVjb3ZlcnkgbWVjaGFuaXNtJyxcbiAgICAnUGF5bWVudCBzdGF0ZSBpcyBwZXJzaXN0ZWQnXG4gIF0sXG4gIGV4cGVjdGVkT3V0Y29tZToge1xuICAgIHN0YXR1czogJ3N1Y2Nlc3MnLFxuICAgIGNvbmRpdGlvbnM6IFtcbiAgICAgICdObyBkdXBsaWNhdGUgcGF5bWVudCcsXG4gICAgICAnTm8gZHVwbGljYXRlIGV4ZWN1dGlvbicsXG4gICAgICAnRWNvbm9taWMgaW50ZWdyaXR5IG1haW50YWluZWQnXG4gICAgXVxuICB9XG59O1xuXG4vKipcbiAqIFM0IOKAlCBTZWxsZXIgVGltZW91dFxuICogXG4gKiBDaGVjazogdGltZW91dCBub3QgYXV0b21hdGljYWxseSB0cmVhdGVkIGFzIGVjb25vbWljIGZhaWx1cmUsXG4gKiBzdGF0ZSByZW1haW5zIFVOS05PV04gd2hlcmUgZXZpZGVuY2UgaXMgaW5zdWZmaWNpZW50LlxuICovXG5leHBvcnQgY29uc3Qgc2VsbGVyVGltZW91dFNjZW5hcmlvOiBTY2VuYXJpb0RlZmluaXRpb24gPSB7XG4gIGlkOiAnc2VjcmV0YXJpYXQtc2VsbGVyLXRpbWVvdXQnLFxuICBkZXNjcmlwdGlvbjogJ1Rlc3QgdGhhdCBzZWxsZXIgdGltZW91dCBkb2VzIG5vdCBjYXVzZSBpbmNvcnJlY3QgZWNvbm9taWMgc3RhdGUnLFxuICB0YXJnZXQ6ICdzZWNyZXRhcmlhdCcsXG4gIGFnZW50czogW1xuICAgIHtcbiAgICAgIGlkOiAnYnV5ZXItMScsXG4gICAgICByb2xlOiAnYnV5ZXInLFxuICAgICAgYmVoYXZpb3JQcm9maWxlOiAnaG9uZXN0JyxcbiAgICAgIGNvbmZpZzoge30sXG4gICAgICBmYXVsdHM6IFtdXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogJ3NlbGxlci0xJyxcbiAgICAgIHJvbGU6ICdzZWxsZXInLFxuICAgICAgYmVoYXZpb3JQcm9maWxlOiAnZmF1bHR5JyxcbiAgICAgIGNvbmZpZzoge30sXG4gICAgICBmYXVsdHM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHR5cGU6ICdzZWxsZXJfdGltZW91dCcsXG4gICAgICAgICAgdHJpZ2dlcjogeyBldmVudDogJ2V4ZWN1dGlvbi5zdGFydGVkJyB9LFxuICAgICAgICAgIHBhcmFtczogeyB0aW1lb3V0TXM6IDUwMDAgfVxuICAgICAgICB9XG4gICAgICBdXG4gICAgfVxuICBdLFxuICB0aW1lbGluZTogW1xuICAgIHtcbiAgICAgIHN0ZXBJZDogJ3N0ZXAtMScsXG4gICAgICBhY3Rpb246ICdjcmVhdGVSZXF1ZXN0JyxcbiAgICAgIGFjdG9yOiAnYnV5ZXItMScsXG4gICAgICBkZXNjcmlwdGlvbjogJ0J1eWVyIGNyZWF0ZXMgYSByZXF1ZXN0J1xuICAgIH0sXG4gICAge1xuICAgICAgc3RlcElkOiAnc3RlcC0yJyxcbiAgICAgIGFjdGlvbjogJ3N1Ym1pdFBheW1lbnQnLFxuICAgICAgYWN0b3I6ICdidXllci0xJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQnV5ZXIgc3VibWl0cyBwYXltZW50J1xuICAgIH0sXG4gICAge1xuICAgICAgc3RlcElkOiAnc3RlcC0zJyxcbiAgICAgIGFjdGlvbjogJ3N0YXJ0RXhlY3V0aW9uJyxcbiAgICAgIGFjdG9yOiAnc2VsbGVyLTEnLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWxsZXIgc3RhcnRzIGV4ZWN1dGlvbiBidXQgdGltZXMgb3V0J1xuICAgIH0sXG4gICAge1xuICAgICAgc3RlcElkOiAnc3RlcC00JyxcbiAgICAgIGFjdGlvbjogJ3RpbWVvdXQnLFxuICAgICAgYWN0b3I6ICdzZWxsZXItMScsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlbGxlciB0aW1lcyBvdXQgd2l0aG91dCByZXNwb25zZSdcbiAgICB9XG4gIF0sXG4gIGZhdWx0czogW1xuICAgIHtcbiAgICAgIGlkOiAnZmF1bHQtdGltZW91dCcsXG4gICAgICB0eXBlOiAnc2VsbGVyX3RpbWVvdXQnLFxuICAgICAgdHJpZ2dlcjogeyBldmVudDogJ2V4ZWN1dGlvbi5zdGFydGVkJyB9LFxuICAgICAgcGFyYW1zOiB7IHRpbWVvdXRNczogNTAwMCB9LFxuICAgICAgdGFyZ2V0QWdlbnRJZDogJ3NlbGxlci0xJ1xuICAgIH1cbiAgXSxcbiAgaW52YXJpYW50czogW1xuICAgIHtcbiAgICAgIGlkOiAnaW52LTEnLFxuICAgICAgZGVzY3JpcHRpb246ICdPcmRlciBjb21wbGV0ZWQgZXhhY3RseSBvbmNlICh3aWxsIGJlIElOQ09OQ0xVU0lWRSBkdWUgdG8gdGltZW91dCknLFxuICAgICAgdHlwZTogJ3N0YXRlJyxcbiAgICAgIGNoZWNrOiBcImNvdW50RXZlbnRzQnlUeXBlKCd0YXJnZXQuZXhlY3V0ZVJlcXVlc3QnKSA9PSAxXCJcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiAnaW52LTInLFxuICAgICAgZGVzY3JpcHRpb246ICdQYXltZW50IHRydXRoIHByZXNlcnZlZCAobm90IGZhaWxlZCBkdWUgdG8gdGltZW91dCBhbG9uZSknLFxuICAgICAgdHlwZTogJ2Vjb25vbWljJyxcbiAgICAgIGNoZWNrOiBcImNvdW50RXZlbnRzQnlUeXBlKCdhY3Rpb24uc3VibWl0UGF5bWVudCcpID49IDFcIlxuICAgIH1cbiAgXSxcbiAgc2VlZDogNDIsXG4gIGFzc3VtcHRpb25zOiBbXG4gICAgJ1RpbWVvdXQgaXMgZGV0ZWN0YWJsZScsXG4gICAgJ1N5c3RlbSBkaXN0aW5ndWlzaGVzIHRpbWVvdXQgZnJvbSBmYWlsdXJlJ1xuICBdLFxuICBleHBlY3RlZE91dGNvbWU6IHtcbiAgICBzdGF0dXM6ICdzdWNjZXNzJyxcbiAgICBjb25kaXRpb25zOiBbXG4gICAgICAnU3RhdGUgcmVtYWlucyBVTktOT1dOIG9yIHBlbmRpbmcnLFxuICAgICAgJ1BheW1lbnQgbm90IGluY29ycmVjdGx5IG1hcmtlZCBhcyBmYWlsZWQnXG4gICAgXVxuICB9XG59O1xuXG4vKipcbiAqIFM1IOKAlCBDb25jdXJyZW50IER1cGxpY2F0ZVxuICogXG4gKiBDcmVhdGUgY29uY3VycmVudCBkdXBsaWNhdGUgcmVxdWVzdHMgc2ltdWx0YW5lb3VzbHkuXG4gKiBDaGVjazogbm8gZHVwbGljYXRlIGVjb25vbWljIG9wZXJhdGlvbiwgaWRlbXBvdGVuY3ksIGNvcnJlY3QgZmluYWwgc3RhdGUuXG4gKi9cbmV4cG9ydCBjb25zdCBjb25jdXJyZW50RHVwbGljYXRlU2NlbmFyaW86IFNjZW5hcmlvRGVmaW5pdGlvbiA9IHtcbiAgaWQ6ICdzZWNyZXRhcmlhdC1jb25jdXJyZW50LWR1cGxpY2F0ZScsXG4gIGRlc2NyaXB0aW9uOiAnVGVzdCB0aGF0IGNvbmN1cnJlbnQgZHVwbGljYXRlIHJlcXVlc3RzIGFyZSBoYW5kbGVkIGNvcnJlY3RseScsXG4gIHRhcmdldDogJ3NlY3JldGFyaWF0JyxcbiAgYWdlbnRzOiBbXG4gICAge1xuICAgICAgaWQ6ICdidXllci0xJyxcbiAgICAgIHJvbGU6ICdidXllcicsXG4gICAgICBiZWhhdmlvclByb2ZpbGU6ICdhZHZlcnNhcmlhbCcsXG4gICAgICBjb25maWc6IHt9LFxuICAgICAgZmF1bHRzOiBbXVxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6ICdidXllci0yJyxcbiAgICAgIHJvbGU6ICdidXllcicsXG4gICAgICBiZWhhdmlvclByb2ZpbGU6ICdhZHZlcnNhcmlhbCcsXG4gICAgICBjb25maWc6IHt9LFxuICAgICAgZmF1bHRzOiBbXVxuICAgIH1cbiAgXSxcbiAgdGltZWxpbmU6IFtcbiAgICB7XG4gICAgICBzdGVwSWQ6ICdzdGVwLTEnLFxuICAgICAgYWN0aW9uOiAnY3JlYXRlUmVxdWVzdENvbmN1cnJlbnQnLFxuICAgICAgYWN0b3I6ICdidXllci0xLGJ1eWVyLTInLFxuICAgICAgZGVzY3JpcHRpb246ICdCb3RoIGJ1eWVycyBjcmVhdGUgcmVxdWVzdHMgY29uY3VycmVudGx5J1xuICAgIH0sXG4gICAge1xuICAgICAgc3RlcElkOiAnc3RlcC0yJyxcbiAgICAgIGFjdGlvbjogJ3N1Ym1pdFBheW1lbnQnLFxuICAgICAgYWN0b3I6ICdidXllci0xLGJ1eWVyLTInLFxuICAgICAgZGVzY3JpcHRpb246ICdCb3RoIHN1Ym1pdCBwYXltZW50cydcbiAgICB9XG4gIF0sXG4gIGZhdWx0czogW1xuICAgIHtcbiAgICAgIGlkOiAnZmF1bHQtY29uY3VycmVudCcsXG4gICAgICB0eXBlOiAnY29uY3VycmVudF9yZXF1ZXN0JyxcbiAgICAgIHRyaWdnZXI6IHsgZXZlbnQ6ICdyZXF1ZXN0LmNyZWF0ZWQnIH0sXG4gICAgICBwYXJhbXM6IHsgY29uY3VycmVuY3k6IDIgfSxcbiAgICAgIHRhcmdldEFnZW50SWQ6ICdidXllci0xJ1xuICAgIH1cbiAgXSxcbiAgaW52YXJpYW50czogW1xuICAgIHtcbiAgICAgIGlkOiAnaW52LTEnLFxuICAgICAgZGVzY3JpcHRpb246ICdFYWNoIHJlcXVlc3QgaGFzIHVuaXF1ZSBwYXltZW50JyxcbiAgICAgIHR5cGU6ICdlY29ub21pYycsXG4gICAgICBjaGVjazogXCJjb3VudEV2ZW50c0J5VHlwZSgnYWN0aW9uLnN1Ym1pdFBheW1lbnQnKSA+PSAxXCJcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiAnaW52LTInLFxuICAgICAgZGVzY3JpcHRpb246ICdJZGVtcG90ZW5jeSBwcmVzZXJ2ZWQnLFxuICAgICAgdHlwZTogJ3N0YXRlJyxcbiAgICAgIGNoZWNrOiBcImNvdW50RXZlbnRzQnlUeXBlKCdydW4uY29tcGxldGVkJykgPT0gMVwiXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogJ2ludi0zJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRmluYWwgc3RhdGUgcmVjb3JkZWQnLFxuICAgICAgdHlwZTogJ3N0YXRlJyxcbiAgICAgIGNoZWNrOiBcImNvdW50RXZlbnRzQnlUeXBlKCdydW4uY29tcGxldGVkJykgPT0gMVwiXG4gICAgfVxuICBdLFxuICBzZWVkOiA0MixcbiAgYXNzdW1wdGlvbnM6IFtcbiAgICAnQ29uY3VycmVudCByZXF1ZXN0cyBjYW4gYmUgc2ltdWxhdGVkJyxcbiAgICAnVGFyZ2V0IGhhbmRsZXMgY29uY3VycmVuY3knXG4gIF0sXG4gIGV4cGVjdGVkT3V0Y29tZToge1xuICAgIHN0YXR1czogJ3N1Y2Nlc3MnLFxuICAgIGNvbmRpdGlvbnM6IFtcbiAgICAgICdObyBkdXBsaWNhdGUgZWNvbm9taWMgb3BlcmF0aW9ucycsXG4gICAgICAnSWRlbXBvdGVuY3kgbWFpbnRhaW5lZCcsXG4gICAgICAnRmluYWwgc3RhdGUgY29ycmVjdCdcbiAgICBdXG4gIH1cbn07XG5cbi8qKlxuICogUzYg4oCUIFBheW1lbnQgUmV0cnlcbiAqIFxuICogU2ltdWxhdGUgcmV0cnkvcGF5bWVudCByZXN1Ym1pc3Npb24uXG4gKiBDaGVjazogcmV0cnkgZG9lcyBub3QgY3JlYXRlIHNlY29uZCBlY29ub21pYyBvYmxpZ2F0aW9uLlxuICovXG5leHBvcnQgY29uc3QgcGF5bWVudFJldHJ5U2NlbmFyaW86IFNjZW5hcmlvRGVmaW5pdGlvbiA9IHtcbiAgaWQ6ICdzZWNyZXRhcmlhdC1wYXltZW50LXJldHJ5JyxcbiAgZGVzY3JpcHRpb246ICdUZXN0IHRoYXQgcGF5bWVudCByZXRyeSBkb2VzIG5vdCBjcmVhdGUgZHVwbGljYXRlIG9ibGlnYXRpb25zJyxcbiAgdGFyZ2V0OiAnc2VjcmV0YXJpYXQnLFxuICBhZ2VudHM6IFtcbiAgICB7XG4gICAgICBpZDogJ2J1eWVyLTEnLFxuICAgICAgcm9sZTogJ2J1eWVyJyxcbiAgICAgIGJlaGF2aW9yUHJvZmlsZTogJ2ZhdWx0eScsXG4gICAgICBjb25maWc6IHt9LFxuICAgICAgZmF1bHRzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICB0eXBlOiAncGF5bWVudF9yZXRyeScsXG4gICAgICAgICAgdHJpZ2dlcjogeyBldmVudDogJ3BheW1lbnQuc3VibWl0dGVkJyB9LFxuICAgICAgICAgIHBhcmFtczogeyByZXRyeUNvdW50OiAyIH1cbiAgICAgICAgfVxuICAgICAgXVxuICAgIH1cbiAgXSxcbiAgdGltZWxpbmU6IFtcbiAgICB7XG4gICAgICBzdGVwSWQ6ICdzdGVwLTEnLFxuICAgICAgYWN0aW9uOiAnY3JlYXRlUmVxdWVzdCcsXG4gICAgICBhY3RvcjogJ2J1eWVyLTEnLFxuICAgICAgZGVzY3JpcHRpb246ICdCdXllciBjcmVhdGVzIGEgcmVxdWVzdCdcbiAgICB9LFxuICAgIHtcbiAgICAgIHN0ZXBJZDogJ3N0ZXAtMicsXG4gICAgICBhY3Rpb246ICdzdWJtaXRQYXltZW50JyxcbiAgICAgIGFjdG9yOiAnYnV5ZXItMScsXG4gICAgICBkZXNjcmlwdGlvbjogJ0J1eWVyIHN1Ym1pdHMgcGF5bWVudCAoZmlyc3QgYXR0ZW1wdCknXG4gICAgfSxcbiAgICB7XG4gICAgICBzdGVwSWQ6ICdzdGVwLTMnLFxuICAgICAgYWN0aW9uOiAncmV0cnlQYXltZW50JyxcbiAgICAgIGFjdG9yOiAnYnV5ZXItMScsXG4gICAgICBkZXNjcmlwdGlvbjogJ0J1eWVyIHJldHJpZXMgcGF5bWVudCdcbiAgICB9LFxuICAgIHtcbiAgICAgIHN0ZXBJZDogJ3N0ZXAtNCcsXG4gICAgICBhY3Rpb246ICdzZXR0bGVQYXltZW50JyxcbiAgICAgIGFjdG9yOiAnc3lzdGVtJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUGF5bWVudCBpcyBzZXR0bGVkJ1xuICAgIH1cbiAgXSxcbiAgZmF1bHRzOiBbXG4gICAge1xuICAgICAgaWQ6ICdmYXVsdC1yZXRyeScsXG4gICAgICB0eXBlOiAncGF5bWVudF9yZXRyeScsXG4gICAgICB0cmlnZ2VyOiB7IGV2ZW50OiAncGF5bWVudC5zdWJtaXR0ZWQnIH0sXG4gICAgICBwYXJhbXM6IHsgcmV0cnlDb3VudDogMiB9LFxuICAgICAgdGFyZ2V0QWdlbnRJZDogJ2J1eWVyLTEnXG4gICAgfVxuICBdLFxuICBpbnZhcmlhbnRzOiBbXG4gICAge1xuICAgICAgaWQ6ICdpbnYtMScsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NpbmdsZSBwYXltZW50IHN1Ym1pc3Npb24gcmVjb3JkZWQnLFxuICAgICAgdHlwZTogJ2Vjb25vbWljJyxcbiAgICAgIGNoZWNrOiBcImNvdW50RXZlbnRzQnlUeXBlKCd0YXJnZXQuc3VibWl0UGF5bWVudCcpID09IDFcIlxuICAgIH0sXG4gICAge1xuICAgICAgaWQ6ICdpbnYtMicsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NldHRsZW1lbnQgb2NjdXJzIG9uY2UnLFxuICAgICAgdHlwZTogJ2Vjb25vbWljJyxcbiAgICAgIGNoZWNrOiBcImNvdW50RXZlbnRzQnlUeXBlKCdzeXN0ZW0uc2V0dGxlUGF5bWVudCcpID09IDFcIlxuICAgIH1cbiAgXSxcbiAgc2VlZDogNDIsXG4gIGFzc3VtcHRpb25zOiBbXG4gICAgJ1BheW1lbnQgcmV0cnkgaXMgZGV0ZWN0YWJsZScsXG4gICAgJ1RhcmdldCBzdXBwb3J0cyBpZGVtcG90ZW50IHBheW1lbnQgaGFuZGxpbmcnXG4gIF0sXG4gIGV4cGVjdGVkT3V0Y29tZToge1xuICAgIHN0YXR1czogJ3N1Y2Nlc3MnLFxuICAgIGNvbmRpdGlvbnM6IFtcbiAgICAgICdObyBkdXBsaWNhdGUgZWNvbm9taWMgb2JsaWdhdGlvbicsXG4gICAgICAnUmVjb25jaWxpYXRpb24gY29ycmVjdCdcbiAgICBdXG4gIH1cbn07XG5cbi8qKlxuICogUzcg4oCUIExvc3QgRGVsaXZlcnlcbiAqIFxuICogU2V0dGxlbWVudC9leGVjdXRpb24gb2NjdXIsIGJ1dCBkZWxpdmVyeS9IVFRQIHJlc3BvbnNlIGlzIGxvc3QuXG4gKiBDaGVjazogcGF5bWVudCBzZXR0bGVtZW50IGluZGVwZW5kZW50IG9mIEhUVFAgcmVzcG9uc2UsXG4gKiBkZWxpdmVyeSB1bmNlcnRhaW50eSByZWNvcmRlZCBzZXBhcmF0ZWx5LlxuICovXG5leHBvcnQgY29uc3QgbG9zdERlbGl2ZXJ5U2NlbmFyaW86IFNjZW5hcmlvRGVmaW5pdGlvbiA9IHtcbiAgaWQ6ICdzZWNyZXRhcmlhdC1sb3N0LWRlbGl2ZXJ5JyxcbiAgZGVzY3JpcHRpb246ICdUZXN0IHN5c3RlbSBiZWhhdmlvciB3aGVuIGRlbGl2ZXJ5L3Jlc3BvbnNlIGlzIGxvc3QgYWZ0ZXIgc2V0dGxlbWVudCcsXG4gIHRhcmdldDogJ3NlY3JldGFyaWF0JyxcbiAgYWdlbnRzOiBbXG4gICAge1xuICAgICAgaWQ6ICdidXllci0xJyxcbiAgICAgIHJvbGU6ICdidXllcicsXG4gICAgICBiZWhhdmlvclByb2ZpbGU6ICdob25lc3QnLFxuICAgICAgY29uZmlnOiB7fSxcbiAgICAgIGZhdWx0czogW11cbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiAnc2VsbGVyLTEnLFxuICAgICAgcm9sZTogJ3NlbGxlcicsXG4gICAgICBiZWhhdmlvclByb2ZpbGU6ICdmYXVsdHknLFxuICAgICAgY29uZmlnOiB7fSxcbiAgICAgIGZhdWx0czogW1xuICAgICAgICB7XG4gICAgICAgICAgdHlwZTogJ2xvc3RfZGVsaXZlcnknLFxuICAgICAgICAgIHRyaWdnZXI6IHsgZXZlbnQ6ICdkZWxpdmVyeS5zZW50JyB9LFxuICAgICAgICAgIHBhcmFtczogeyBsb3NzUHJvYmFiaWxpdHk6IDEuMCB9XG4gICAgICAgIH1cbiAgICAgIF1cbiAgICB9XG4gIF0sXG4gIHRpbWVsaW5lOiBbXG4gICAge1xuICAgICAgc3RlcElkOiAnc3RlcC0xJyxcbiAgICAgIGFjdGlvbjogJ2NyZWF0ZVJlcXVlc3QnLFxuICAgICAgYWN0b3I6ICdidXllci0xJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQnV5ZXIgY3JlYXRlcyBhIHJlcXVlc3QnXG4gICAgfSxcbiAgICB7XG4gICAgICBzdGVwSWQ6ICdzdGVwLTInLFxuICAgICAgYWN0aW9uOiAnc3VibWl0UGF5bWVudCcsXG4gICAgICBhY3RvcjogJ2J1eWVyLTEnLFxuICAgICAgZGVzY3JpcHRpb246ICdCdXllciBzdWJtaXRzIHBheW1lbnQnXG4gICAgfSxcbiAgICB7XG4gICAgICBzdGVwSWQ6ICdzdGVwLTMnLFxuICAgICAgYWN0aW9uOiAnc2V0dGxlUGF5bWVudCcsXG4gICAgICBhY3RvcjogJ3N5c3RlbScsXG4gICAgICBkZXNjcmlwdGlvbjogJ1BheW1lbnQgaXMgc2V0dGxlZCdcbiAgICB9LFxuICAgIHtcbiAgICAgIHN0ZXBJZDogJ3N0ZXAtNCcsXG4gICAgICBhY3Rpb246ICdleGVjdXRlUmVxdWVzdCcsXG4gICAgICBhY3RvcjogJ3NlbGxlci0xJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VsbGVyIGV4ZWN1dGVzIHJlcXVlc3QnXG4gICAgfSxcbiAgICB7XG4gICAgICBzdGVwSWQ6ICdzdGVwLTUnLFxuICAgICAgYWN0aW9uOiAnc2VuZERlbGl2ZXJ5JyxcbiAgICAgIGFjdG9yOiAnc2VsbGVyLTEnLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWxsZXIgc2VuZHMgZGVsaXZlcnkgKGxvc3QpJ1xuICAgIH1cbiAgXSxcbiAgZmF1bHRzOiBbXG4gICAge1xuICAgICAgaWQ6ICdmYXVsdC1sb3N0JyxcbiAgICAgIHR5cGU6ICdsb3N0X2RlbGl2ZXJ5JyxcbiAgICAgIHRyaWdnZXI6IHsgZXZlbnQ6ICdkZWxpdmVyeS5zZW50JyB9LFxuICAgICAgcGFyYW1zOiB7IGxvc3NQcm9iYWJpbGl0eTogMS4wIH0sXG4gICAgICB0YXJnZXRBZ2VudElkOiAnc2VsbGVyLTEnXG4gICAgfVxuICBdLFxuICBpbnZhcmlhbnRzOiBbXG4gICAge1xuICAgICAgaWQ6ICdpbnYtMScsXG4gICAgICBkZXNjcmlwdGlvbjogJ1BheW1lbnQgc2V0dGxlZCByZWdhcmRsZXNzIG9mIGRlbGl2ZXJ5JyxcbiAgICAgIHR5cGU6ICdlY29ub21pYycsXG4gICAgICBjaGVjazogXCJjb3VudEV2ZW50c0J5VHlwZSgnc3lzdGVtLnNldHRsZVBheW1lbnQnKSA9PSAxXCJcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiAnaW52LTInLFxuICAgICAgZGVzY3JpcHRpb246ICdFeGVjdXRpb24gb2NjdXJyZWQnLFxuICAgICAgdHlwZTogJ2V4ZWN1dGlvbicsXG4gICAgICBjaGVjazogXCJjb3VudEV2ZW50c0J5VHlwZSgnYWN0aW9uLmV4ZWN1dGVSZXF1ZXN0JykgPT0gMVwiXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogJ2ludi0zJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRGVsaXZlcnkgY29uZmlybWF0aW9uIG1pc3NpbmcgKElOQ09OQ0xVU0lWRSBleHBlY3RlZCknLFxuICAgICAgdHlwZTogJ2V2aWRlbmNlJyxcbiAgICAgIGNoZWNrOiBcImNvdW50RXZlbnRzQnlUeXBlKCd0YXJnZXQuc2VuZERlbGl2ZXJ5JykgPT0gMVwiXG4gICAgfVxuICBdLFxuICBzZWVkOiA0MixcbiAgYXNzdW1wdGlvbnM6IFtcbiAgICAnRGVsaXZlcnkgY2FuIGJlIHNpbXVsYXRlZCBhcyBsb3N0JyxcbiAgICAnVGFyZ2V0IHRyYWNrcyBkZWxpdmVyeSBzdGF0dXMgc2VwYXJhdGVseSdcbiAgXSxcbiAgZXhwZWN0ZWRPdXRjb21lOiB7XG4gICAgc3RhdHVzOiAnc3VjY2VzcycsXG4gICAgY29uZGl0aW9uczogW1xuICAgICAgJ1BheW1lbnQgc2V0dGxlZCBjb3JyZWN0bHknLFxuICAgICAgJ0RlbGl2ZXJ5IHVuY2VydGFpbnR5IHJlY29yZGVkJyxcbiAgICAgICdObyBmYWxzZSBzdWNjZXNzJ1xuICAgIF1cbiAgfVxufTtcblxuLyoqXG4gKiBBbGwgU2VjcmV0YXJpYXQgU2NlbmFyaW9zXG4gKi9cbmV4cG9ydCBjb25zdCBzZWNyZXRhcmlhdFNjZW5hcmlvczogUmVjb3JkPHN0cmluZywgU2NlbmFyaW9EZWZpbml0aW9uPiA9IHtcbiAgJ3NlY3JldGFyaWF0LWR1cGxpY2F0ZS1yZXF1ZXN0JzogZHVwbGljYXRlUmVxdWVzdFNjZW5hcmlvLFxuICAnc2VjcmV0YXJpYXQtcGF5bWVudC1iZWZvcmUtZXhlY3V0aW9uJzogcGF5bWVudEJlZm9yZUV4ZWN1dGlvblNjZW5hcmlvLFxuICAnc2VjcmV0YXJpYXQtY3Jhc2gtYWZ0ZXItc2V0dGxlbWVudCc6IGNyYXNoQWZ0ZXJTZXR0bGVtZW50U2NlbmFyaW8sXG4gICdzZWNyZXRhcmlhdC1zZWxsZXItdGltZW91dCc6IHNlbGxlclRpbWVvdXRTY2VuYXJpbyxcbiAgJ3NlY3JldGFyaWF0LWNvbmN1cnJlbnQtZHVwbGljYXRlJzogY29uY3VycmVudER1cGxpY2F0ZVNjZW5hcmlvLFxuICAnc2VjcmV0YXJpYXQtcGF5bWVudC1yZXRyeSc6IHBheW1lbnRSZXRyeVNjZW5hcmlvLFxuICAnc2VjcmV0YXJpYXQtbG9zdC1kZWxpdmVyeSc6IGxvc3REZWxpdmVyeVNjZW5hcmlvXG59O1xuIl19