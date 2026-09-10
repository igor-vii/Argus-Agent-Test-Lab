import { AgentConfig } from './AgentRuntime';
/**
 * Определение действия в сценарии
 */
export interface ScenarioAction {
    type: string;
    agentId: string;
    payload?: Record<string, unknown>;
    timeout?: number;
}
/**
 * Определение фолта (сбоя) в сценарии
 */
export interface ScenarioFault {
    type: 'duplicate_request' | 'delayed_payment' | 'crash_after_payment' | 'seller_timeout' | 'concurrent_request' | 'payment_retry' | 'lost_delivery';
    trigger?: string;
    config?: Record<string, unknown>;
}
/**
 * Каноническое определение сценария тестирования
 */
export interface ScenarioDefinition {
    id: string;
    name: string;
    description?: string;
    target: string;
    agents: AgentConfig[];
    actions: ScenarioAction[];
    faults: ScenarioFault[];
    seed: number;
    expectedInvariants?: string[];
    metadata?: Record<string, unknown>;
}
//# sourceMappingURL=ScenarioDefinition.d.ts.map