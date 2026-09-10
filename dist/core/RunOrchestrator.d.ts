import { ScenarioDefinition } from './ScenarioDefinition';
import { AgentController } from './AgentController';
import { Assertion, AssertionGroup } from './Assertions';
import { RunResult } from './RunLifecycle';
import { AgentTargetPort } from './AgentTargetPort';
/**
 * Оркестратор запуска тестового прогона
 */
export declare class RunOrchestrator {
    private scenario;
    private controller;
    private targetPort;
    private evidenceCollector;
    private assertionEngine;
    private assertions;
    constructor(scenario: ScenarioDefinition, controller: AgentController, targetPort: AgentTargetPort, assertions: Assertion[] | AssertionGroup);
    /**
     * Запуск полного прогона сценария
     */
    run(): Promise<RunResult>;
    /**
     * Настройка сбора доказательств из runtime
     */
    private setupEvidenceCollection;
}
//# sourceMappingURL=RunOrchestrator.d.ts.map