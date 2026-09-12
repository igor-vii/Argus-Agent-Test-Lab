import { AgentRole } from '../core/AgentRuntime';
import { EventExistsAssertion, EvidencePresentAssertion, EventCountAssertion, AssertionGroup } from '../core/Assertions';
/**
 * S7 — Lost Delivery
 *
 * Цель: Проверить обработку потерянной доставки.
 * Invariant: Payment не повторяется при lost delivery.
 * Expected: DELIVERY_UNKNOWN + возможность retry без новой оплаты.
 */
export const S7_LostDelivery = {
    id: 'S7',
    name: 'Lost Delivery',
    description: 'Проверка обработки потерянной доставки',
    target: 'mock-target',
    agents: [
        {
            id: 'buyer-1',
            role: AgentRole.BUYER,
            capabilities: { canRequest: true, canPay: true, canObserve: true }
        },
        {
            id: 'seller-1',
            role: AgentRole.SELLER,
            capabilities: { canExecute: true }
        }
    ],
    actions: [
        { type: 'payment_settled', agentId: 'buyer-1' },
        { type: 'delivery_sent', agentId: 'seller-1' },
        { type: 'reconciliation_check', agentId: 'buyer-1' }
    ],
    faults: [
        {
            type: 'lost_delivery',
            trigger: 'delivery_sent',
            config: { drop_probability: 1.0 }
        }
    ],
    seed: 42,
    expectedInvariants: ['Оплата неизменна, доставка UNKNOWN'],
    metadata: {
        assertions: new AssertionGroup({
            operator: 'ALL',
            assertions: [
                new EventExistsAssertion('delivery_sent'),
                new EvidencePresentAssertion('DeliveryNotReceived', (e) => e.type === 'delivery_status' && e.data?.received === false),
                new EventCountAssertion('payment_operation', 1)
            ]
        })
    }
};
//# sourceMappingURL=S7_LostDelivery.js.map