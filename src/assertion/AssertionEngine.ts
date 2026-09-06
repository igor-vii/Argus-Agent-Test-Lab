import { AssertionResult, Verdict, VerdictOutcome } from './types';
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
export class AssertionEngine {
  constructor(private evidenceCollector: EvidenceCollector) {}
  
  /**
   * Evaluate a single invariant
   */
  evaluateInvariant(
    invariant: ScenarioInvariant,
    evaluationFn: () => { passed: boolean; expected: string; actual: string | number; inconclusive?: boolean; evidenceRefs?: string[] }
  ): AssertionResult {
    try {
      const result = evaluationFn();
      
      if (result.inconclusive) {
        return {
          invariantId: invariant.id,
          invariantDescription: invariant.description,
          outcome: 'INCONCLUSIVE',
          expected: result.expected,
          actual: String(result.actual),
          evidenceReferences: result.evidenceRefs ? result.evidenceRefs.map(id => ({ eventId: id, description: '' })) : [],
          reason: 'Evidence insufficient to prove invariant'
        };
      }

      if (result.passed) {
        return {
          invariantId: invariant.id,
          invariantDescription: invariant.description,
          outcome: 'PASS',
          expected: result.expected,
          actual: String(result.actual),
          evidenceReferences: result.evidenceRefs ? result.evidenceRefs.map(id => ({ eventId: id, description: '' })) : [],
          reason: 'Invariant condition satisfied'
        };
      } else {
        return {
          invariantId: invariant.id,
          invariantDescription: invariant.description,
          outcome: 'FAIL',
          expected: result.expected,
          actual: String(result.actual),
          evidenceReferences: result.evidenceRefs ? result.evidenceRefs.map(id => ({ eventId: id, description: '' })) : [],
          reason: 'Invariant condition violated'
        };
      }
    } catch (error) {
      return {
        invariantId: invariant.id,
        invariantDescription: invariant.description,
        outcome: 'INCONCLUSIVE',
        expected: invariant.check,
        actual: `Error: ${String(error)}`,
        evidenceReferences: [],
        reason: 'Evaluation failed due to error'
      };
    }
  }

  /**
   * Count events by type
   */
  countEventsByType(eventType: string): { count: number; eventIds: string[] } {
    const events = this.evidenceCollector.getEvents();
    const matching = events.filter(e => e.eventType === eventType);
    return {
      count: matching.length,
      eventIds: matching.map(e => e.eventId)
    };
  }

  /**
   * Check if events exist in sequence
   */
  hasSequence(eventTypes: string[]): { found: boolean; eventIds: string[] } {
    const events = this.evidenceCollector.getEvents();
    const eventIds: string[] = [];
    
    let currentIndex = 0;
    for (const eventType of eventTypes) {
      let found = false;
      for (let i = currentIndex; i < events.length; i++) {
        if (events[i].eventType === eventType) {
          eventIds.push(events[i].eventId);
          currentIndex = i + 1;
          found = true;
          break;
        }
      }
      if (!found) {
        return { found: false, eventIds: [] };
      }
    }
    
    return { found: true, eventIds };
  }

  /**
   * Check uniqueness of a field across events
   */
  isUnique(fieldName: string, eventType?: string): { unique: boolean; values: any[]; eventIds: string[] } {
    const events = this.evidenceCollector.getEvents();
    const filtered = eventType ? events.filter(e => e.eventType === eventType) : events;
    
    const values: any[] = [];
    const eventIds: string[] = [];
    const seen = new Set<any>();
    let isUnique = true;
    
    for (const event of filtered) {
      const value = (event.data as any)?.[fieldName];
      if (value !== undefined) {
        values.push(value);
        eventIds.push(event.eventId);
        if (seen.has(value)) {
          isUnique = false;
        }
        seen.add(value);
      }
    }
    
    return { unique: isUnique, values, eventIds };
  }

  /**
   * Get all events of a specific type
   */
  getEventsByType(eventType: string): EvidenceEvent[] {
    return this.evidenceCollector.getEvents().filter(e => e.eventType === eventType);
  }

  /**
   * Evaluate all invariants and produce overall verdict
   */
  evaluateAll(
    runId: string,
    scenarioId: string,
    invariants: ScenarioInvariant[],
    evaluationFns: Map<string, () => { passed: boolean; expected: string; actual: string | number; inconclusive?: boolean; evidenceRefs?: string[] }>
  ): Verdict {
    const assertions: AssertionResult[] = [];

    for (const invariant of invariants) {
      const evalFn = evaluationFns.get(invariant.id) || (() => ({
        passed: false,
        expected: invariant.check,
        actual: 'No evaluation function provided',
        inconclusive: true
      }));

      const assertion = this.evaluateInvariant(invariant, evalFn);
      assertions.push(assertion);
    }

    // Determine overall verdict
    const overallOutcome = this.determineOverallVerdict(assertions);
    const reason = this.buildVerdictReason(assertions, overallOutcome);

    return {
      runId,
      scenarioId,
      outcome: overallOutcome,
      assertions,
      reason,
      timestamp: Date.now()
    };
  }

  /**
   * Collect relevant evidence for an invariant
   */
  private collectRelevantEvidence(invariant: ScenarioInvariant): Array<{ eventId: string; description: string }> {
    const events = this.evidenceCollector.getEvents();
    const references: Array<{ eventId: string; description: string }> = [];

    // Simple heuristic: reference last 10 events
    for (const event of events.slice(-10)) {
      references.push({
        eventId: event.eventId,
        description: `${event.eventType} by ${event.actor}`
      });
    }

    return references;
  }

  /**
   * Determine overall verdict from individual assertions
   */
  private determineOverallVerdict(assertions: AssertionResult[]): VerdictOutcome {
    const hasFail = assertions.some(a => a.outcome === 'FAIL');
    const hasInconclusive = assertions.some(a => a.outcome === 'INCONCLUSIVE');
    const allPass = assertions.every(a => a.outcome === 'PASS');

    if (hasFail) {
      return 'FAIL';
    }

    if (hasInconclusive) {
      return 'INCONCLUSIVE';
    }

    if (allPass) {
      return 'PASS';
    }

    return 'INCONCLUSIVE';
  }

  /**
   * Build human-readable reason for overall verdict
   */
  private buildVerdictReason(assertions: AssertionResult[], outcome: VerdictOutcome): string {
    const passCount = assertions.filter(a => a.outcome === 'PASS').length;
    const failCount = assertions.filter(a => a.outcome === 'FAIL').length;
    const inconclusiveCount = assertions.filter(a => a.outcome === 'INCONCLUSIVE').length;

    switch (outcome) {
      case 'PASS':
        return `All ${passCount} invariants passed`;
      case 'FAIL':
        return `${failCount} invariant(s) failed out of ${assertions.length}`;
      case 'INCONCLUSIVE':
        return `${inconclusiveCount} invariant(s) could not be evaluated definitively`;
      default:
        return 'Unknown verdict state';
    }
  }
}
