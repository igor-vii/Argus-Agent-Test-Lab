// ============================================================
// src/core/ScenarioEngine.ts
// ============================================================
import { RunStatus } from './RunLifecycle';
/**
 * Движок исполнения сценариев.
 *
 * Собирает evidence из результатов действий.
 * Знает actor (participantId), потому что это — семантика сценария.
 * AgentController — транспорт, не знает про actor.
 */
export class ScenarioEngine {
    scenario;
    context;
    controller;
    faultInjector;
    evidenceCollector;
    constructor(scenario, context, controller, faultInjector, evidenceCollector) {
        this.scenario = scenario;
        this.context = context;
        this.controller = controller;
        this.faultInjector = faultInjector;
        this.evidenceCollector = evidenceCollector;
    }
    /**
     * Запуск исполнения сценария.
     */
    async execute() {
        this.context.status = RunStatus.RUNNING;
        try {
            for (const action of this.scenario.actions) {
                await this.executeAction(action);
            }
            if (this.context.status === RunStatus.RUNNING) {
                this.context.status = RunStatus.COMPLETED;
            }
        }
        catch (error) {
            this.context.status = RunStatus.FAILED;
            throw error;
        }
    }
    /**
     * Выполнение одного действия.
     */
    async executeAction(action) {
        const eventType = `action_${action.type}`;
        const faults = this.faultInjector.getFaultsForEvent(eventType);
        const emitCallback = (observation) => {
            this.evidenceCollector?.collect(observation, this.context.runId);
        };
        const baseOperation = async () => {
            await this.performAction(action);
        };
        if (faults.length === 0) {
            await baseOperation();
            return;
        }
        // Применяем fault'ы цепочкой: fault1(fault2(...faultN(operation))).
        // reduceRight — правый свёртыватель: последний fault оборачивает
        // operation первым, первый fault — последним (снаружи).
        const chained = faults.reduceRight((op, fault) => () => this.faultInjector.apply(fault, op, emitCallback), baseOperation);
        await chained();
    }
    /**
     * Непосредственное выполнение действия через контроллер.
     *
     * После выполнения — собирает evidence:
     * 1. Observations из exchange.metadata.observations
     * 2. Engine event: action_<type>
     *
     * NOTE: Если outcome.exchange отсутствует (например, action завершился
     * TIMEOUT), никакого fallback на action.type как observation не происходит.
     */
    async performAction(action) {
        const payload = action.payload || {};
        const outcome = await this.controller.act(action.type, payload);
        if (!this.evidenceCollector) {
            return;
        }
        const now = Date.now();
        // 1. Observations из metadata
        const observations = outcome.exchange?.metadata?.observations || [];
        for (const observationType of observations) {
            this.evidenceCollector.collect({
                source: this.scenario.testSubject,
                type: observationType,
                data: (outcome.exchange?.payload || {}),
                timestamp: now,
            }, this.context.runId);
        }
        // 2. Engine event: action был выполнен
        this.evidenceCollector.collect({
            source: 'engine',
            type: `action_${action.type}`,
            data: payload,
            timestamp: now,
        }, this.context.runId);
    }
}
// ============================================================
// КОНЕЦ ФАЙЛА
// ============================================================
//# sourceMappingURL=ScenarioEngine.js.map