import { EvidenceReference } from '../evidence';

/**
 * Verdict outcome
 */
export type VerdictOutcome = 'PASS' | 'FAIL' | 'INCONCLUSIVE';

/**
 * Assertion result for a single invariant
 */
export interface AssertionResult {
  /** Invariant ID being tested */
  invariantId: string;
  
  /** Description of the invariant */
  invariantDescription: string;
  
  /** Result of the assertion */
  outcome: VerdictOutcome;
  
  /** Expected value/condition */
  expected: string;
  
  /** Actual value/condition observed */
  actual: string;
  
  /** References to supporting evidence */
  evidenceReferences: EvidenceReference[];
  
  /** Human-readable reason for the verdict */
  reason: string;
}

/**
 * Overall test run verdict
 */
export interface Verdict {
  /** Run ID */
  runId: string;
  
  /** Scenario ID */
  scenarioId: string;
  
  /** Overall outcome */
  outcome: VerdictOutcome;
  
  /** Individual assertion results */
  assertions: AssertionResult[];
  
  /** Summary reason for overall verdict */
  reason: string;
  
  /** Timestamp when verdict was determined */
  timestamp: number;
}
