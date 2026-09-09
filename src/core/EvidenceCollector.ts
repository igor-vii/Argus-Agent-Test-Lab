/**
 * Источники доказательств (наблюдений)
 */
export enum EvidenceSource {
  ENGINE = 'ENGINE',
  AGENT = 'AGENT',
  ADAPTER = 'ADAPTER',
  TARGET = 'TARGET',
  CHAIN = 'CHAIN',
  SYSTEM = 'SYSTEM'
}

/**
 * Запись доказательства (наблюдения)
 */
export interface EvidenceRecord {
  evidenceId: string;
  runId: string;
  timestamp: number;
  sequence: number;
  type: string;
  source: EvidenceSource;
  data: Record<string, unknown>;
  description?: string;
  metadata?: Record<string, unknown>; // Для concurrency/causality резерваций
}

/**
 * Коллектор доказательств
 */
export class EvidenceCollector {
  private evidence: EvidenceRecord[] = [];
  private sequenceCounter: number = 0;

  /**
   * Добавление наблюдения
   * ВАЖНО: Сохраняет ВСЕ наблюдения, даже конфликтующие.
   * Не выбирает "истину", не удаляет дубликаты от разных источников.
   */
  public collect(
    type: string,
    source: EvidenceSource,
    data: Record<string, unknown>,
    runId: string,
    description?: string,
    metadata?: Record<string, unknown>
  ): EvidenceRecord {
    const record: EvidenceRecord = {
      evidenceId: this.generateEvidenceId(),
      runId,
      timestamp: Date.now(),
      sequence: ++this.sequenceCounter, // Порядок поступления, НЕ causal order
      type,
      source,
      data,
      description,
      metadata
    };

    // Просто добавляем, без дедупликации или разрешения конфликтов
    this.evidence.push(record);
    
    return record;
  }

  /**
   * Получение всего набора доказательств
   */
  public getEvidenceSet(): EvidenceRecord[] {
    return [...this.evidence];
  }

  /**
   * Получение доказательств по типу
   */
  public getByType(type: string): EvidenceRecord[] {
    return this.evidence.filter(e => e.type === type);
  }

  /**
   * Получение доказательств по источнику
   */
  public getBySource(source: EvidenceSource): EvidenceRecord[] {
    return this.evidence.filter(e => e.source === source);
  }

  /**
   * Очистка коллектора
   */
  public clear(): void {
    this.evidence = [];
    this.sequenceCounter = 0;
  }

  /**
   * Количество собранных доказательств
   */
  public count(): number {
    return this.evidence.length;
  }

  /**
   * Генерация уникального ID доказательства
   */
  private generateEvidenceId(): string {
    return `ev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
