import { RunStatus } from './RunLifecycle';
/**
 * Движок исполнения сценариев
 */
export class ScenarioEngine {
    scenario;
    context;
    controller;
    faultInjector;
    constructor(scenario, context, controller, faultInjector) {
        this.scenario = scenario;
        this.context = context;
        this.controller = controller;
        this.faultInjector = faultInjector;
    }
    /**
     * Запуск исполнения сценария
     */
    async execute() {
        this.context.status = RunStatus.RUNNING;
        try {
            // Последовательное выполнение действий timeline
            for (const action of this.scenario.actions) {
                if (this.context.status === RunStatus.FAILED) {
                    break;
                }
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
     * Выполнение одного действия
     */
    async executeAction(action) {
        // Применение фолтов если есть
        const fault = this.faultInjector.getFaultForAction(action.type);
        if (fault) {
            await this.faultInjector.apply(fault, async () => {
                await this.performAction(action);
            });
        }
        else {
            await this.performAction(action);
        }
    }
    /**
     * Непосредственное выполнение действия через контроллер
     */
    async performAction(action) {
        const payload = action.payload || {};
        // Используем контроллер для взаимодействия
        await this.controller.act(this.context.runId, {
            type: action.type,
            payload
        });
    }
}
//# sourceMappingURL=ScenarioEngine.js.map