import { ScenarioDefinition } from '../core/ScenarioDefinition';

export const S6_PaymentRetry: ScenarioDefinition = {
  id: 'S6',
  name: 'Payment Retry',
  description: 'Adversarial buyer пытается создать новую authorization на UNKNOWN settlement',

  participants: [
    { participantId: 'buyer-1', protocolRole: 'CLIENT', ownership: 'ARGUS' },
    {
      // Block A correction (per-scenario roles): seller-1 отдаёт
      // protected resource (delivery_sent / delivery_completed) →
      // RESOURCE_SERVER. Отсутствие своего HTTP endpoint —
      // техническое ограничение wiring, не отсутствие роли.
      // Rationale см. S1.
      participantId: 'seller-1',
      protocolRole: 'RESOURCE_SERVER',
      ownership: 'ARGUS', // см. rationale в S1
    },
    { participantId: 'sut-1', protocolRole: 'FACILITATOR', ownership: 'EXTERNAL' },
  ],

  topology: {
    edges: [
      { from: 'buyer-1', to: 'sut-1', kind: 'request' },
      { from: 'sut-1', to: 'seller-1', kind: 'forward' },
    ],
  },

  testSubject: 'sut-1',

  actions: [
    {
      actor: 'buyer-1',
      type: 'request_payment',
      payload: { requestId: 'req-6', idempotencyKey: 'key-6', amount: 100 },
    },
  ],

  faults: [
    {
      target: { kind: 'participant', participantId: 'buyer-1' },
      type: 'retry',
      trigger: 'settlement_unknown',
      config: { retry_count: 3, new_authorization_each_time: true },
    },
  ],

  invariants: [
    {
      id: 'no_duplicate_payment_on_unknown',
      description: 'Пока reconciliation не подтвердил NOT_SETTLED, новая authorization для той же логической операции отклоняется.',
    },
  ],

  assertions: [
    {
      id: 'assert_no_duplicate_settlement',
      invariantId: 'no_duplicate_payment_on_unknown',
      kind: 'behavioral',
      referencedSources: ['sut-1'],
      evaluate: (evidence) => {
        const settlements = evidence.filter(
          (e) => e.source === 'sut-1' && e.type === 'payment_settled'
        );
        if (settlements.length > 1) {
          return { status: 'FAIL', reason: `${settlements.length} settled payments without confirmed NOT_SETTLED` };
        }
        if (settlements.length === 1) return { status: 'PASS' };
        return { status: 'INCONCLUSIVE', reason: 'no settlement observed yet' };
      },
    },
  ],

  seed: 46,
};
