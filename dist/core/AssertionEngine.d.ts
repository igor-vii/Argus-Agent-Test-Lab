import { Evidence } from './Evidence';
import { Assertion, Verdict } from './Assertions';
/**
 * Результат работы движка ассертов
 */
export interface AssertionEngineResult {
    status: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
    reasons: string[];
    details: Array<{
        assertionId: string;
        verdict: Verdict;
    }>;
}
/**
 * Движок оценки ассертов
 */
export declare class AssertionEngine {
    /**
     * Оценка набора ассертов против доказательств
     */
    evaluate(evidence: Evidence[], assertions: Assertion[]): AssertionEngineResult;
    /**
     * Агрегация результатов: все должны быть PASS для общего PASS
     */
    private aggregateResults;
}
//# sourceMappingURL=AssertionEngine.d.ts.map