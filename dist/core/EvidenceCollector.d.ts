/**
 * Источники доказательств (наблюдений)
 */
export declare enum EvidenceSource {
    ENGINE = "ENGINE",
    AGENT = "AGENT",
    ADAPTER = "ADAPTER",
    TARGET = "TARGET",
    CHAIN = "CHAIN",
    SYSTEM = "SYSTEM"
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
    metadata?: Record<string, unknown>;
}
/**
 * Коллектор доказательств
 */
export declare class EvidenceCollector {
    private evidence;
    private sequenceCounter;
    /**
     * Добавление наблюдения
     * ВАЖНО: Сохраняет ВСЕ наблюдения, даже конфликтующие.
     * Не выбирает "истину", не удаляет дубликаты от разных источников.
     */
    collect(type: string, source: EvidenceSource, data: Record<string, unknown>, runId: string, description?: string, metadata?: Record<string, unknown>): EvidenceRecord;
    /**
     * Получение всего набора доказательств
     */
    getEvidenceSet(): EvidenceRecord[];
    /**
     * Получение доказательств по типу
     */
    getByType(type: string): EvidenceRecord[];
    /**
     * Получение доказательств по источнику
     */
    getBySource(source: EvidenceSource): EvidenceRecord[];
    /**
     * Очистка коллектора
     */
    clear(): void;
    /**
     * Количество собранных доказательств
     */
    count(): number;
    /**
     * Генерация уникального ID доказательства
     */
    private generateEvidenceId;
}
//# sourceMappingURL=EvidenceCollector.d.ts.map