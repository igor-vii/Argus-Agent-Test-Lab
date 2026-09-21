import { ScenarioDefinition } from './ScenarioDefinition';
import { AgentController } from './AgentController';
import { Assertion } from './Assertions';
import { RunResult } from './RunLifecycle';
import { AgentTargetPort } from './AgentTargetPort';
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
    constructor(scenario: ScenarioDefinition, controller: AgentController, targetPort: AgentTargetPort, assertions: Assertion[]);
    /**
     * Запуск полного прогона сценария.
     */
    run(): Promise<RunResult>;
}
//# sourceMappingURL=RunOrchestrator.d.ts.map