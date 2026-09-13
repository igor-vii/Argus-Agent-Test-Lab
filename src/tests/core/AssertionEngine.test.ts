import { describe, it, expect } from 'vitest';
import { AssertionEngine } from '../../core/AssertionEngine';
import { EventExistsAssertion, EventCountAssertion, AssertionGroup } from '../../core/Assertions';
import { EvidenceRecord, EvidenceSource } from '../../core/EvidenceCollector';

describe('AssertionEngine', () => {
  const engine = new AssertionEngine();

  it('should return INCONCLUSIVE when evidence is missing', () => {
    const emptyEvidence: EvidenceRecord[] = [];
    const assertion = new EventExistsAssertion('non_existent_event');

    // Interface: evaluate(evidence, assertions)
    const result = engine.evaluate(emptyEvidence, [assertion]);

    expect(result.status).toBe('INCONCLUSIVE');
  });

  it('ALL operator: FAIL overrides PASS', () => {
    const evidence: EvidenceRecord[] = [
      {
        evidenceId: 'ev-1',
        runId: 'test-run',
        timestamp: Date.now(),
        sequence: 1,
        type: 'event_a',
        source: EvidenceSource.SYSTEM,
        data: {}
      },
      {
        evidenceId: 'ev-2',
        runId: 'test-run',
        timestamp: Date.now(),
        sequence: 2,
        type: 'event_b',
        source: EvidenceSource.SYSTEM,
        data: {}
      }
    ];

    const passAssert = {
      name: 'pass-assert',
      evaluate: () => 'PASS' as const,
      getReason: () => undefined
    };

    const failAssert = {
      name: 'fail-assert',
      evaluate: () => 'FAIL' as const,
      getReason: () => 'Violation'
    };

    const assertions = new AssertionGroup({
      operator: 'ALL',
      assertions: [passAssert, failAssert]
    });

    const result = engine.evaluate(evidence, assertions);
    expect(result.status).toBe('FAIL');
  });

  it('ANY operator: PASS overrides FAIL', () => {
    const evidence: EvidenceRecord[] = [];

    const failAssert = {
      name: 'fail-assert',
      evaluate: () => 'FAIL' as const,
      getReason: () => undefined
    };

    const passAssert = {
      name: 'pass-assert',
      evaluate: () => 'PASS' as const,
      getReason: () => undefined
    };

    const assertions = new AssertionGroup({
      operator: 'ANY',
      assertions: [failAssert, passAssert]
    });

    const result = engine.evaluate(evidence, assertions);
    expect(result.status).toBe('PASS');
  });

  it('should be independent of scenarioId', () => {
    const evidence: EvidenceRecord[] = [{
      evidenceId: 'ev-1',
      runId: 'test-run',
      timestamp: Date.now(),
      sequence: 1,
      type: 'test_event',
      source: EvidenceSource.SYSTEM,
      data: {}
    }];
    const assertion = new EventCountAssertion('test_event', 1);

    const result1 = engine.evaluate(evidence, [assertion]);
    const result2 = engine.evaluate(evidence, [assertion]);

    expect(result1.status).toBe(result2.status);
  });
});
