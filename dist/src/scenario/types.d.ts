import { AgentConfig } from '../agent';
/**
 * Timeline Step - defines a single step in a scenario
 */
export interface TimelineStep {
    stepId: string;
    action: string;
    actor: string;
    description?: string;
    expectedOutcome?: Record<string, unknown>;
}
/**
 * Invariant/Assertion definition for a scenario
 */
export interface ScenarioInvariant {
    id: string;
    description: string;
    type: 'economic' | 'state' | 'execution' | 'evidence';
    check: string;
}
/**
 * Expected Outcome for a scenario run
 */
export interface ExpectedOutcome {
    status: 'success' | 'failure' | 'inconclusive';
    conditions: string[];
}
/**
 * Canonical Scenario Definition
 *
 * This is the internal TypeScript representation.
 * YAML/JSON parsers can convert external formats to this.
 * runId is NOT part of ScenarioDefinition - it's created at runtime.
 */
export interface ScenarioDefinition {
    /** Unique scenario identifier */
    id: string;
    /** Human-readable description */
    description: string;
    /** Target system identifier (e.g., 'secretariat') */
    target: string;
    /** Agents participating in the scenario */
    agents: AgentConfig[];
    /** Sequence of steps to execute */
    timeline: TimelineStep[];
    /** Faults to inject during the scenario */
    faults: Array<{
        id: string;
        type: string;
        trigger?: {
            event: string;
        };
        params: Record<string, unknown>;
        targetAgentId?: string;
    }>;
    /** Invariants that must hold true */
    invariants: ScenarioInvariant[];
    /** Seed for deterministic/reproducible runs */
    seed?: number;
    /** Assumptions for this scenario */
    assumptions: string[];
    /** Expected outcome */
    expectedOutcome: ExpectedOutcome;
}
