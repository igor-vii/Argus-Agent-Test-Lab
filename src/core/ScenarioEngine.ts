import { AgentController } from './AgentController';
import { ScenarioDefinition, Action } from './ScenarioDefinition';
import { RunContext, RunStatus } from './RunLifecycle';
import { FaultInjector } from './FaultInjector';

/**
 * Движок исполнения сценариев
 */
export class ScenarioEngine {
  private scenario: ScenarioDefinition;
  private context: RunContext;
  private controller: AgentController;
  private faultInjector: FaultInjector;

  constructor(
    scenario: ScenarioDefinition,
    context: RunContext,
    controller: AgentController,
    faultInjector: FaultInjector
  ) {
    this.scenario = scenario;
    this.context = context;
    this.controller = controller;
    this.faultInjector = faultInjector;
  }

  /**
   * Запуск исполнения сценария
   */
  public async execute(): Promise<void> {
    this.context.status = RunStatus.RUNNING;

    try {
      // Последовательное выполнение действий timeline
      for (const action of this.scenario.actions) {
        await this.executeAction(action);
      }

      if (this.context.status === RunStatus.RUNNING) {
        this.context.status = RunStatus.COMPLETED;
      }
    } catch (error) {
      this.context.status = RunStatus.FAILED;
      throw error;
    }
  }

  /**
   * Выполнение одного действия
   */
  private async executeAction(action: Action): Promise<void> {
    // Применение фолтов если есть
    const fault = this.faultInjector.getFaultForAction(action.type);

    if (fault) {
      await this.faultInjector.apply(fault, async () => {
        await this.performAction(action);
      });
    } else {
      await this.performAction(action);
    }
  }

  /**
   * Непосредственное выполнение действия через контроллер
   */
  private async performAction(action: Action): Promise<void> {
    const payload = action.payload || {};

    // Используем контроллер для взаимодействия
    await this.controller.act(action.type, payload);
  }
}
