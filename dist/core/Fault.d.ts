/**
 * Fault — сбой, применяемый к участнику, edge или инфраструктуре.
 *
 * FaultTarget — три kind:
 * 1. participant — behavioral fault на участника
 * 2. edge — fault на канал связи
 * 3. infrastructure — fault на систему под тестом (testSubject)
 */
export type FaultTarget = {
    kind: 'participant';
    participantId: string;
} | {
    kind: 'edge';
    from: string;
    to: string;
} | {
    kind: 'infrastructure';
    component: 'testSubject';
};
export interface Fault {
    target: FaultTarget;
    type: string;
    trigger: string;
    config: Record<string, unknown>;
    /**
     * true — trigger не отражает реальный момент события 1:1,
     * approximation из-за ограничений Mock-режима.
     * Не влияет на runtime — metadata для аудита
     * (Temporal Trust Boundary).
     */
    approximated?: boolean;
}
//# sourceMappingURL=Fault.d.ts.map