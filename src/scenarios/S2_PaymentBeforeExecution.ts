import { ScenarioDefinition } from '../core/ScenarioDefinition';

export const S2_PaymentBeforeExecution: ScenarioDefinition = {
  id: 'S2',
  name: 'Payment Before Execution',
  description: 'Платёж settled раньше, чем seller успевает ответить',

  participants: [
    { participantId: 'buyer-1', protocolRole: 'BUYER', ownership: 'ARGUS' },
    {
      participantId: 'seller-1',
      protocolRole: 'SELLER',
      // см. rationale в S1
      ownership: 'ARGUS',
    },
    { participantId: 'sut-1', protocolRole: 'INTERMEDIARY', ownership: 'EXTERNAL' },
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
      payload: { requestId: 'req-2', idempotencyKey: 'key-2', amount: 100 },
    },
  ],

  faults: [
    {
      target: { kind: 'participant', participantId: 'seller-1' },
      type: 'delayed_response',
      trigger: 'delivery_started',
      config: { delay_ms: 5000 },
    },
  ],

  invariants: [
    {
      id: 'no_premature_success',
      description: 'SUCCESS не должен фиксироваться раньше, чем seller фактически ответил.',
    },
  ],

  assertions: [
    {
      id: 'assert_no_premature_success',
      invariantId: 'no_premature_success',
      kind: 'behavioral',
      referencedSources: ['sut-1', 'seller-1'],
      evaluate: (evidence) => {
        const settled = evidence.find(
          (e) => e.source === 'sut-1' && e.type === 'payment_settled'
        );
        const success = evidence.find(
          (e) => e.source === 'sut-1' && e.type === 'success'
        );
        if (!settled) return { status: 'INCONCLUSIVE', reason: 'payment_settled not observed yet' };
        if (!success) return { status: 'INCONCLUSIVE', reason: 'success not observed yet — still pending, expected' };
        if (success.timestamp < settled.timestamp) {
          return { status: 'FAIL', reason: 'success recorded before payment_settled' };
        }
        const sellerReallyResponded = evidence.some(
          (e) => e.source === 'seller-1' && e.type === 'delivery_completed'
        );
        if (success && !sellerReallyResponded) {
          return { status: 'FAIL', reason: 'success recorded without seller actually responding' };
        }
        return { status: 'PASS' };
      },
    },
  ],

  seed: 43,
};
