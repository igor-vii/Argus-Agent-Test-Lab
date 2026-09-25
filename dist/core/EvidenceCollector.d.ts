import { Evidence } from './Evidence';
/**
 * Внутренняя запись evidence.
 * В Model V0 Evidence = Observation | EngineEvent.
 * Коллектор хранит их как есть, без интерпретации.
 */
export interface EvidenceRecord {
    /** Уникальный идентификатор записи */
    id: string;
    /** Source: participantId или 'engine' */
    source: string;
    /** Type: semantic event type */
    type: string;
    /** Data: observation data */
    data: Record<string, unknown>;
    /** Timestamp в миллисекундах */
    timestamp: number;
    /** Run ID */
    runId: string;
}
/**
 * EvidenceCollector — сбор evidence во время test run.
 *
 * Принципы:
 * - Сохраняет ВСЕ observations (не фильтрует, не делает hierarchy).
 * - Не интерпретирует — что получил, то и записал.
 * - Assertions сами решают, какие observations им нужны.
 */
export declare class EvidenceCollector {
    private records;
    private idCounter;
    /**
     * Собрать evidence.
     * Принимает Evidence (Observation | EngineEvent) + runId.
     */
    collect(evidence: Evidence, runId: string): EvidenceRecord;
    /**
     * Получить все evidence для run.
     */
    getEvidenceSet(runId: string): EvidenceRecord[];
    /**
     * Получить все evidence (для отладки).
     */
    getAllRecords(): EvidenceRecord[];
    /**
     * Получить evidence по типу для run.
     */
    getByType(runId: string, type: string): EvidenceRecord[];
    /**
     * Получить evidence по source для run.
     */
    getBySource(runId: string, source: string): EvidenceRecord[];
    /**
     * Количество evidence для run.
     */
    count(runId: string): number;
    /**
     * Очистить коллектор.
     */
    clear(): void;
}
//# sourceMappingURL=EvidenceCollector.d.ts.map