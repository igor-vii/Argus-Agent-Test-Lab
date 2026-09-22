// ============================================================
// src/core/RunOrchestrator.ts
// ============================================================

import { ScenarioEngine } from './ScenarioEngine';
import { ScenarioDefinition } from './ScenarioDefinition';
import { AgentController } from './AgentController';
import { FaultInjector } from './FaultInjector';
import { EvidenceCollector, EvidenceRecord } from './EvidenceCollector';
import { AssertionEngine } from './AssertionEngine';
import { Assertion } from './Assertions';
import { RunContext, RunStatus, RunResult, generateRunId } from './RunLifecycle';
import { PaymentAdapter } from '../adapters/payment/PaymentAdapter';
import { PaymentResolver } from './ScenarioEngine';
import { ExecutionRegistry } from './ExecutionRegistry';

/**
 * Оркестратор запуска тестового прогона.
 *
 * Создаёт EvidenceCollector и передаёт его в ScenarioEngine.
 * AgentController — транспорт, не знает про evidence.
 */
export class RunOrchestrator {
  private scenario: ScenarioDefinition;
  private controllers: Map<string, AgentController>;
  private evidenceCollector: EvidenceCollector;
  private assertionEngine: AssertionEngine;
  private assertions: Assertion[];
  private paymentAdapter?: PaymentAdapter;

  constructor(
    scenario: ScenarioDefinition,
    controllers: Map<string, AgentController>,
    assertions: Assertion[],
    paymentAdapter?: PaymentAdapter
  ) {
    this.scenario = scenario;
    this.controllers = controllers;
    this.evidenceCollector = new EvidenceCollector();
    this.assertionEngine = new AssertionEngine();
    this.assertions = assertions;
    this.paymentAdapter = paymentAdapter;
  }

  /**
   * Запуск полного прогона сценария.
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
      // Create registry and connect all controllers
      const registry = new ExecutionRegistry();
      for (const [actorId, controller] of this.controllers.entries()) {
        registry.register(actorId, controller);
        await controller.connect();
      }

      const faultInjector = new FaultInjector(this.scenario.faults);

      // Build payment resolver if paymentAdapter is provided.
      // Otherwise, ScenarioEngine records PAYMENT_REQUIRED as evidence and continues.
      let paymentResolver: PaymentResolver | undefined;
      if (this.paymentAdapter) {
        const adapter = this.paymentAdapter;
        paymentResolver = async (paymentRequired) => {
          return adapter.signX402Payment(paymentRequired);
        };
      }

      const engine = new ScenarioEngine(
        this.scenario,
        context,
        registry,
        faultInjector,
        this.evidenceCollector,
        paymentResolver
      );

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
    } catch (error: unknown) {
      context.status = RunStatus.FAILED;

      // Disconnect all controllers on error
      for (const controller of this.controllers.values()) {
        try {
          await controller.disconnect();
        } catch {
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
  getEvidence(): EvidenceRecord[] {
    return this.evidenceCollector.getAllRecords();
  }
}

// ============================================================
// КОНЕЦ ФАЙЛА
// ============================================================
