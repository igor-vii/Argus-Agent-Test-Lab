export const S4_SellerTimeout = {
    id: 'S4',
    name: 'Seller Timeout',
    description: 'Seller никогда не отвечает — проверяем DELIVERY_UNKNOWN, не FAILED/SUCCESS',
    participants: [
        { participantId: 'buyer-1', protocolRole: 'BUYER', ownership: 'ARGUS' },
        {
            participantId: 'seller-1',
            protocolRole: 'SELLER',
            ownership: 'ARGUS', // см. rationale в S1
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
            payload: { requestId: 'req-4', idempotencyKey: 'key-4', amount: 100 },
        },
    ],
    faults: [
        {
            target: { kind: 'participant', participantId: 'seller-1' },
            type: 'hang',
            trigger: 'delivery_started',
            config: { duration_ms: -1 },
        },
    ],
    invariants: [
        {
            id: 'timeout_yields_unknown_not_failed',
            description: 'Settled + seller не отвечает → DELIVERY_UNKNOWN, не FAILED, не SUCCESS, без повторной оплаты.',
        },
    ],
    assertions: [
        {
            id: 'assert_timeout_state',
            invariantId: 'timeout_yields_unknown_not_failed',
            kind: 'behavioral',
            referencedSources: ['sut-1', 'seller-1'],
            evaluate: (evidence) => {
                const settled = evidence.find((e) => e.source === 'sut-1' && e.type === 'payment_settled');
                if (!settled)
                    return { status: 'INCONCLUSIVE', reason: 'payment_settled not observed yet' };
                const failed = evidence.find((e) => e.source === 'sut-1' && e.type === 'failed');
                const success = evidence.find((e) => e.source === 'sut-1' && e.type === 'success');
                const unknown = evidence.find((e) => e.source === 'sut-1' && e.type === 'delivery_unknown');
                if (failed)
                    return { status: 'FAIL', reason: 'marked FAILED without seller ever responding' };
                if (success)
                    return { status: 'FAIL', reason: 'marked SUCCESS without seller ever responding' };
                const settlementCount = evidence.filter((e) => e.source === 'sut-1' && e.type === 'payment_settled').length;
                if (settlementCount > 1) {
                    return { status: 'FAIL', reason: `duplicate settlement attempted: ${settlementCount}` };
                }
                if (unknown)
                    return { status: 'PASS' };
                return { status: 'INCONCLUSIVE', reason: 'no terminal state observed yet' };
            },
        },
    ],
    seed: 44,
};
//# sourceMappingURL=S4_SellerTimeout.js.map