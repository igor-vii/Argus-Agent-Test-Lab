import { ScenarioEngine } from './ScenarioEngine';
import { ScenarioDefinition } from './ScenarioDefinition';
import { AgentController } from './AgentController';
import { FaultInjector } from './FaultInjector';
import { EvidenceCollector, EvidenceSource } from './EvidenceCollector';
import { AssertionEngine } from './AssertionEngine';
import { Assertion, AssertionGroup } from './Assertions';
import { RunContext, RunStatus, RunResult, generateRunId } from './RunLifecycle';
import { AgentTargetPort } from './AgentTargetPort';

/**
 * Оркестратор запуска тестового прогона
 */
export class RunOrchestrator {
  private scenario: ScenarioDefinition;
  private controller: AgentController;
  private targetPort: AgentTargetPort;
  private evidenceCollector: EvidenceCollector;
  private assertionEngine: AssertionEngine;
  private assertions: Assertion[] | AssertionGroup;

  constructor(
    scenario: ScenarioDefinition,
    controller: AgentController,
    targetPort: AgentTargetPort,
    assertions: Assertion[] | AssertionGroup
  ) {
    this.scenario = scenario;
    this.controller = controller;
    this.targetPort = targetPort;
    this.evidenceCollector = new EvidenceCollector();
    this.assertionEngine = new AssertionEngine();
    this.assertions = assertions;
  }

  /**
   * Запуск полного прогона сценария
   */
  public async run(): Promise<RunResult> {
    const runId = generateRunId();
    const startedAt = new Date();

    const context: RunContext = {
      runId,
      scenarioId: this.scenario.id,
      seed: this.scenario.seed,
      startedAt,
      status: RunStatus.CREATED
    };

    try {
      // Подключение к таргету
      await this.controller.connect();
      
      // Создание инжектора фолтов
      const faultInjector = new FaultInjector(this.scenario.faults);

      // Создание движка сценариев
      const engine = new ScenarioEngine(
        this.scenario,
        context,
        this.controller,
        faultInjector
      );

      // Перехват событий для сбора доказательств
      this.setupEvidenceCollection(runId);

      // Выполнение сценария
      await engine.execute();

      // Отключение
      await this.controller.disconnect();

      // Сбор доказательств и оценка
      const evidence = this.evidenceCollector.getEvidenceSet();
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
    } catch (error) {
      // Техническая ошибка выполнения
      context.status = RunStatus.FAILED;
      
      return {
        runId,
        scenarioId: this.scenario.id,
        status: RunStatus.FAILED,
        startedAt,
        finishedAt: new Date(),
        evidenceCount: this.evidenceCollector.count(),
        verdict: {
          status: 'INCONCLUSIVE',
          reason: `Runtime error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      };
    }
  }

  /**
   * Настройка сбора доказательств из runtime
   */
  private setupEvidenceCollection(runId: string): void {
    // Здесь можно добавить хуки в контроллер или адаптер для автоматического сбора
    // Для простоты собираем доказательства постфактум через обмен данными контроллера
    
    // В реальной реализации это должно быть интегрировано в AgentController
    // чтобы каждое взаимодействие автоматически записывалось в коллектор
  }
}
