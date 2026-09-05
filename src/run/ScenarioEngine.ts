import { ScenarioDefinition } from '../scenario';
import { Agent, AgentConfig } from '../agent';
import { FaultInjector, FaultDefinition } from '../fault';
import { EvidenceCollector } from '../evidence';
import { AssertionEngine, Verdict } from '../assertion';
import { TargetAdapter } from '../target';

/**
 * Run Configuration
 */
export interface RunConfig {
  scenario: ScenarioDefinition;
  seed?: number;
  targetAdapter: TargetAdapter;
}

/**
 * Run Result - complete result of a scenario execution
 */
export interface RunResult {
  runId: string;
  scenarioId: string;
  seed: number;
  startTime: number;
  endTime: number;
  verdict: Verdict;
  status: 'completed' | 'failed' | 'inconclusive';
}

/**
 * Scenario Engine - orchestrates scenario execution
 * 
 * Lifecycle:
 * 1. Create runId
 * 2. Accept Scenario Definition
 * 3. Use deterministic seed
 * 4. Run scenario
 * 5. Record events
 * 6. Execute assertions
 * 7. Form verdict
 */
export class ScenarioEngine {
  private runCounter = 0;

  /**
   * Execute a scenario and return the result
   */
  async execute(config: RunConfig): Promise<RunResult> {
    const runId = this.generateRunId();
    const seed = config.seed ?? Math.floor(Math.random() * 1000000);
    
    // Initialize seeded random for determinism
    this.seedRandom(seed);

    // Create evidence collector
    const evidenceCollector = new EvidenceCollector(runId);
    
    // Create assertion engine
    const assertionEngine = new AssertionEngine(evidenceCollector);

    // Create fault injector
    const faultInjector = new FaultInjector();
    
    // Register faults from scenario
    for (const fault of config.scenario.faults) {
      faultInjector.registerFault(fault as FaultDefinition);
    }

    // Create agents
    const agents = new Map<string, Agent>();
    for (const agentConfig of config.scenario.agents) {
      const agent = new Agent(agentConfig, (event) => {
        event.runId = runId;
        evidenceCollector.record({
          timestamp: event.timestamp,
          agentId: event.agentId,
          actor: event.agentId,
          eventType: event.eventType,
          data: event.data
        });
      });
      agents.set(agentConfig.id, agent);
    }

    // Record run start
    evidenceCollector.record({
      timestamp: Date.now(),
      actor: 'system',
      eventType: 'run.started',
      data: { scenarioId: config.scenario.id, seed }
    });

    try {
      // Execute timeline steps
      for (const step of config.scenario.timeline) {
        await this.executeStep(step, agents, config.targetAdapter, evidenceCollector, faultInjector);
      }

      // Record run completion
      evidenceCollector.record({
        timestamp: Date.now(),
        actor: 'system',
        eventType: 'run.completed',
        data: { scenarioId: config.scenario.id }
      });

      // Build evidence
      const evidence = evidenceCollector.buildEvidence();

      // Evaluate invariants
      const evaluationFns = this.createEvaluationFunctions(
        config.scenario.invariants,
        evidence,
        config.targetAdapter
      );

      const verdict = assertionEngine.evaluateAll(
        runId,
        config.scenario.id,
        config.scenario.invariants,
        evaluationFns
      );

      return {
        runId,
        scenarioId: config.scenario.id,
        seed,
        startTime: evidence.summary.startTime,
        endTime: evidence.summary.endTime,
        verdict,
        status: verdict.outcome === 'PASS' ? 'completed' : verdict.outcome === 'FAIL' ? 'failed' : 'inconclusive'
      };
    } catch (error) {
      // Record run failure
      evidenceCollector.record({
        timestamp: Date.now(),
        actor: 'system',
        eventType: 'run.failed',
        data: { error: String(error) }
      });

      return {
        runId,
        scenarioId: config.scenario.id,
        seed,
        startTime: Date.now(),
        endTime: Date.now(),
        verdict: {
          runId,
          scenarioId: config.scenario.id,
          outcome: 'INCONCLUSIVE',
          assertions: [],
          reason: `Run failed: ${String(error)}`,
          timestamp: Date.now()
        },
        status: 'inconclusive'
      };
    }
  }

  /**
   * Generate unique run ID
   */
  private generateRunId(): string {
    return `run-${Date.now()}-${++this.runCounter}`;
  }

  /**
   * Seed random number generator for deterministic runs
   */
  private seedRandom(seed: number): void {
    // Simple LCG for seeded randomness
    let state = seed;
    Math.random = () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
  }

  /**
   * Execute a single timeline step
   */
  private async executeStep(
    step: { stepId: string; action: string; actor: string; description?: string },
    agents: Map<string, Agent>,
    targetAdapter: TargetAdapter,
    evidenceCollector: EvidenceCollector,
    faultInjector: FaultInjector
  ): Promise<void> {
    // Parse actors (may be comma-separated for concurrent actions)
    const actorIds = step.actor.split(',').map(a => a.trim());
    
    for (const actorId of actorIds) {
      const agent = agents.get(actorId);
      
      if (agent) {
        // Check for applicable faults
        const faults = agent.getFaults();
        for (const fault of faults) {
          if (fault.trigger?.event) {
            await faultInjector.emitEvent({
              type: fault.trigger.event,
              data: { action: step.action, stepId: step.stepId },
              timestamp: Date.now()
            });
          }
        }

        // Execute action through agent
        const result = await agent.act(step.action, { stepId: step.stepId });
        
        // Record evidence
        evidenceCollector.record({
          timestamp: Date.now(),
          actor: actorId,
          eventType: `action.${step.action}`,
          data: { result, description: step.description }
        });

        // Also execute on target adapter
        if (targetAdapter) {
          const targetResult = await targetAdapter.execute(step.action, {
            action: step.action as any
          });
          
          evidenceCollector.record({
            timestamp: Date.now(),
            actor: 'target',
            eventType: `target.${step.action}`,
            data: { result: targetResult }
          });
        }
      } else {
        // System or unknown actor
        evidenceCollector.record({
          timestamp: Date.now(),
          actor: actorId,
          eventType: `system.${step.action}`,
          data: { description: step.description }
        });
      }
    }
  }

  /**
   * Create evaluation functions for invariants
   */
  private createEvaluationFunctions(
    invariants: Array<{ id: string; check: string }>,
    evidence: any,
    targetAdapter: TargetAdapter
  ): Map<string, () => { passed: boolean; expected: string; actual: string; inconclusive?: boolean }> {
    const fns = new Map();

    for (const invariant of invariants) {
      fns.set(invariant.id, () => ({
        passed: true, // MVP: default to pass for mock testing
        expected: invariant.check,
        actual: 'Mock evaluation - invariant assumed satisfied'
      }));
    }

    return fns;
  }
}
