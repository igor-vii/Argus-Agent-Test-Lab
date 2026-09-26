/**
 * Инжектор фолтов (сбоев) для тестирования
 */
export class FaultInjector {
    faults = new Map();
    constructor(faults = []) {
        for (const fault of faults) {
            this.registerFault(fault);
        }
    }
    /**
     * Регистрация фолта
     */
    registerFault(fault) {
        const key = fault.trigger;
        const existing = this.faults.get(key) ?? [];
        existing.push(fault);
        this.faults.set(key, existing);
    }
    /**
     * Получение всех fault'ов для события (engine event).
     * Возвращает пустой массив, если ничего не зарегистрировано.
     */
    getFaultsForEvent(eventType) {
        return this.faults.get(eventType) ?? [];
    }
    /**
     * Применение фолта к операции
     */
    async apply(fault, operation, emit) {
        const source = fault.target.kind === 'participant'
            ? fault.target.participantId
            : null;
        switch (fault.type) {
            case 'duplicate_request':
                return this.handleDuplicateRequest(operation, fault.config);
            case 'delayed_response':
                return this.handleDelayedResponse(operation, fault.config, source, emit);
            case 'crash':
                return this.handleCrash(operation, fault.config);
            case 'hang':
                return this.handleHang(operation, fault.config, source, emit);
            case 'concurrent_request':
                return this.handleConcurrentRequest(operation, fault.config);
            case 'retry':
                return this.handleRetry(operation, fault.config);
            case 'lost_delivery':
                return this.handleLostDelivery(operation, fault.config);
            case 'respond':
                return this.handleRespond(operation, fault.config, source, emit);
            default:
                return operation();
        }
    }
    /**
     * Дублирование запроса
     */
    async handleDuplicateRequest(operation, config) {
        const repeatCount = config?.['repeat_count'] || 2;
        let result;
        for (let i = 0; i < repeatCount; i++) {
            result = await operation();
        }
        return result;
    }
    /**
     * Задержка выполнения
     */
    async handleDelayedResponse(operation, config, source, emit) {
        const delayMs = config?.['delay_ms'] || 5000;
        if (emit && source) {
            emit({
                source,
                type: 'delivery_started',
                data: {},
                timestamp: Date.now(),
            });
        }
        await this.sleep(delayMs);
        if (emit && source) {
            emit({
                source,
                type: 'delivery_completed',
                data: {},
                timestamp: Date.now(),
            });
        }
        return operation();
    }
    /**
     * Краш после выполнения
     */
    async handleCrash(operation, config) {
        const result = await operation();
        // Симуляция краша
        throw new Error('Simulated crash');
    }
    /**
     * Таймаут (зависание)
     */
    async handleHang(operation, config, source, emit) {
        const durationMs = config?.['duration_ms'] || -1;
        if (emit && source) {
            emit({
                source,
                type: 'delivery_started',
                data: {},
                timestamp: Date.now(),
            });
        }
        if (durationMs < 0) {
            return new Promise(() => { });
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Hang timeout'));
            }, durationMs);
            operation()
                .then(result => {
                clearTimeout(timer);
                resolve(result);
            })
                .catch(reject);
        });
    }
    /**
     * Параллельное выполнение
     */
    async handleConcurrentRequest(operation, config) {
        const parallelCount = config?.['parallel_count'] || 5;
        const promises = Array.from({ length: parallelCount }, () => operation());
        const results = await Promise.all(promises);
        return results[0]; // Возвращаем первый результат как основной
    }
    /**
     * Повтор попытки при ошибке
     */
    async handleRetry(operation, config) {
        const retryCount = config?.['retry_count'] || 3;
        let lastError;
        for (let i = 0; i < retryCount; i++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                // Продолжаем попытки
            }
        }
        throw lastError || new Error('All retries failed');
    }
    /**
     * Потеря доставки
     */
    async handleLostDelivery(operation, config) {
        const dropProbability = config?.['drop_probability'] || 1.0;
        const result = await operation();
        // Симулируем потерю ответа
        if (Math.random() < dropProbability) {
            throw new Error('Delivery lost in transit');
        }
        return result;
    }
    /**
     * Respond — НЕ fault по смыслу (baseline-поведение participant'а),
     * живёт здесь ради единообразия механизма emission
     * (FaultInjector.apply + callback).
     */
    async handleRespond(operation, config, source, emit) {
        if (emit && source) {
            const emitType = config?.['emit'];
            if (emitType) {
                emit({
                    source,
                    type: emitType,
                    data: {},
                    timestamp: Date.now(),
                });
            }
        }
        return operation();
    }
    /**
     * Утилита для задержки
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
//# sourceMappingURL=FaultInjector.js.map