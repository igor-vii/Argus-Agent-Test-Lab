/**
 * Группа ассертов
 */
export class AssertionGroup {
    operator;
    assertions;
    constructor(config) {
        this.operator = config.operator;
        this.assertions = config.assertions;
    }
}
/**
 * Базовый класс для ассертов
 */
export class BaseAssertion {
    name;
    reason;
    constructor(name) {
        this.name = name;
    }
    getReason() {
        return this.reason;
    }
    setReason(reason) {
        this.reason = reason;
    }
}
/**
 * Ассерт: событие существует
 */
export class EventExistsAssertion extends BaseAssertion {
    eventType;
    constructor(eventType) {
        super(`EventExists(${eventType})`);
        this.eventType = eventType;
    }
    evaluate(evidence) {
        const found = evidence.some(e => e.type === this.eventType);
        if (found) {
            this.setReason(`Event ${this.eventType} found`);
            return 'PASS';
        }
        else {
            this.setReason(`Event ${this.eventType} not found`);
            return 'INCONCLUSIVE'; // Отсутствие доказательства ≠ FAIL
        }
    }
}
/**
 * Ассерт: количество событий
 */
export class EventCountAssertion extends BaseAssertion {
    eventType;
    expectedCount;
    constructor(eventType, expectedCount) {
        super(`EventCount(${eventType}, ${expectedCount})`);
        this.eventType = eventType;
        this.expectedCount = expectedCount;
    }
    evaluate(evidence) {
        const count = evidence.filter(e => e.type === this.eventType).length;
        if (count === this.expectedCount) {
            this.setReason(`Count ${count} matches expected ${this.expectedCount}`);
            return 'PASS';
        }
        else if (count > this.expectedCount) {
            this.setReason(`Count ${count} exceeds expected ${this.expectedCount} - violation detected`);
            return 'FAIL';
        }
        else {
            this.setReason(`Count ${count} less than expected ${this.expectedCount} - insufficient evidence`);
            return 'INCONCLUSIVE';
        }
    }
}
/**
 * Ассерт: порядок событий (по sequence наблюдения, НЕ causal order)
 */
export class EventOrderingAssertion extends BaseAssertion {
    beforeType;
    afterType;
    constructor(beforeType, afterType) {
        super(`EventOrdering(${beforeType} < ${afterType})`);
        this.beforeType = beforeType;
        this.afterType = afterType;
    }
    evaluate(evidence) {
        const beforeEvents = evidence.filter(e => e.type === this.beforeType);
        const afterEvents = evidence.filter(e => e.type === this.afterType);
        if (beforeEvents.length === 0 || afterEvents.length === 0) {
            this.setReason('One or both event types missing - cannot determine order');
            return 'INCONCLUSIVE';
        }
        // Проверяем порядок по sequence (порядок наблюдения)
        const minBeforeSeq = Math.min(...beforeEvents.map(e => e.sequence));
        const maxAfterSeq = Math.max(...afterEvents.map(e => e.sequence));
        if (minBeforeSeq < maxAfterSeq) {
            this.setReason(`${this.beforeType} observed before ${this.afterType}`);
            return 'PASS';
        }
        else {
            this.setReason(`${this.beforeType} observed after ${this.afterType} - order violation`);
            return 'FAIL';
        }
    }
}
/**
 * Ассерт: наличие доказательства по фильтру
 */
export class EvidencePresentAssertion extends BaseAssertion {
    filterFn;
    constructor(name, filterFn) {
        super(name);
        this.filterFn = filterFn;
    }
    evaluate(evidence) {
        const found = evidence.some(this.filterFn);
        if (found) {
            this.setReason('Evidence matching criteria found');
            return 'PASS';
        }
        else {
            this.setReason('No evidence matching criteria found');
            return 'INCONCLUSIVE';
        }
    }
}
//# sourceMappingURL=Assertions.js.map