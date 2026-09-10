/**
 * Источники доказательств (наблюдений)
 */
export var EvidenceSource;
(function (EvidenceSource) {
    EvidenceSource["ENGINE"] = "ENGINE";
    EvidenceSource["AGENT"] = "AGENT";
    EvidenceSource["ADAPTER"] = "ADAPTER";
    EvidenceSource["TARGET"] = "TARGET";
    EvidenceSource["CHAIN"] = "CHAIN";
    EvidenceSource["SYSTEM"] = "SYSTEM";
})(EvidenceSource || (EvidenceSource = {}));
/**
 * Коллектор доказательств
 */
export class EvidenceCollector {
    evidence = [];
    sequenceCounter = 0;
    /**
     * Добавление наблюдения
     * ВАЖНО: Сохраняет ВСЕ наблюдения, даже конфликтующие.
     * Не выбирает "истину", не удаляет дубликаты от разных источников.
     */
    collect(type, source, data, runId, description, metadata) {
        const record = {
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
    getEvidenceSet() {
        return [...this.evidence];
    }
    /**
     * Получение доказательств по типу
     */
    getByType(type) {
        return this.evidence.filter(e => e.type === type);
    }
    /**
     * Получение доказательств по источнику
     */
    getBySource(source) {
        return this.evidence.filter(e => e.source === source);
    }
    /**
     * Очистка коллектора
     */
    clear() {
        this.evidence = [];
        this.sequenceCounter = 0;
    }
    /**
     * Количество собранных доказательств
     */
    count() {
        return this.evidence.length;
    }
    /**
     * Генерация уникального ID доказательства
     */
    generateEvidenceId() {
        return `ev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
//# sourceMappingURL=EvidenceCollector.js.map