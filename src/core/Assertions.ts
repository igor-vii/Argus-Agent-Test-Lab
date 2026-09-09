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
export class AssertionGroup {
  public readonly operator: AssertionOperator;
  public readonly assertions: Assertion[];

  constructor(config: { operator: AssertionOperator; assertions: Assertion[] }) {
    this.operator = config.operator;
    this.assertions = config.assertions;
  }
}

/**
 * Базовый класс для ассертов
 */
export abstract class BaseAssertion implements Assertion {
  public readonly name: string;
  protected reason?: string;

  constructor(name: string) {
    this.name = name;
  }

  public abstract evaluate(evidence: EvidenceRecord[]): AssertionResult;

  public getReason(): string | undefined {
    return this.reason;
  }

  protected setReason(reason: string): void {
    this.reason = reason;
  }
}

/**
 * Ассерт: событие существует
 */
export class EventExistsAssertion extends BaseAssertion {
  private eventType: string;

  constructor(eventType: string) {
    super(`EventExists(${eventType})`);
    this.eventType = eventType;
  }

  evaluate(evidence: EvidenceRecord[]): AssertionResult {
    const found = evidence.some(e => e.type === this.eventType);
    
    if (found) {
      this.setReason(`Event ${this.eventType} found`);
      return 'PASS';
    } else {
      this.setReason(`Event ${this.eventType} not found`);
      return 'INCONCLUSIVE'; // Отсутствие доказательства ≠ FAIL
    }
  }
}

/**
 * Ассерт: количество событий
 */
export class EventCountAssertion extends BaseAssertion {
  private eventType: string;
  private expectedCount: number;

  constructor(eventType: string, expectedCount: number) {
    super(`EventCount(${eventType}, ${expectedCount})`);
    this.eventType = eventType;
    this.expectedCount = expectedCount;
  }

  evaluate(evidence: EvidenceRecord[]): AssertionResult {
    const count = evidence.filter(e => e.type === this.eventType).length;
    
    if (count === this.expectedCount) {
      this.setReason(`Count ${count} matches expected ${this.expectedCount}`);
      return 'PASS';
    } else if (count > this.expectedCount) {
      this.setReason(`Count ${count} exceeds expected ${this.expectedCount} - violation detected`);
      return 'FAIL';
    } else {
      this.setReason(`Count ${count} less than expected ${this.expectedCount} - insufficient evidence`);
      return 'INCONCLUSIVE';
    }
  }
}

/**
 * Ассерт: порядок событий (по sequence наблюдения, НЕ causal order)
 */
export class EventOrderingAssertion extends BaseAssertion {
  private beforeType: string;
  private afterType: string;

  constructor(beforeType: string, afterType: string) {
    super(`EventOrdering(${beforeType} < ${afterType})`);
    this.beforeType = beforeType;
    this.afterType = afterType;
  }

  evaluate(evidence: EvidenceRecord[]): AssertionResult {
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
    } else {
      this.setReason(`${this.beforeType} observed after ${this.afterType} - order violation`);
      return 'FAIL';
    }
  }
}

/**
 * Ассерт: наличие доказательства по фильтру
 */
export class EvidencePresentAssertion extends BaseAssertion {
  private filterFn: (e: EvidenceRecord) => boolean;

  constructor(name: string, filterFn: (e: EvidenceRecord) => boolean) {
    super(name);
    this.filterFn = filterFn;
  }

  evaluate(evidence: EvidenceRecord[]): AssertionResult {
    const found = evidence.some(this.filterFn);
    
    if (found) {
      this.setReason('Evidence matching criteria found');
      return 'PASS';
    } else {
      this.setReason('No evidence matching criteria found');
      return 'INCONCLUSIVE';
    }
  }
}
