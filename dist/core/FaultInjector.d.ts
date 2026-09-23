import { Fault } from './Fault';
import { Observation } from './Evidence';
/**
 * Инжектор фолтов (сбоев) для тестирования
 */
export declare class FaultInjector {
    private faults;
    constructor(faults?: Fault[]);
    /**
     * Регистрация фолта
     */
    registerFault(fault: Fault): void;
    /**
     * Получение всех fault'ов для события (engine event).
     * Возвращает пустой массив, если ничего не зарегистрировано.
     */
    getFaultsForEvent(eventType: string): Fault[];
    /**
     * Применение фолта к операции
     */
    apply<T>(fault: Fault, operation: () => Promise<T>, emit?: (observation: Observation) => void): Promise<T>;
    /**
     * Дублирование запроса
     */
    private handleDuplicateRequest;
    /**
     * Задержка выполнения
     */
    private handleDelayedResponse;
    /**
     * Краш после выполнения
     */
    private handleCrash;
    /**
     * Таймаут (зависание)
     */
    private handleHang;
    /**
     * Параллельное выполнение
     */
    private handleConcurrentRequest;
    /**
     * Повтор попытки при ошибке
     */
    private handleRetry;
    /**
     * Потеря доставки
     */
    private handleLostDelivery;
    /**
     * Respond — НЕ fault по смыслу (baseline-поведение participant'а),
     * живёт здесь ради единообразия механизма emission
     * (FaultInjector.apply + callback).
     */
    private handleRespond;
    /**
     * Утилита для задержки
     */
    private sleep;
}
//# sourceMappingURL=FaultInjector.d.ts.map