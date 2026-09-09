import { ScenarioDefinition } from '../core/ScenarioDefinition';
import { AgentRole } from '../core/AgentRuntime';
import { EvidencePresentAssertion, AssertionGroup } from '../core/Assertions';

/**
 * S4 — Seller Timeout
 * 
 * Цель: Проверить, что таймаут не означает автоматически FAILED.
 * Expected state: DELIVERY_UNKNOWN.
 */
export const S4_SellerTimeout: ScenarioDefinition = {
  id: 'S4',
  name: 'Seller Timeout',
  description: 'Проверка обработки таймаута продавца',
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
    { type: 'await_delivery', agentId: 'buyer-1' }
  ],
  faults: [
    {
      type: 'seller_timeout',
      trigger: 'await_delivery',
      config: { timeout_ms: 30000 }
    }
  ],
  seed: 42,
  expectedInvariants: ['DELIVERY_UNKNOWN при отсутствии ответа'],
  metadata: {
    assertions: new AssertionGroup({
      operator: 'ALL',
      assertions: [
        new EvidencePresentAssertion(
          'DeliveryUnknownState',
          (e) => e.type === 'delivery_status' && e.data?.status === 'UNKNOWN'
        )
      ]
    })
  }
};
