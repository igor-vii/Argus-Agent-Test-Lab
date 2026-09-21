import { AgentController } from './AgentController';
import { ScenarioDefinition } from './ScenarioDefinition';
import { RunContext } from './RunLifecycle';
import { FaultInjector } from './FaultInjector';
import { EvidenceCollector } from './EvidenceCollector';
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
    constructor(scenario: ScenarioDefinition, context: RunContext, controller: AgentController, faultInjector: FaultInjector, evidenceCollector?: EvidenceCollector);
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