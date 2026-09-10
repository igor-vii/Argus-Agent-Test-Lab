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
        const key = fault.trigger || fault.type;
        this.faults.set(key, fault);
    }
    /**
     * Получение фолта для действия
     */
    getFaultForAction(actionType) {
        return this.faults.get(actionType);
    }
    /**
     * Применение фолта к операции
     */
    async apply(fault, operation) {
        switch (fault.type) {
            case 'duplicate_request':
                return this.handleDuplicateRequest(operation, fault.config);
            case 'delayed_payment':
                return this.handleDelayedPayment(operation, fault.config);
            case 'crash_after_payment':
                return this.handleCrashAfterPayment(operation, fault.config);
            case 'seller_timeout':
                return this.handleSellerTimeout(operation, fault.config);
            case 'concurrent_request':
                return this.handleConcurrentRequest(operation, fault.config);
            case 'payment_retry':
                return this.handlePaymentRetry(operation, fault.config);
            case 'lost_delivery':
                return this.handleLostDelivery(operation, fault.config);
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
    async handleDelayedPayment(operation, config) {
        const delayMs = config?.['delay_ms'] || 5000;
        await this.sleep(delayMs);
        return operation();
    }
    /**
     * Краш после выполнения
     */
    async handleCrashAfterPayment(operation, config) {
        const result = await operation();
        // Симуляция краша
        throw new Error('Simulated crash after payment');
    }
    /**
     * Таймаут продавца
     */
    async handleSellerTimeout(operation, config) {
        const timeoutMs = config?.['timeout_ms'] || 30000;
        // Создаем промис, который никогда не разрешится (или разрешится после таймаута)
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Seller timeout'));
            }, timeoutMs);
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
    async handlePaymentRetry(operation, config) {
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
     * Утилита для задержки
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
//# sourceMappingURL=FaultInjector.js.map