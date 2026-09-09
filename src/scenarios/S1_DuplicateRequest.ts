import { ScenarioDefinition } from '../core/ScenarioDefinition';
import { AgentRole } from '../core/AgentRuntime';
import { EventCountAssertion, EventExistsAssertion, AssertionGroup } from '../core/Assertions';

/**
 * S1 — Duplicate Request
 * 
 * Цель: Проверить, что один logical request не создает несколько payment operations.
 * Invariant: Один запрос с одинаковым idempotency key → ровно 1 payment operation.
 */
export const S1_DuplicateRequest: ScenarioDefinition = {
  id: 'S1',
  name: 'Duplicate Request',
  description: 'Проверка идемпотентности при дублировании запроса',
  target: 'mock-target',
  agents: [
    {
      id: 'buyer-1',
      role: AgentRole.BUYER,
      capabilities: { canRequest: true, canPay: true, canObserve: true }
    }
  ],
  actions: [
    {
      type: 'duplicate_request',
      agentId: 'buyer-1',
      payload: { requestId: 'req-1', idempotencyKey: 'key-1' }
    }
  ],
  faults: [
    {
      type: 'duplicate_request',
      trigger: 'duplicate_request',
      config: { repeat_count: 2 }
    }
  ],
  seed: 42,
  expectedInvariants: ['Одна платежная операция на один логический запрос'],
  metadata: {
    assertions: new AssertionGroup({
      operator: 'ALL',
      assertions: [
        new EventCountAssertion('payment_intent', 1), // Должна быть ровно 1 операция
        new EventExistsAssertion('response_received') // Второй запрос должен вернуть существующий результат
      ]
    })
  }
};
