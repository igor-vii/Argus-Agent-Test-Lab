/**
 * Participant — любая сущность, которая действует в сценарии.
 * 
 * Role ≠ Name: participantId — просто имя, не выводит protocolRole или ownership.
 * Role ≠ Ownership: protocolRole описывает что участник делает, ownership — кто им управляет.
 */
export interface Participant {
  participantId: string;      // просто имя, не несёт семантики
  protocolRole: string;       // ОТКРЫТАЯ строка, НЕ enum
  ownership: 'ARGUS' | 'EXTERNAL';
}
