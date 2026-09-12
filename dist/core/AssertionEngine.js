/**
 * Движок оценки ассертов
 */
export class AssertionEngine {
    /**
     * Оценка набора ассертов против доказательств
     */
    evaluate(evidence, assertions) {
        const results = [];
        let assertionList;
        let operator = 'ALL';
        if ('assertions' in assertions) {
            // Это группа
            assertionList = assertions.assertions;
            operator = assertions.operator;
        }
        else {
            // Это плоский список
            assertionList = assertions;
        }
        // Оцениваем каждый ассерт
        for (const assertion of assertionList) {
            const result = assertion.evaluate(evidence);
            results.push({
                assertionName: assertion.name,
                result,
                reason: assertion.getReason?.()
            });
        }
        // Агрегируем результаты согласно оператору
        const finalStatus = this.aggregateResults(results, operator);
        const reasons = results
            .filter(r => r.reason)
            .map(r => r.reason);
        return {
            status: finalStatus,
            reasons,
            details: results
        };
    }
    /**
     * Агрегация результатов по оператору ALL или ANY
     */
    aggregateResults(results, operator) {
        const hasFail = results.some(r => r.result === 'FAIL');
        const hasPass = results.some(r => r.result === 'PASS');
        const hasInconclusive = results.some(r => r.result === 'INCONCLUSIVE');
        if (operator === 'ALL') {
            // Все должны быть PASS для общего PASS
            // Любой FAIL делает общий результат FAIL
            // Иначе INCONCLUSIVE
            if (hasFail) {
                return 'FAIL';
            }
            if (hasInconclusive) {
                return 'INCONCLUSIVE';
            }
            return 'PASS';
        }
        else {
            // ANY: хотя бы один PASS дает общий PASS
            // Все FAIL дают общий FAIL
            // Иначе INCONCLUSIVE
            if (hasPass) {
                return 'PASS';
            }
            if (hasFail && !hasInconclusive) {
                return 'FAIL';
            }
            return 'INCONCLUSIVE';
        }
    }
}
//# sourceMappingURL=AssertionEngine.js.map