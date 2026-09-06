import { ScenarioDefinition } from '../scenario';
import { Verdict } from '../assertion';
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
export declare class ScenarioEngine {
    private runCounter;
    /**
     * Execute a scenario and return the result
     */
    execute(config: RunConfig): Promise<RunResult>;
    /**
     * Generate unique run ID
     */
    private generateRunId;
    /**
     * Seed random number generator for deterministic runs
     */
    private seedRandom;
    /**
     * Execute a single timeline step
     */
    private executeStep;
    /**
     * Create evaluation functions for invariants based on actual evidence
     */
    private createEvaluationFunctions;
    /**
     * Evaluate a single invariant check string
     * Supports:
     * - countEventsByType('eventType') == N
     * - countEventsByType('eventType') <= N
     * - countEventsByType('eventType') >= N
     */
    private evaluateInvariantCheck;
}
