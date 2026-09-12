import { AgentRole } from '../core/AgentRuntime';
import { EventCountAssertion, AssertionGroup } from '../core/Assertions';
/**
 * S6 — Payment Retry
 *
 * Цель: Проверить, что blind retry не создает дублирующую оплату.
 * Invariant: Повторные попытки только при доказанном NOT_SETTLED.
 */
export const S6_PaymentRetry = {
    id: 'S6',
    name: 'Payment Retry',
    description: 'Проверка корректности повторных попыток оплаты',
    target: 'mock-target',
    agents: [
        {
            id: 'buyer-1',
            role: AgentRole.BUYER,
            capabilities: { canRequest: true, canPay: true, canRetry: true }
        }
    ],
    actions: [
        { type: 'payment_attempt', agentId: 'buyer-1' },
        { type: 'settlement_check', agentId: 'buyer-1' }
    ],
    faults: [
        {
            type: 'payment_retry',
            trigger: 'payment_attempt',
            config: { retry_count: 3 }
        }
    ],
    seed: 42,
    expectedInvariants: ['Максимум одна экономически валидная оплата'],
    metadata: {
        assertions: new AssertionGroup({
            operator: 'ALL',
            assertions: [
                new EventCountAssertion('economic_settlement', 1)
            ]
        })
    }
};
//# sourceMappingURL=S6_PaymentRetry.js.map