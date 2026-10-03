// ============================================================
// src/core/InboundExecutionBridge.ts
// ============================================================

import { ScenarioDefinition } from './ScenarioDefinition';
import { RunContext, RunStatus, RunResult, generateRunId } from './RunLifecycle';
import { EvidenceCollector } from './EvidenceCollector';
import { AssertionEngine } from './AssertionEngine';
import { Assertion } from './Assertions';
import { Observation } from './Evidence';

/**
 * InboundExecutionBridge — the smallest possible bridge for the INBOUND
 * execution direction (Block A / S9: external CLIENT → Argus RESOURCE_SERVER).
 *
 * Rationale (§8 of the Block A contract):
 * - ScenarioEngine drives OUTBOUND actions declared in a scenario. When the
 *   SUT initiates the interaction, there is no outbound action to run; the
 *   inbound transport adapter must feed canonical evidence instead.
 * - This bridge reuses the SAME canonical components as RunOrchestrator:
 *   RunContext / RunStatus, EvidenceCollector, core/Evidence (Observation),
 *   AssertionEngine, Assertions and the RunResult verdict shape
 *   (PASS | FAIL | INCONCLUSIVE). It introduces NO second evidence model,
 *   NO second assertion semantics and NO second verdict engine.
 *
 * Bounded role:
 *   inbound transport → canonical evidence boundary
 * It never computes verdicts itself; only AssertionEngine does that at finish().
 */
export class InboundExecutionBridge {
  private readonly scenario: ScenarioDefinition;
  private readonly assertions: Assertion[];
  private readonly collector: EvidenceCollector;
  private readonly engine: AssertionEngine;
  private readonly context: RunContext;
  private finished = false;

  constructor(scenario: ScenarioDefinition, assertions?: Assertion[]) {
    this.scenario = scenario;
    this.assertions = assertions ?? scenario.assertions ?? [];
    this.collector = new EvidenceCollector();
    this.engine = new AssertionEngine();
    this.context = {
      runId: generateRunId(),
      scenarioId: scenario.id,
      seed: scenario.seed,
      startedAt: new Date(),
      status: RunStatus.CREATED,
    };
  }

  getRunId(): string {
    return this.context.runId;
  }

  getStatus(): RunStatus {
    return this.context.status;
  }

  /**
   * Start the inbound execution window. Transport/lifecycle only —
   * no semantic interpretation happens here.
   */
  start(): void {
    if (this.finished) {
      throw new Error('InboundExecutionBridge already finished');
    }
    this.context.status = RunStatus.RUNNING;
  }

  /**
   * Canonical evidence boundary for the inbound transport.
   * The bridge stamps source = scenario.testSubject (the Argus-side
   * participant being observed) when the transport omitted it, then stores
   * the observation verbatim through the shared EvidenceCollector.
   */
  record(observation: Omit<Observation, 'source'> & { source?: string }): void {
    if (this.finished) return;
    const evidence: Observation = {
      ...observation,
      source: observation.source ?? this.scenario.testSubject,
    };
    this.collector.collect(evidence, this.context.runId);
  }

  /**
   * Finish the run: close the evidence window and evaluate the canonical
   * assertions against the canonical evidence set. Same aggregation
   * semantics as RunOrchestrator (any FAIL → FAIL; else any INCONCLUSIVE →
   * INCONCLUSIVE; all PASS → PASS; empty assertion set → INCONCLUSIVE).
   */
  finish(): RunResult {
    if (this.finished) {
      throw new Error('InboundExecutionBridge already finished');
    }
    this.finished = true;
    this.context.status = RunStatus.COMPLETED;
    this.context.finishedAt = new Date();

    const evidence = this.collector.getEvidenceSet(this.context.runId);
    const assertionResult = this.engine.evaluate(evidence, this.assertions);

    return {
      runId: this.context.runId,
      scenarioId: this.scenario.id,
      status: this.context.status,
      startedAt: this.context.startedAt,
      finishedAt: this.context.finishedAt,
      evidenceCount: evidence.length,
      verdict: {
        status: assertionResult.status,
        reason: assertionResult.reasons.join('; '),
      },
    };
  }

  /**
   * All evidence records collected during the run (tests/debugging).
   */
  getEvidence() {
    return this.collector.getAllRecords();
  }
}

// ============================================================
// КОНЕЦ ФАЙЛА
// ============================================================
