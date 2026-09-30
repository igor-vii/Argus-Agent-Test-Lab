import { ScenarioDefinition } from '../core/ScenarioDefinition';

export const S6_PaymentRetry: ScenarioDefinition = {
  id: 'S6',
  name: 'Payment Retry',
  description: 'Adversarial buyer пытается создать новую authorization на UNKNOWN settlement',

  participants: [
    { participantId: 'client-1', protocolRole: 'CLIENT', ownership: 'ARGUS' },
    {
      // Block A correction (per-scenario roles): resource-server-1 отдаёт
      // protected resource (delivery_sent / delivery_completed) →
      // RESOURCE_SERVER. Отсутствие своего HTTP endpoint —
      // техническое ограничение wiring, не отсутствие роли.
      // Rationale см. S1.
      participantId: 'resource-server-1',
      protocolRole: 'RESOURCE_SERVER',
      ownership: 'ARGUS', // см. rationale в S1
    },
    { participantId: 'sut-1', protocolRole: 'FACILITATOR', ownership: 'EXTERNAL' },
  ],

  topology: {
    edges: [
      { from: 'client-1', to: 'sut-1', kind: 'request' },
      { from: 'sut-1', to: 'resource-server-1', kind: 'forward' },
    ],
  },

  testSubject: 'sut-1',

  // R3-D2 (Option B — Explicit Second Action): bounded payment retries are
  // modeled as explicit sequential Actions, one per attempt, each carrying a
  // distinct deterministic idempotency key (fresh authorization). The previous
  // lifecycle-triggered `retry` fault (trigger: 'settlement_unknown') was
  // declared-only under L0-F2 and never dispatched at runtime
  // (FaultInjector.getFaultsForEvent refuses non-action triggers), so removing
  // it changes no execution behavior. settlement_unknown remains an OBSERVATION
  // vocabulary term (see docs/evidence-source-map.md); it is not a dispatch
  // trigger here. Boundedness = finite action list (initial attempt +
  // retry_count(3) retries => 4 attempts total, preserving the established
  // "attempt 1 + N retries" semantics of handleRetry's retry_count).
  actions: [
    {
      actor: 'client-1',
      type: 'request_payment',
      payload: { requestId: 'req-6', idempotencyKey: 'key-6', amount: 100 },
    },
    {
      actor: 'client-1',
      type: 'request_payment',
      payload: { requestId: 'req-6-retry-1', idempotencyKey: 'key-6-retry-1', amount: 100 },
    },
    {
      actor: 'client-1',
      type: 'request_payment',
      payload: { requestId: 'req-6-retry-2', idempotencyKey: 'key-6-retry-2', amount: 100 },
    },
    {
      actor: 'client-1',
      type: 'request_payment',
      payload: { requestId: 'req-6-retry-3', idempotencyKey: 'key-6-retry-3', amount: 100 },
    },
  ],

  // No active faults: retries are explicit actions (R3-D2 Option B).
  faults: [],

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
