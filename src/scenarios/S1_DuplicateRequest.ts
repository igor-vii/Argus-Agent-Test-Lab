import { ScenarioDefinition } from '../core/ScenarioDefinition';

export const S1_DuplicateRequest: ScenarioDefinition = {
  id: 'S1',
  name: 'Duplicate Request',
  description: 'Проверка идемпотентности при дублировании запроса',

  participants: [
    { participantId: 'buyer-1', protocolRole: 'BUYER', ownership: 'ARGUS' },
    {
      participantId: 'seller-1',
      protocolRole: 'SELLER',
      // Argus-owned: controllable seller behavior is the source of
      // fault injection, not the subject under test. If seller were
      // EXTERNAL, Argus could not deterministically force it to
      // "not respond" in S4 or to "lose delivery" in S7.
      ownership: 'ARGUS',
    },
    { participantId: 'secretariat', protocolRole: 'INTERMEDIARY', ownership: 'EXTERNAL' },
  ],

  topology: {
    edges: [
      { from: 'buyer-1', to: 'secretariat', kind: 'request' },
      { from: 'secretariat', to: 'seller-1', kind: 'forward' },
    ],
  },

  testSubject: 'secretariat',

  actions: [
    {
      actor: 'buyer-1',
      type: 'request_payment',
      payload: { requestId: 'req-1', idempotencyKey: 'key-1', amount: 100 },
    },
  ],

  faults: [
    {
      target: { kind: 'participant', participantId: 'buyer-1' },
      type: 'duplicate_request',
      trigger: 'action_request_payment',
      config: { repeat_count: 2 },
    },
  ],

  invariants: [
    {
      id: 'no_duplicate_payment_intent',
      description: 'При дублировании запроса с одинаковым idempotencyKey, Secretariat должен создать ровно один payment_intent.',
    },
  ],

  assertions: [
    {
      id: 'assert_no_duplicate',
      invariantId: 'no_duplicate_payment_intent',
      kind: 'behavioral',
      evaluate: (evidence) => {
        const count = evidence.filter(
          (e) => e.source === 'secretariat' &&
                 e.type === 'payment_intent_created' &&
                 (e.data as any)?.idempotencyKey === 'key-1'
        ).length;
        if (count === 1) return { status: 'PASS' };
        if (count > 1) return { status: 'FAIL', reason: `Expected 1, got ${count}` };
        return { status: 'INCONCLUSIVE' };
      },
    },
  ],

  seed: 42,
};
