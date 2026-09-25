// ============================================================
// src/core/ScenarioEngine.ts
// ============================================================
import { RunStatus } from './RunLifecycle';
import { ExchangeStatus } from './AgentTargetPort';
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
    registry;
    faultInjector;
    evidenceCollector;
    paymentResolver;
    constructor(scenario, context, registry, faultInjector, evidenceCollector, paymentResolver) {
        this.scenario = scenario;
        this.context = context;
        this.registry = registry;
        this.faultInjector = faultInjector;
        this.evidenceCollector = evidenceCollector;
        this.paymentResolver = paymentResolver;
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
        const controller = this.registry.get(action.actor);
        if (!controller) {
            throw new Error(`No controller registered for actor: ${action.actor}`);
        }
        const payload = action.payload || {};
        let outcome = await controller.act(action.type, payload);
        // Handle PAYMENT_REQUIRED via resolver (if provided)
        if (outcome.status === ExchangeStatus.PAYMENT_REQUIRED &&
            outcome.exchange?.paymentRequired) {
            if (!this.paymentResolver) {
                // No resolver — record UNKNOWN in evidence, continue
                if (this.evidenceCollector) {
                    this.evidenceCollector.collect({
                        source: 'engine',
                        type: 'payment_required_no_resolver',
                        data: {
                            actionType: action.type,
                            paymentRequired: outcome.exchange.paymentRequired,
                        },
                        timestamp: Date.now(),
                    }, this.context.runId);
                }
                return;
            }
            try {
                const signature = await this.paymentResolver(outcome.exchange.paymentRequired);
                // Retry with signature
                outcome = await controller.actWithSignature(action.type, payload, signature);
                // Record that payment was signed and retried
                if (this.evidenceCollector) {
                    this.evidenceCollector.collect({
                        source: 'engine',
                        type: 'payment_signed_and_retried',
                        data: {
                            actionType: action.type,
                        },
                        timestamp: Date.now(),
                    }, this.context.runId);
                }
            }
            catch (error) {
                // Signing or retry failed — record as engine event
                if (this.evidenceCollector) {
                    this.evidenceCollector.collect({
                        source: 'engine',
                        type: 'payment_signing_failed',
                        data: {
                            actionType: action.type,
                            error: error instanceof Error ? error.message : String(error),
                        },
                        timestamp: Date.now(),
                    }, this.context.runId);
                }
                return;
            }
        }
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