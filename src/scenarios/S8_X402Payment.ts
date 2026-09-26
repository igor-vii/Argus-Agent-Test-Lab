import { ScenarioDefinition, Action } from '../core/ScenarioDefinition';
import { Evidence } from '../core/Evidence';

export const S8_X402Payment: ScenarioDefinition = {
  id: 'S8',
  name: 'X402 Payment Flow',
  description: 'Buyer получает 402, подписывает через PaymentAdapter, повторяет запрос с payment-signature',

  participants: [
    { participantId: 'buyer-1', protocolRole: 'CLIENT', ownership: 'ARGUS' },
    { participantId: 'sut-1', protocolRole: 'RESOURCE_SERVER', ownership: 'EXTERNAL' },
  ],

  topology: {
    edges: [
      { from: 'buyer-1', to: 'sut-1', kind: 'request' },
    ],
  },

  testSubject: 'sut-1',

  actions: [
    {
      actor: 'buyer-1',
      // Block A audit: request_resource — app-level имя для x402 step 1
      // (HTTP request to protected resource); canonical rename отложен в подблок A1.
      type: 'request_resource',
      payload: { resourceId: 'res-1' },
    },
  ],

  faults: [],

  invariants: [
    {
      id: 'payment_signed_and_retried',
      description: 'При получении 402 buyer должен подписать и повторить запрос.',
    },
  ],

  assertions: [
    {
      id: 'assert_payment_flow_completed',
      invariantId: 'payment_signed_and_retried',
      kind: 'engine-behavior',
      referencedSources: ['engine'],
      evaluate: (evidence: Evidence[]) => {
        const signed = evidence.find(
          (e) => e.source === 'engine' && e.type === 'payment_signed_and_retried'
        );
        if (signed) return { status: 'PASS' as const };
        return { status: 'FAIL' as const, reason: 'payment not signed and retried' };
      },
    },
  ],

  seed: 88,
};
