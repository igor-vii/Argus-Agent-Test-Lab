import { describe, it, expect } from 'vitest';
import { AssertionEngine } from '../../core/AssertionEngine';
import { EventExistsAssertion, EventCountAssertion, AssertionGroup } from '../../core/Assertions';
describe('AssertionEngine', () => {
    const engine = new AssertionEngine();
    it('should return INCONCLUSIVE when evidence is missing', () => {
        const emptyEvidence = [];
        const assertion = new EventExistsAssertion('non_existent_event');
        // Interface: evaluate(evidence, assertions)
        const result = engine.evaluate(emptyEvidence, [assertion]);
        expect(result.status).toBe('INCONCLUSIVE');
    });
    it('ALL operator: FAIL overrides PASS', () => {
        const evidence = [
            { type: 'event_a', source: 'SYSTEM', data: {}, sequence: 1 },
            { type: 'event_b', source: 'SYSTEM', data: {}, sequence: 2 }
        ];
        const passAssert = {
            name: 'pass-assert',
            evaluate: () => 'PASS',
            getReason: () => undefined
        };
        const failAssert = {
            name: 'fail-assert',
            evaluate: () => 'FAIL',
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
        const evidence = [];
        const failAssert = {
            name: 'fail-assert',
            evaluate: () => 'FAIL',
            getReason: () => undefined
        };
        const passAssert = {
            name: 'pass-assert',
            evaluate: () => 'PASS',
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
        const evidence = [{ type: 'test_event', source: 'SYSTEM', data: {}, sequence: 1 }];
        const assertion = new EventCountAssertion('test_event', 1);
        const result1 = engine.evaluate(evidence, [assertion]);
        const result2 = engine.evaluate(evidence, [assertion]);
        expect(result1.status).toBe(result2.status);
    });
});
//# sourceMappingURL=AssertionEngine.test.js.map