// ============================================================
// src/core/RunOrchestrator.ts
// ============================================================
import { ScenarioEngine } from './ScenarioEngine';
import { FaultInjector } from './FaultInjector';
import { EvidenceCollector } from './EvidenceCollector';
import { AssertionEngine } from './AssertionEngine';
import { RunStatus, generateRunId } from './RunLifecycle';
import { deriveSigningBinding, defaultSigningIntentSource } from '../adapters/payment/SigningBinding';
import { ExecutionRegistry } from './ExecutionRegistry';
/**
 * Оркестратор запуска тестового прогона.
 *
 * Создаёт EvidenceCollector и передаёт его в ScenarioEngine.
 * AgentController — транспорт, не знает про evidence.
 */
export class RunOrchestrator {
    scenario;
    controllers;
    evidenceCollector;
    assertionEngine;
    assertions;
    paymentAdapter;
    bindingSource;
    constructor(scenario, controllers, assertions, paymentAdapter, bindingSource) {
        this.scenario = scenario;
        this.controllers = controllers;
        this.evidenceCollector = new EvidenceCollector();
        this.assertionEngine = new AssertionEngine();
        this.assertions = assertions;
        this.paymentAdapter = paymentAdapter;
        this.bindingSource = bindingSource;
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
            // Create registry and connect all controllers
            const registry = new ExecutionRegistry();
            for (const [actorId, controller] of this.controllers.entries()) {
                registry.register(actorId, controller);
                await controller.connect();
            }
            const faultInjector = new FaultInjector(this.scenario.faults);
            // Build payment resolver if paymentAdapter is provided.
            // Otherwise, ScenarioEngine records PAYMENT_REQUIRED as evidence and continues.
            //
            // ВАЖНО (design reasoning, §4.3): PaymentResolver сигнатура НЕ меняется —
            // ScenarioEngine по-прежнему работает с PaymentRequired (402 от Target).
            // Единственное место, где PaymentRequired превращается в SigningBinding,
            // — этот композиционный корень. Пока wire boundary с Secretariat не
            // зафиксирован (cross-system этап), intent-поля (nonce / validAfter /
            // validBefore) берутся из внешнего источника через this.bindingSource;
            // PaymentAdapter обязуется НЕ генерировать их локально.
            let paymentResolver;
            if (this.paymentAdapter) {
                const adapter = this.paymentAdapter;
                const bindingSource = this.bindingSource ?? defaultSigningIntentSource;
                paymentResolver = async (paymentRequired) => {
                    // Authorizer: Argus test wallet (если адаптер его раскрывает).
                    const argusAddress = adapter
                        .getArgusAddress;
                    if (typeof argusAddress !== 'function') {
                        throw new Error('PaymentAdapter does not expose getArgusAddress(); cannot set SigningBinding.from');
                    }
                    const intent = bindingSource(paymentRequired);
                    const binding = deriveSigningBinding({
                        scheme: paymentRequired.scheme,
                        network: paymentRequired.network,
                        amount: paymentRequired.amount,
                        asset: paymentRequired.asset,
                        payTo: paymentRequired.payTo,
                    }, argusAddress.call(adapter), intent);
                    return adapter.signX402Payment(binding);
                };
            }
            const engine = new ScenarioEngine(this.scenario, context, registry, faultInjector, this.evidenceCollector, paymentResolver);
            await engine.execute();
            // Disconnect all controllers
            for (const controller of this.controllers.values()) {
                await controller.disconnect();
            }
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
            // Disconnect all controllers on error
            for (const controller of this.controllers.values()) {
                try {
                    await controller.disconnect();
                }
                catch {
                    // Ignore disconnect errors during error handling
                }
            }
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