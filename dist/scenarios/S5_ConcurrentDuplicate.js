import { AgentRole } from '../core/AgentRuntime';
import { EventCountAssertion, AssertionGroup } from '../core/Assertions';
/**
 * S5 — Concurrent Duplicate
 *
 * Цель: Проверить идемпотентность при конкурентных запросах.
 * Invariant: 5 concurrent requests → максимум 1 payment operation.
 */
export const S5_ConcurrentDuplicate = {
    id: 'S5',
    name: 'Concurrent Duplicate',
    description: 'Проверка идемпотентности при конкурентных запросах',
    target: 'mock-target',
    agents: [
        {
            id: 'buyer-1',
            role: AgentRole.BUYER,
            capabilities: { canRequest: true, canPay: true }
        }
    ],
    actions: [
        {
            type: 'concurrent_request',
            agentId: 'buyer-1',
            payload: { requestId: 'req-concurrent', idempotencyKey: 'key-concurrent' }
        }
    ],
    faults: [
        {
            type: 'concurrent_request',
            trigger: 'concurrent_request',
            config: { parallel_count: 5 }
        }
    ],
    seed: 42,
    expectedInvariants: ['Одна операция на все конкурентные запросы'],
    metadata: {
        assertions: new AssertionGroup({
            operator: 'ALL',
            assertions: [
                new EventCountAssertion('payment_operation', 1)
            ]
        })
    }
};
//# sourceMappingURL=S5_ConcurrentDuplicate.js.map