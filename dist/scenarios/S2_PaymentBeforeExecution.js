import { AgentRole } from '../core/AgentRuntime';
import { EventOrderingAssertion, AssertionGroup } from '../core/Assertions';
/**
 * S2 — Payment Before Execution
 *
 * Цель: Проверить порядок PAYMENT → EXECUTION.
 * Invariant: payment_settled должен наблюдаться до execution_started.
 */
export const S2_PaymentBeforeExecution = {
    id: 'S2',
    name: 'Payment Before Execution',
    description: 'Проверка порядка оплаты и исполнения',
    target: 'mock-target',
    agents: [
        {
            id: 'buyer-1',
            role: AgentRole.BUYER,
            capabilities: { canRequest: true, canPay: true }
        },
        {
            id: 'seller-1',
            role: AgentRole.SELLER,
            capabilities: { canExecute: true, canObserve: true }
        }
    ],
    actions: [
        { type: 'payment_initiated', agentId: 'buyer-1' },
        { type: 'delivery_started', agentId: 'seller-1' }
    ],
    faults: [
        {
            type: 'delayed_payment',
            trigger: 'delivery_started',
            config: { delay_ms: 5000 }
        }
    ],
    seed: 42,
    expectedInvariants: ['Оплата предшествует исполнению'],
    metadata: {
        assertions: new AssertionGroup({
            operator: 'ALL',
            assertions: [
                new EventOrderingAssertion('payment_settled', 'execution_started')
            ]
        })
    }
};
//# sourceMappingURL=S2_PaymentBeforeExecution.js.map