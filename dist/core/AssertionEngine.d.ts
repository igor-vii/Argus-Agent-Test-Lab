import { EvidenceRecord } from './EvidenceCollector';
import { Assertion, AssertionGroup, AssertionResult } from './Assertions';
/**
 * Результат работы движка ассертов
 */
export interface AssertionEngineResult {
    status: AssertionResult;
    reasons: string[];
    details: Array<{
        assertionName: string;
        result: AssertionResult;
        reason?: string;
    }>;
}
/**
 * Движок оценки ассертов
 */
export declare class AssertionEngine {
    /**
     * Оценка набора ассертов против доказательств
     */
    evaluate(evidence: EvidenceRecord[], assertions: Assertion[] | AssertionGroup): AssertionEngineResult;
    /**
     * Агрегация результатов по оператору ALL или ANY
     */
    private aggregateResults;
}
//# sourceMappingURL=AssertionEngine.d.ts.map