import { AssertionResult, Verdict } from './types';
import { EvidenceCollector, EvidenceEvent } from '../evidence';
import { ScenarioInvariant } from '../scenario';
/**
 * Minimal Assertion Engine
 *
 * Evaluates invariants against collected evidence and produces verdicts.
 * Supports PASS, FAIL, and INCONCLUSIVE outcomes.
 *
 * Supported checks:
 * - countEventsByType('eventType') == N
 * - countEventsByType('eventType') <= N
 * - countEventsByType('eventType') >= N
 * - isUnique('fieldName') - checks uniqueness of field across events
 * - hasSequence(['event1', 'event2']) - checks event order
 */
export declare class AssertionEngine {
    private evidenceCollector;
    constructor(evidenceCollector: EvidenceCollector);
    /**
     * Evaluate a single invariant
     */
    evaluateInvariant(invariant: ScenarioInvariant, evaluationFn: () => {
        passed: boolean;
        expected: string;
        actual: string | number;
        inconclusive?: boolean;
        evidenceRefs?: string[];
    }): AssertionResult;
    /**
     * Count events by type
     */
    countEventsByType(eventType: string): {
        count: number;
        eventIds: string[];
    };
    /**
     * Check if events exist in sequence
     */
    hasSequence(eventTypes: string[]): {
        found: boolean;
        eventIds: string[];
    };
    /**
     * Check uniqueness of a field across events
     */
    isUnique(fieldName: string, eventType?: string): {
        unique: boolean;
        values: any[];
        eventIds: string[];
    };
    /**
     * Get all events of a specific type
     */
    getEventsByType(eventType: string): EvidenceEvent[];
    /**
     * Evaluate all invariants and produce overall verdict
     */
    evaluateAll(runId: string, scenarioId: string, invariants: ScenarioInvariant[], evaluationFns: Map<string, () => {
        passed: boolean;
        expected: string;
        actual: string | number;
        inconclusive?: boolean;
        evidenceRefs?: string[];
    }>): Verdict;
    /**
     * Collect relevant evidence for an invariant
     */
    private collectRelevantEvidence;
    /**
     * Determine overall verdict from individual assertions
     */
    private determineOverallVerdict;
    /**
     * Build human-readable reason for overall verdict
     */
    private buildVerdictReason;
}
