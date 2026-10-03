// ============================================================
// src/core/ScenarioEngine.ts
// ============================================================

import { ExecutionRegistry } from './ExecutionRegistry';
import { ScenarioDefinition, Action } from './ScenarioDefinition';
import { RunContext, RunStatus } from './RunLifecycle';
import { FaultInjector } from './FaultInjector';
import { EvidenceCollector } from './EvidenceCollector';
import { Observation } from './Evidence';
import { PaymentRequired, ExchangeStatus } from './AgentTargetPort';
import { validateFaultDispatch } from './validateScenario';

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
 * InboundExecutionWindow — the canonical execution boundary handed to an
 * INBOUND transport adapter (Block A / S9). It exposes exactly three
 * transport/lifecycle operations and nothing else:
 *
 * - record(observation): place a canonical Observation into the SAME
 *   EvidenceCollector ScenarioEngine uses for outbound scenarios;
 * - fail(error): mark the run technically FAILED (RunStatus, not a verdict);
 * - close(): end the evidence window.
 *
 * The window computes no verdict, evaluates no assertions, schedules no
 * actions and owns no second evidence model. Verdict semantics remain the
 * exclusive job of RunOrchestrator → AssertionEngine.
 */
export interface InboundExecutionWindow {
  record(observation: Observation): void;
  fail(error: unknown): void;
  close(): void;
}

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
  private registry: ExecutionRegistry;
  private faultInjector: FaultInjector;
  private evidenceCollector?: EvidenceCollector;
  private paymentResolver?: PaymentResolver;

  constructor(
    scenario: ScenarioDefinition,
    context: RunContext,
    registry: ExecutionRegistry,
    faultInjector: FaultInjector,
    evidenceCollector?: EvidenceCollector,
    paymentResolver?: PaymentResolver
  ) {
    this.scenario = scenario;
    this.context = context;
    this.registry = registry;
    this.faultInjector = faultInjector;
    this.evidenceCollector = evidenceCollector;
    this.paymentResolver = paymentResolver;
  }

  /**
   * The canonical EvidenceCollector this engine feeds observations into.
   *
   * Block A (S9): the inbound transport direction needs to place canonical
   * Observations into the SAME collector instance the engine uses, so that
   * RunOrchestrator's single assertion/verdict pass covers both directions.
   * Exposing the already-owned collector introduces no second evidence model.
   */
  public getEvidenceCollector(): EvidenceCollector | undefined {
    return this.evidenceCollector;
  }

  /**
   * Canonical execution boundary for INBOUND transports (Block A / S9:
   * external CLIENT → Argus RESOURCE_SERVER).
   *
   * When the SUT initiates the interaction there is no outbound Action for
   * execute() to run; instead the inbound transport adapter records canonical
   * Observations directly into the SAME EvidenceCollector this engine uses.
   * Assertions and the verdict still come exclusively from
   * RunOrchestrator → AssertionEngine over the collected evidence set —
   * this method starts no scheduler, computes no verdict and owns no
   * second evidence model. It is the smallest extension that lets the
   * existing ScenarioEngine express the inbound direction.
   *
   * Lifecycle: RUNNING while the window is open; COMPLETED on close().
   * A transport error marks the run FAILED (technical status, not a verdict).
   */
  public beginInboundExecution(): InboundExecutionWindow {
    if (this.context.status !== RunStatus.CREATED) {
      throw new Error(
        `beginInboundExecution requires status CREATED, got ${this.context.status}`
      );
    }
    if (!this.evidenceCollector) {
      throw new Error('beginInboundExecution requires an EvidenceCollector');
    }

    const dispatchValidation = validateFaultDispatch(this.scenario);
    if (!dispatchValidation.valid) {
      throw new Error(
        `Invalid L0-F2 fault dispatch contract: ${dispatchValidation.errors.map((e) => e.message).join('; ')}`
      );
    }

    this.context.status = RunStatus.RUNNING;

    const engine = this;
    return {
      record(observation: Observation): void {
        // Transport/lifecycle guard only: never interpret the observation.
        if (engine.context.status === RunStatus.RUNNING) {
          engine.evidenceCollector!.collect(observation, engine.context.runId);
        }
      },
      fail(error: unknown): void {
        if (engine.context.status === RunStatus.RUNNING) {
          engine.context.status = RunStatus.FAILED;
        }
        void error;
      },
      close(): void {
        if (engine.context.status === RunStatus.RUNNING) {
          engine.context.status = RunStatus.COMPLETED;
        }
      },
    };
  }

  /**
   * Запуск исполнения сценария.
   */
  public async execute(): Promise<void> {
    const dispatchValidation = validateFaultDispatch(this.scenario);
    if (!dispatchValidation.valid) {
      throw new Error(
        `Invalid L0-F2 fault dispatch contract: ${dispatchValidation.errors.map((e) => e.message).join('; ')}`
      );
    }

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
    const eventType = `action_${action.type}`;
    const faults = this.faultInjector.getFaultsForEvent(eventType, action.actor);
    const responders = this.faultInjector.getRespondersForEvent(eventType);

    const emitCallback = (observation: Observation) => {
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
    const activeFaults = [...responders, ...faults];

    const chained = activeFaults.reduceRight<() => Promise<void>>(
      (op, fault) => () => this.faultInjector.apply(fault, op, emitCallback),
      baseOperation
    );

    await chained();
  }

  /**
   * Непосредственное выполнение действия через контроллер.
   *
   * После выполнения — собирает evidence:
   * 1. Observations из exchange.metadata.observations
   * 2. Engine event: action_<type>
   *
   * Observation source остаётся scenario.testSubject: это объект наблюдения.
   * participantId из transport metadata сохраняется как actorId и не
   * меняет семантику существующих S1-S7 assertions.
   *
   * NOTE: Если outcome.exchange отсутствует (например, action завершился
   * TIMEOUT), никакого fallback на action.type как observation не происходит.
   */
  private async performAction(action: Action): Promise<void> {
    const controller = this.registry.get(action.actor);
    if (!controller) {
      throw new Error(`No controller registered for actor: ${action.actor}`);
    }

    const payload = action.payload || {};
    let outcome = await controller.act(action.type, payload);

    // Handle PAYMENT_REQUIRED via resolver (if provided)
    if (
      outcome.status === ExchangeStatus.PAYMENT_REQUIRED &&
      outcome.exchange?.paymentRequired
    ) {
      if (!this.paymentResolver) {
        // No resolver — record UNKNOWN in evidence, continue
        if (this.evidenceCollector) {
          this.evidenceCollector.collect(
            {
              source: 'engine',
              type: 'payment_required_no_resolver',
              data: {
                actionType: action.type,
                paymentRequired: outcome.exchange.paymentRequired,
              } as Record<string, unknown>,
              timestamp: Date.now(),
            },
            this.context.runId
          );
        }
        return;
      }

      try {
        const signature = await this.paymentResolver(outcome.exchange.paymentRequired);

        // Retry with signature
        outcome = await controller.actWithSignature(
          action.type,
          payload,
          signature
        );

        // Record that payment was signed and retried
        if (this.evidenceCollector) {
          this.evidenceCollector.collect(
            {
              source: 'engine',
              type: 'payment_signed_and_retried',
              data: {
                actionType: action.type,
              } as Record<string, unknown>,
              timestamp: Date.now(),
            },
            this.context.runId
          );
        }
      } catch (error) {
        // Signing or retry failed — record as engine event
        if (this.evidenceCollector) {
          this.evidenceCollector.collect(
            {
              source: 'engine',
              type: 'payment_signing_failed',
              data: {
                actionType: action.type,
                error: error instanceof Error ? error.message : String(error),
              } as Record<string, unknown>,
              timestamp: Date.now(),
            },
            this.context.runId
          );
        }
        return;
      }
    }

    if (!this.evidenceCollector) {
      return;
    }

    const now = Date.now();

    // Observations belong to the test subject. The controller-bound
    // participant identity identifies the actor that caused the observation.
    const observations =
      (outcome.exchange?.metadata?.observations as string[]) || [];
    const actorId =
      (outcome.exchange?.metadata?.participantId as string | undefined);

    for (const observationType of observations) {
      this.evidenceCollector.collect(
        {
          source: this.scenario.testSubject,
          ...(actorId ? { actorId } : {}),
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
