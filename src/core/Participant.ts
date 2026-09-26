/**
 * Canonical x402 v2 protocol roles (Block A).
 * Запрещено как protocolRole: BUYER, SELLER, PAYER, PAYEE, INTERMEDIARY,
 * AGENT, PROVIDER, REQUESTER, COUNTERPARTY.
 * FACILITATOR — только тип; facilitator-сценариев нет.
 */
export type ProtocolRole = 'CLIENT' | 'RESOURCE_SERVER' | 'FACILITATOR';

/**
 * Participant — любая сущность, которая действует в сценарии.
 *
 * Role ≠ Name: participantId — просто имя, не выводит protocolRole или ownership.
 * Role ≠ Ownership: protocolRole описывает что участник делает, ownership — кто им управляет.
 *
 * protocolRole OPTIONAL: отсутствие поля = app-level participant
 * (не protocol participant; например seller-1 в S1–S7 — orchestrator/executor
 * пост-оплаты, в x402 handshake не участвует).
 */
export interface Participant {
  participantId: string;       // просто имя, не несёт семантики
  protocolRole?: ProtocolRole; // canonical x402 roles; undefined = app-level
  ownership: 'ARGUS' | 'EXTERNAL';
}
