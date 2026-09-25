/**
 * Participant — любая сущность, которая действует в сценарии.
 *
 * Role ≠ Name: participantId — просто имя, не выводит protocolRole или ownership.
 * Role ≠ Ownership: protocolRole описывает что участник делает, ownership — кто им управляет.
 */
export interface Participant {
    participantId: string;
    protocolRole: string;
    ownership: 'ARGUS' | 'EXTERNAL';
}
//# sourceMappingURL=Participant.d.ts.map