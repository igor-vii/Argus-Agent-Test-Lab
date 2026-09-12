import { EvidenceRecord } from './EvidenceCollector';
/**
 * Результат отдельного ассерта
 */
export type AssertionResult = 'PASS' | 'FAIL' | 'INCONCLUSIVE';
/**
 * Интерфейс для отдельного ассерта
 */
export interface Assertion {
    name: string;
    evaluate(evidence: EvidenceRecord[]): AssertionResult;
    getReason?(): string | undefined;
}
/**
 * Оператор группы ассертов
 */
export type AssertionOperator = 'ALL' | 'ANY';
/**
 * Группа ассертов
 */
export declare class AssertionGroup {
    readonly operator: AssertionOperator;
    readonly assertions: Assertion[];
    constructor(config: {
        operator: AssertionOperator;
        assertions: Assertion[];
    });
}
/**
 * Базовый класс для ассертов
 */
export declare abstract class BaseAssertion implements Assertion {
    readonly name: string;
    protected reason?: string;
    constructor(name: string);
    abstract evaluate(evidence: EvidenceRecord[]): AssertionResult;
    getReason(): string | undefined;
    protected setReason(reason: string): void;
}
/**
 * Ассерт: событие существует
 */
export declare class EventExistsAssertion extends BaseAssertion {
    private eventType;
    constructor(eventType: string);
    evaluate(evidence: EvidenceRecord[]): AssertionResult;
}
/**
 * Ассерт: количество событий
 */
export declare class EventCountAssertion extends BaseAssertion {
    private eventType;
    private expectedCount;
    constructor(eventType: string, expectedCount: number);
    evaluate(evidence: EvidenceRecord[]): AssertionResult;
}
/**
 * Ассерт: порядок событий (по sequence наблюдения, НЕ causal order)
 */
export declare class EventOrderingAssertion extends BaseAssertion {
    private beforeType;
    private afterType;
    constructor(beforeType: string, afterType: string);
    evaluate(evidence: EvidenceRecord[]): AssertionResult;
}
/**
 * Ассерт: наличие доказательства по фильтру
 */
export declare class EvidencePresentAssertion extends BaseAssertion {
    private filterFn;
    constructor(name: string, filterFn: (e: EvidenceRecord) => boolean);
    evaluate(evidence: EvidenceRecord[]): AssertionResult;
}
//# sourceMappingURL=Assertions.d.ts.map