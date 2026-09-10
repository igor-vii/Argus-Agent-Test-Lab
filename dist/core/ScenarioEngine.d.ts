import { AgentController } from './AgentController';
import { ScenarioDefinition } from './ScenarioDefinition';
import { RunContext } from './RunLifecycle';
import { FaultInjector } from './FaultInjector';
/**
 * Движок исполнения сценариев
 */
export declare class ScenarioEngine {
    private scenario;
    private context;
    private controller;
    private faultInjector;
    constructor(scenario: ScenarioDefinition, context: RunContext, controller: AgentController, faultInjector: FaultInjector);
    /**
     * Запуск исполнения сценария
     */
    execute(): Promise<void>;
    /**
     * Выполнение одного действия
     */
    private executeAction;
    /**
     * Непосредственное выполнение действия через контроллер
     */
    private performAction;
}
//# sourceMappingURL=ScenarioEngine.d.ts.map