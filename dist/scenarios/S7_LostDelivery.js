export const S7_LostDelivery = {
    id: 'S7',
    name: 'Lost Delivery',
    description: 'Seller фактически отвечает (respond), но ответ теряется на edge seller-1 → sut-1',
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
            { from: 'seller-1', to: 'sut-1', kind: 'response' },
        ],
    },
    testSubject: 'sut-1',
    actions: [
        {
            actor: 'buyer-1',
            type: 'request_payment',
            payload: { requestId: 'req-7', idempotencyKey: 'key-7', amount: 100 },
        },
    ],
    faults: [
        {
            // respond — НЕ fault по смыслу (baseline-поведение participant'а),
            // живёт здесь ради единообразия механизма emission
            // (FaultInjector.apply + callback).
            target: { kind: 'participant', participantId: 'seller-1' },
            type: 'respond',
            trigger: 'action_request_payment',
            config: { emit: 'delivery_sent' },
            approximated: true,
            // Mock-режим не различает "переслано seller-1" от
            // "target ответил" — см. Temporal Trust Boundary addendum.
        },
        {
            // В Mock-режиме V0 этот fault семантически объявлен,
            // но не имеет наблюдаемого эффекта: нет пути от
            // emission seller-1 к reception sut-1, который можно
            // дропнуть. Станет содержательным при HTTP-интеграции —
            // см. ROADMAP backlog.
            target: { kind: 'edge', from: 'seller-1', to: 'sut-1' },
            type: 'lost_delivery',
            trigger: 'delivery_sent',
            config: { drop_probability: 1.0 },
        },
    ],
    invariants: [
        {
            id: 'lost_response_yields_unknown_not_duplicate',
            description: 'Seller фактически отправил ответ (respond), но secretariat его не получил (edge fault). Состояние — DELIVERY_UNKNOWN, платёж не дублируется, допустим повторный запрос к seller (не платёж).',
        },
    ],
    assertions: [
        {
            id: 'assert_seller_sent_but_sut_never_received',
            invariantId: 'lost_response_yields_unknown_not_duplicate',
            kind: 'behavioral',
            referencedSources: ['seller-1', 'sut-1'],
            evaluate: (evidence) => {
                const sellerSent = evidence.find((e) => e.source === 'seller-1' && e.type === 'delivery_sent');
                if (!sellerSent)
                    return { status: 'INCONCLUSIVE', reason: 'seller has not sent response yet' };
                const sutReceived = evidence.find((e) => e.source === 'sut-1' && e.type === 'delivery_received');
                if (sutReceived)
                    return { status: 'FAIL', reason: 'edge fault did not actually drop the response — test setup invalid' };
                const duplicatePayment = evidence.filter((e) => e.source === 'sut-1' && e.type === 'payment_settled').length;
                if (duplicatePayment > 1) {
                    return { status: 'FAIL', reason: `duplicate payment triggered by lost response: ${duplicatePayment}` };
                }
                const unknown = evidence.find((e) => e.source === 'sut-1' && e.type === 'delivery_unknown');
                if (unknown)
                    return { status: 'PASS' };
                const failed = evidence.find((e) => e.source === 'sut-1' && e.type === 'failed');
                if (failed)
                    return { status: 'FAIL', reason: 'marked FAILED despite seller having actually responded' };
                return { status: 'INCONCLUSIVE', reason: 'no terminal state observed yet' };
            },
        },
    ],
    seed: 48,
};
//# sourceMappingURL=S7_LostDelivery.js.map