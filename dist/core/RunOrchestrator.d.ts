import { ScenarioDefinition } from './ScenarioDefinition';
import { AgentController } from './AgentController';
import { EvidenceRecord } from './EvidenceCollector';
import { Assertion } from './Assertions';
import { RunResult } from './RunLifecycle';
import { PaymentAdapter } from '../adapters/payment/PaymentAdapter';
import { SigningIntentSource } from '../adapters/payment/SigningBinding';
/**
 * Оркестратор запуска тестового прогона.
 *
 * Создаёт EvidenceCollector и передаёт его в ScenarioEngine.
 * AgentController — транспорт, не знает про evidence.
 */
export declare class RunOrchestrator {
    private scenario;
    private controllers;
    private evidenceCollector;
    private assertionEngine;
    private assertions;
    private paymentAdapter?;
    private bindingSource?;
    constructor(scenario: ScenarioDefinition, controllers: Map<string, AgentController>, assertions: Assertion[], paymentAdapter?: PaymentAdapter, bindingSource?: SigningIntentSource);
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