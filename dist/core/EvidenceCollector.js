// ============================================================
// src/core/EvidenceCollector.ts
// ============================================================
/**
 * EvidenceCollector — сбор evidence во время test run.
 *
 * Принципы:
 * - Сохраняет ВСЕ observations (не фильтрует, не делает hierarchy).
 * - Не интерпретирует — что получил, то и записал.
 * - Assertions сами решают, какие observations им нужны.
 */
export class EvidenceCollector {
    records = [];
    idCounter = 0;
    /**
     * Собрать evidence.
     * Принимает Evidence (Observation | EngineEvent) + runId.
     */
    collect(evidence, runId) {
        const record = {
            id: `ev_${this.idCounter++}`,
            source: evidence.source,
            type: evidence.type,
            data: evidence.data,
            timestamp: evidence.timestamp,
            runId,
        };
        this.records.push(record);
        return record;
    }
    /**
     * Получить все evidence для run.
     */
    getEvidenceSet(runId) {
        return this.records.filter((r) => r.runId === runId);
    }
    /**
     * Получить все evidence (для отладки).
     */
    getAllRecords() {
        return [...this.records];
    }
    /**
     * Получить evidence по типу для run.
     */
    getByType(runId, type) {
        return this.records.filter((r) => r.runId === runId && r.type === type);
    }
    /**
     * Получить evidence по source для run.
     */
    getBySource(runId, source) {
        return this.records.filter((r) => r.runId === runId && r.source === source);
    }
    /**
     * Количество evidence для run.
     */
    count(runId) {
        return this.records.filter((r) => r.runId === runId).length;
    }
    /**
     * Очистить коллектор.
     */
    clear() {
        this.records = [];
        this.idCounter = 0;
    }
}
// ============================================================
// КОНЕЦ ФАЙЛА
// ============================================================
//# sourceMappingURL=EvidenceCollector.js.map