import { describe, it, expect } from 'vitest';
import { AssertionEngine } from '../../core/AssertionEngine';
describe('AssertionEngine', () => {
    const engine = new AssertionEngine();
    it('should return INCONCLUSIVE when evidence is missing', () => {
        const emptyEvidence = [];
        const inconclusiveAssertion = {
            id: 'assert-1',
            invariantId: 'inv-1',
            referencedSources: [],
            evaluate: (evidence) => {
                if (evidence.length === 0) {
                    return { status: 'INCONCLUSIVE', reason: 'No evidence provided' };
                }
                return { status: 'PASS' };
            }
        };
        const result = engine.evaluate(emptyEvidence, [inconclusiveAssertion]);
        expect(result.status).toBe('INCONCLUSIVE');
    });
    it('should aggregate multiple assertions (FAIL overrides)', () => {
        const evidence = [
            {
                source: 'sut-1',
                type: 'event_a',
                data: {},
                timestamp: Date.now()
            }
        ];
        const passAssertion = {
            id: 'pass-assert',
            invariantId: 'inv-pass',
            referencedSources: ['sut-1'],
            evaluate: () => ({ status: 'PASS' })
        };
        const failAssertion = {
            id: 'fail-assert',
            invariantId: 'inv-fail',
            referencedSources: ['sut-1'],
            evaluate: () => ({ status: 'FAIL', reason: 'Violation detected' })
        };
        const result = engine.evaluate(evidence, [passAssertion, failAssertion]);
        expect(result.status).toBe('FAIL');
    });
    it('should work with Observation and EngineEvent', () => {
        const evidence = [
            {
                source: 'buyer-1',
                type: 'payment_initiated',
                data: { amount: 100 },
                timestamp: Date.now()
            },
            {
                source: 'engine',
                type: 'run_started',
                data: { runId: 'run-1' },
                timestamp: Date.now()
            }
        ];
        const engineEventAssertion = {
            id: 'engine-assert',
            invariantId: 'inv-engine',
            referencedSources: ['engine'],
            evaluate: (evidence) => {
                const hasEngineEvent = evidence.some(e => e.source === 'engine');
                if (hasEngineEvent) {
                    return { status: 'PASS' };
                }
                return { status: 'FAIL', reason: 'No engine event found' };
            }
        };
        const result = engine.evaluate(evidence, [engineEventAssertion]);
        expect(result.status).toBe('PASS');
    });
    it('should be deterministic', () => {
        const evidence = [
            {
                source: 'sut-1',
                type: 'test_event',
                data: { value: 42 },
                timestamp: Date.now()
            }
        ];
        const deterministicAssertion = {
            id: 'det-assert',
            invariantId: 'inv-det',
            referencedSources: ['sut-1'],
            evaluate: (evidence) => {
                const hasEvent = evidence.some(e => e.type === 'test_event');
                if (hasEvent) {
                    return { status: 'PASS' };
                }
                return { status: 'FAIL' };
            }
        };
        const result1 = engine.evaluate(evidence, [deterministicAssertion]);
        const result2 = engine.evaluate(evidence, [deterministicAssertion]);
        expect(result1.status).toBe(result2.status);
        expect(result1.status).toBe('PASS');
    });
});
//# sourceMappingURL=AssertionEngine.test.js.map