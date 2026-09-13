// ============================================================
// src/core/ScenarioEngine.ts
// ============================================================

import { AgentController } from './AgentController';
import { ScenarioDefinition, Action } from './ScenarioDefinition';
import { RunContext, RunStatus } from './RunLifecycle';
import { FaultInjector } from './FaultInjector';
import { EvidenceCollector } from './EvidenceCollector';

/**
 * Движок исполнения сценариев.
 *
 * Собирает evidence из результатов действий.
 * Знает actor (participantId), потому что это — семантика сценария.
 * AgentController — транспорт, не знает про actor.
 */
export class ScenarioEngine {
  private scenario: ScenarioDefinition;
  private context: RunContext;
  private controller: AgentController;
  private faultInjector: FaultInjector;
  private evidenceCollector?: EvidenceCollector;

  constructor(
    scenario: ScenarioDefinition,
    context: RunContext,
    controller: AgentController,
    faultInjector: FaultInjector,
    evidenceCollector?: EvidenceCollector
  ) {
    this.scenario = scenario;
    this.context = context;
    this.controller = controller;
    this.faultInjector = faultInjector;
    this.evidenceCollector = evidenceCollector;
  }

  /**
   * Запуск исполнения сценария.
   */
  public async execute(): Promise<void> {
    this.context.status = RunStatus.RUNNING;

    try {
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
   * Выполнение одного действия.
   */
  private async executeAction(action: Action): Promise<void> {
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
   * Непосредственное выполнение действия через контроллер.
   *
   * После выполнения — собирает evidence:
   * 1. Observations из exchange.metadata.observations
   * 2. Engine event: action_<type>
   */
  private async performAction(action: Action): Promise<void> {
    const payload = action.payload || {};
    const outcome = await this.controller.act(action.type, payload);

    if (!this.evidenceCollector) {
      return;
    }

    const now = Date.now();

    // 1. Observations из metadata
    const observations =
      (outcome.exchange?.metadata?.observations as string[]) || [];

    for (const observationType of observations) {
      this.evidenceCollector.collect(
        {
          source: action.actor,
          type: observationType,
          data: (outcome.exchange?.payload || {}) as Record<string, unknown>,
          timestamp: now,
        },
        this.context.runId
      );
    }

    // 2. Engine event: action был выполнен
    this.evidenceCollector.collect(
      {
        source: 'engine',
        type: `action_${action.type}`,
        data: payload as Record<string, unknown>,
        timestamp: now,
      },
      this.context.runId
    );
  }
}

// ============================================================
// КОНЕЦ ФАЙЛА
// ============================================================
