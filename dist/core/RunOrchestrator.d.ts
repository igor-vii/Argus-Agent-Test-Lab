import { ScenarioDefinition } from './ScenarioDefinition';
import { AgentController } from './AgentController';
import { EvidenceRecord } from './EvidenceCollector';
import { Assertion } from './Assertions';
import { RunResult } from './RunLifecycle';
import { AgentTargetPort } from './AgentTargetPort';
import { PaymentAdapter } from '../adapters/payment/PaymentAdapter';
/**
 * Оркестратор запуска тестового прогона.
 *
 * Создаёт EvidenceCollector и передаёт его в ScenarioEngine.
 * AgentController — транспорт, не знает про evidence.
 */
export declare class RunOrchestrator {
    private scenario;
    private controller;
    private targetPort;
    private evidenceCollector;
    private assertionEngine;
    private assertions;
    private paymentAdapter?;
    constructor(scenario: ScenarioDefinition, controller: AgentController, targetPort: AgentTargetPort, assertions: Assertion[], paymentAdapter?: PaymentAdapter);
    /**
     * Запуск полного прогона сценария.
     */
    run(): Promise<RunResult>;
    /**
     * Get all evidence records collected during the run.
     * Intended for tests and debugging.
     */
    getEvidence(): EvidenceRecord[];
}
//# sourceMappingURL=RunOrchestrator.d.ts.map