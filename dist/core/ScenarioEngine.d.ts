import { AgentController } from './AgentController';
import { ScenarioDefinition } from './ScenarioDefinition';
import { RunContext } from './RunLifecycle';
import { FaultInjector } from './FaultInjector';
import { EvidenceCollector } from './EvidenceCollector';
import { PaymentRequired } from './AgentTargetPort';
/**
 * Callback for resolving payment requirements.
 *
 * ScenarioEngine calls this when an action returns PAYMENT_REQUIRED.
 * The callback is provided by RunOrchestrator, which knows about
 * PaymentAdapter. ScenarioEngine does NOT know how signing works.
 *
 * Returns a Base64-encoded payment signature (opaque to ScenarioEngine).
 */
export type PaymentResolver = (paymentRequired: PaymentRequired) => Promise<string>;
/**
 * Движок исполнения сценариев.
 *
 * Собирает evidence из результатов действий.
 * Знает actor (participantId), потому что это — семантика сценария.
 * AgentController — транспорт, не знает про actor.
 */
export declare class ScenarioEngine {
    private scenario;
    private context;
    private controller;
    private faultInjector;
    private evidenceCollector?;
    private paymentResolver?;
    constructor(scenario: ScenarioDefinition, context: RunContext, controller: AgentController, faultInjector: FaultInjector, evidenceCollector?: EvidenceCollector, paymentResolver?: PaymentResolver);
    /**
     * Запуск исполнения сценария.
     */
    execute(): Promise<void>;
    /**
     * Выполнение одного действия.
     */
    private executeAction;
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
    private performAction;
}
//# sourceMappingURL=ScenarioEngine.d.ts.map