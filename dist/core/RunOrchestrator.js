// ============================================================
// src/core/RunOrchestrator.ts
// ============================================================
import { ScenarioEngine } from './ScenarioEngine';
import { FaultInjector } from './FaultInjector';
import { EvidenceCollector } from './EvidenceCollector';
import { AssertionEngine } from './AssertionEngine';
import { RunStatus, generateRunId } from './RunLifecycle';
/**
 * Оркестратор запуска тестового прогона.
 *
 * Создаёт EvidenceCollector и передаёт его в ScenarioEngine.
 * AgentController — транспорт, не знает про evidence.
 */
export class RunOrchestrator {
    scenario;
    controller;
    targetPort;
    evidenceCollector;
    assertionEngine;
    assertions;
    constructor(scenario, controller, targetPort, assertions) {
        this.scenario = scenario;
        this.controller = controller;
        this.targetPort = targetPort;
        this.evidenceCollector = new EvidenceCollector();
        this.assertionEngine = new AssertionEngine();
        this.assertions = assertions;
    }
    /**
     * Запуск полного прогона сценария.
     */
    async run() {
        const runId = generateRunId();
        const startedAt = new Date();
        const context = {
            runId,
            scenarioId: this.scenario.id,
            seed: this.scenario.seed,
            startedAt,
            status: RunStatus.CREATED
        };
        try {
            await this.controller.connect();
            const faultInjector = new FaultInjector(this.scenario.faults);
            const engine = new ScenarioEngine(this.scenario, context, this.controller, faultInjector, this.evidenceCollector);
            await engine.execute();
            await this.controller.disconnect();
            const evidence = this.evidenceCollector.getEvidenceSet(runId);
            const assertionResult = this.assertionEngine.evaluate(evidence, this.assertions);
            return {
                runId,
                scenarioId: this.scenario.id,
                status: context.status,
                startedAt,
                finishedAt: new Date(),
                evidenceCount: evidence.length,
                verdict: {
                    status: assertionResult.status,
                    reason: assertionResult.reasons.join('; ')
                }
            };
        }
        catch (error) {
            context.status = RunStatus.FAILED;
            return {
                runId,
                scenarioId: this.scenario.id,
                status: RunStatus.FAILED,
                startedAt,
                finishedAt: new Date(),
                evidenceCount: this.evidenceCollector.count(runId),
                verdict: {
                    status: 'INCONCLUSIVE',
                    reason: `Runtime error: ${error instanceof Error ? error.message : 'Unknown error'}`
                }
            };
        }
    }
}
// ============================================================
// КОНЕЦ ФАЙЛА
// ============================================================
//# sourceMappingURL=RunOrchestrator.js.map