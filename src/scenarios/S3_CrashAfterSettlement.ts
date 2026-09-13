import { ScenarioDefinition } from '../core/ScenarioDefinition';

export const S3_CrashAfterSettlement: ScenarioDefinition = {
  id: 'S3',
  name: 'Crash After Settlement',
  description: 'Secretariat падает и перезапускается сразу после payment_settled',

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
    ],
  },

  testSubject: 'secretariat',

  actions: [
    {
      actor: 'buyer-1',
      type: 'request_payment',
      payload: { requestId: 'req-3', idempotencyKey: 'key-3', amount: 100 },
    },
  ],

  faults: [
    {
      target: { kind: 'infrastructure', component: 'testSubject' },
      type: 'crash',
      trigger: 'payment_settled',
      config: { restart_after_ms: 2000 },
    },
  ],

  invariants: [
    {
      id: 'no_double_settlement_after_crash',
      description: 'После crash+restart ровно один settlement на операцию. Retry к seller возобновляется после restart, повторная оплата не создаётся.',
    },
  ],

  assertions: [
    {
      // Reference: S3 assertion — пример корректного применения kind: 'mixed'.
      // Evidence используется и от secretariat (payment_settled) — behavioral часть,
      // и от engine (recovery_completed, forward_request) — engine-behavior часть.
      id: 'assert_single_settlement_survives_crash',
      invariantId: 'no_double_settlement_after_crash',
      kind: 'mixed',
      evaluate: (evidence) => {
        const settlements = evidence.filter(
          (e) => e.source === 'secretariat' && e.type === 'payment_settled'
        );
        if (settlements.length === 0) {
          return { status: 'INCONCLUSIVE', reason: 'no settlement observed yet' };
        }
        if (settlements.length > 1) {
          return { status: 'FAIL', reason: `duplicate settlement after crash: ${settlements.length}` };
        }
        const restarted = evidence.some(
          (e) => e.source === 'secretariat' && e.type === 'recovery_completed'
        );
        if (!restarted) {
          return { status: 'INCONCLUSIVE', reason: 'restart/recovery not observed yet' };
        }
        const recoveryTs = evidence.find((r) => r.type === 'recovery_completed')?.timestamp ?? 0;
        const resumedForward = evidence.some(
          (e) => e.source === 'engine' &&
                 e.type === 'forward_request' &&
                 e.timestamp > recoveryTs
        );
        if (!resumedForward) {
          return { status: 'FAIL', reason: 'recovery completed but retry to seller never resumed' };
        }
        return { status: 'PASS' };
      },
    },
  ],

  seed: 47,
};
