import { ScenarioFault } from './ScenarioDefinition';
/**
 * Инжектор фолтов (сбоев) для тестирования
 */
export declare class FaultInjector {
    private faults;
    constructor(faults?: ScenarioFault[]);
    /**
     * Регистрация фолта
     */
    registerFault(fault: ScenarioFault): void;
    /**
     * Получение фолта для действия
     */
    getFaultForAction(actionType: string): ScenarioFault | undefined;
    /**
     * Применение фолта к операции
     */
    apply<T>(fault: ScenarioFault, operation: () => Promise<T>): Promise<T>;
    /**
     * Дублирование запроса
     */
    private handleDuplicateRequest;
    /**
     * Задержка выполнения
     */
    private handleDelayedPayment;
    /**
     * Краш после выполнения
     */
    private handleCrashAfterPayment;
    /**
     * Таймаут продавца
     */
    private handleSellerTimeout;
    /**
     * Параллельное выполнение
     */
    private handleConcurrentRequest;
    /**
     * Повтор попытки при ошибке
     */
    private handlePaymentRetry;
    /**
     * Потеря доставки
     */
    private handleLostDelivery;
    /**
     * Утилита для задержки
     */
    private sleep;
}
//# sourceMappingURL=FaultInjector.d.ts.map