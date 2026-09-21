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
    paymentAdapter;
    constructor(scenario, controller, targetPort, assertions, paymentAdapter) {
        this.scenario = scenario;
        this.controller = controller;
        this.targetPort = targetPort;
        this.evidenceCollector = new EvidenceCollector();
        this.assertionEngine = new AssertionEngine();
        this.assertions = assertions;
        this.paymentAdapter = paymentAdapter;
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
            // Build payment resolver if paymentAdapter is provided.
            // Otherwise, ScenarioEngine records PAYMENT_REQUIRED as evidence and continues.
            let paymentResolver;
            if (this.paymentAdapter) {
                const adapter = this.paymentAdapter;
                paymentResolver = async (paymentRequired) => {
                    return adapter.signX402Payment(paymentRequired);
                };
            }
            else if (typeof this.targetPort.sendWithSignature === 'function') {
                // Target port supports payments, but no paymentAdapter was provided.
                // This may be intentional (adversarial scenario: buyer refuses to pay),
                // so we warn instead of throwing.
                console.warn(`[RunOrchestrator] Target port supports payments (PaymentCapablePort), ` +
                    `but no paymentAdapter was provided. PAYMENT_REQUIRED responses will be ` +
                    `recorded as evidence and the run will continue.`);
            }
            const engine = new ScenarioEngine(this.scenario, context, this.controller, faultInjector, this.evidenceCollector, paymentResolver);
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
    /**
     * Get all evidence records collected during the run.
     * Intended for tests and debugging.
     */
    getEvidence() {
        return this.evidenceCollector.getAllRecords();
    }
}
// ============================================================
// КОНЕЦ ФАЙЛА
// ============================================================
//# sourceMappingURL=RunOrchestrator.js.map