import { ScenarioDefinition } from '../core/ScenarioDefinition';

export const S7_LostDelivery: ScenarioDefinition = {
  id: 'S7',
  name: 'Lost Delivery',
  description: 'Seller фактически ответил, но ответ потерян на канале seller-1 → secretariat',

  participants: [
    { participantId: 'buyer-1', protocolRole: 'BUYER', ownership: 'ARGUS' },
    {
      participantId: 'seller-1',
      protocolRole: 'SELLER',
      ownership: 'ARGUS', // см. rationale в S1
    },
    { participantId: 'secretariat', protocolRole: 'INTERMEDIARY', ownership: 'EXTERNAL' },
  ],

  topology: {
    edges: [
      { from: 'buyer-1', to: 'secretariat', kind: 'request' },
      { from: 'secretariat', to: 'seller-1', kind: 'forward' },
      { from: 'seller-1', to: 'secretariat', kind: 'response' },
    ],
  },

  testSubject: 'secretariat',

  actions: [
    {
      actor: 'buyer-1',
      type: 'request_payment',
      payload: { requestId: 'req-7', idempotencyKey: 'key-7', amount: 100 },
    },
  ],

  faults: [
    {
      target: { kind: 'edge', from: 'seller-1', to: 'secretariat' },
      type: 'lost_delivery',
      trigger: 'delivery_sent',
      config: { drop_probability: 1.0 },
    },
  ],

  invariants: [
    {
      id: 'lost_response_yields_unknown_not_duplicate',
      description: 'Seller фактически отправил ответ (наблюдается со стороны seller-1), но secretariat его не получил. Состояние — DELIVERY_UNKNOWN, платёж не дублируется, допустим повторный запрос к seller (не платёж).',
    },
  ],

  assertions: [
    {
      id: 'assert_seller_sent_but_secretariat_never_received',
      invariantId: 'lost_response_yields_unknown_not_duplicate',
      kind: 'behavioral',
      evaluate: (evidence) => {
        const sellerSent = evidence.find((e) => e.source === 'seller-1' && e.type === 'delivery_sent');
        if (!sellerSent) return { status: 'INCONCLUSIVE', reason: 'seller has not sent response yet' };

        const secretariatReceived = evidence.find(
          (e) => e.source === 'secretariat' && e.type === 'delivery_received'
        );
        if (secretariatReceived) return { status: 'FAIL', reason: 'fault did not actually drop the response — test setup invalid' };

        const duplicatePayment = evidence.filter(
          (e) => e.source === 'secretariat' && e.type === 'payment_settled'
        ).length;
        if (duplicatePayment > 1) {
          return { status: 'FAIL', reason: `duplicate payment triggered by lost response: ${duplicatePayment}` };
        }

        const unknown = evidence.find((e) => e.source === 'secretariat' && e.type === 'delivery_unknown');
        if (unknown) return { status: 'PASS' };

        const failed = evidence.find((e) => e.source === 'secretariat' && e.type === 'failed');
        if (failed) return { status: 'FAIL', reason: 'marked FAILED despite seller having actually responded' };

        return { status: 'INCONCLUSIVE', reason: 'no terminal state observed yet' };
      },
    },
  ],

  seed: 48,
};
