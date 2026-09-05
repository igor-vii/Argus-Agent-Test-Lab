import { AssertionResult, Verdict, VerdictOutcome } from './types';
import { EvidenceCollector, EvidenceReference } from '../evidence';
import { ScenarioInvariant } from '../scenario';

/**
 * Minimal Assertion Engine
 * 
 * Evaluates invariants against collected evidence and produces verdicts.
 * Supports PASS, FAIL, and INCONCLUSIVE outcomes.
 */
export class AssertionEngine {
  constructor(private evidenceCollector: EvidenceCollector) {}

  /**
   * Evaluate a single invariant
   */
  evaluateInvariant(
    invariant: ScenarioInvariant,
    evaluationFn: () => { passed: boolean; expected: string; actual: string; inconclusive?: boolean }
  ): AssertionResult {
    try {
      const result = evaluationFn();
      
      if (result.inconclusive) {
        return {
          invariantId: invariant.id,
          invariantDescription: invariant.description,
          outcome: 'INCONCLUSIVE',
          expected: result.expected,
          actual: result.actual,
          evidenceReferences: this.collectRelevantEvidence(invariant),
          reason: 'Environment/mock/integration does not allow proving the invariant'
        };
      }

      if (result.passed) {
        return {
          invariantId: invariant.id,
          invariantDescription: invariant.description,
          outcome: 'PASS',
          expected: result.expected,
          actual: result.actual,
          evidenceReferences: this.collectRelevantEvidence(invariant),
          reason: 'Invariant condition satisfied'
        };
      } else {
        return {
          invariantId: invariant.id,
          invariantDescription: invariant.description,
          outcome: 'FAIL',
          expected: result.expected,
          actual: result.actual,
          evidenceReferences: this.collectRelevantEvidence(invariant),
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
   * Evaluate all invariants and produce overall verdict
   */
  evaluateAll(
    runId: string,
    scenarioId: string,
    invariants: ScenarioInvariant[],
    evaluationFns: Map<string, () => { passed: boolean; expected: string; actual: string; inconclusive?: boolean }>
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
  private collectRelevantEvidence(invariant: ScenarioInvariant): EvidenceReference[] {
    const events = this.evidenceCollector.getEvents();
    const references: EvidenceReference[] = [];

    // Simple heuristic: reference events related to the invariant type
    for (const event of events.slice(-10)) { // Last 10 events as sample
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
