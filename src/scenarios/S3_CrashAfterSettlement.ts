import { ScenarioDefinition } from '../core/ScenarioDefinition';
import { AgentRole } from '../core/AgentRuntime';
import { EventCountAssertion, EventExistsAssertion, AssertionGroup } from '../core/Assertions';

/**
 * S3 — Crash After Settlement
 * 
 * Цель: Проверить восстановление после краша без дублирования оплаты.
 * Invariant: После crash/restart должна остаться ровно 1 payment operation.
 */
export const S3_CrashAfterSettlement: ScenarioDefinition = {
  id: 'S3',
  name: 'Crash After Settlement',
  description: 'Проверка восстановления после краша',
  target: 'mock-target',
  agents: [
    {
      id: 'buyer-1',
      role: AgentRole.BUYER,
      capabilities: { canRequest: true, canPay: true, canRetry: true }
    }
  ],
  actions: [
    { type: 'payment_settled', agentId: 'buyer-1' },
    { type: 'recovery_check', agentId: 'buyer-1' }
  ],
  faults: [
    {
      type: 'crash_after_payment',
      trigger: 'payment_settled'
    }
  ],
  seed: 42,
  expectedInvariants: ['Одна оплата после восстановления'],
  metadata: {
    assertions: new AssertionGroup({
      operator: 'ALL',
      assertions: [
        new EventCountAssertion('payment_operation', 1),
        new EventExistsAssertion('session_restored')
      ]
    })
  }
};
