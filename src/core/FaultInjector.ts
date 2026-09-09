import { ScenarioFault } from './ScenarioDefinition';

/**
 * Инжектор фолтов (сбоев) для тестирования
 */
export class FaultInjector {
  private faults: Map<string, ScenarioFault> = new Map();

  constructor(faults: ScenarioFault[] = []) {
    for (const fault of faults) {
      this.registerFault(fault);
    }
  }

  /**
   * Регистрация фолта
   */
  public registerFault(fault: ScenarioFault): void {
    const key = fault.trigger || fault.type;
    this.faults.set(key, fault);
  }

  /**
   * Получение фолта для действия
   */
  public getFaultForAction(actionType: string): ScenarioFault | undefined {
    return this.faults.get(actionType);
  }

  /**
   * Применение фолта к операции
   */
  public async apply<T>(fault: ScenarioFault, operation: () => Promise<T>): Promise<T> {
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
  private async handleDuplicateRequest<T>(operation: () => Promise<T>, config?: Record<string, unknown>): Promise<T> {
    const repeatCount = (config?.['repeat_count'] as number) || 2;
    
    let result: T | undefined;
    for (let i = 0; i < repeatCount; i++) {
      result = await operation();
    }
    return result!;
  }

  /**
   * Задержка выполнения
   */
  private async handleDelayedPayment<T>(operation: () => Promise<T>, config?: Record<string, unknown>): Promise<T> {
    const delayMs = (config?.['delay_ms'] as number) || 5000;
    await this.sleep(delayMs);
    return operation();
  }

  /**
   * Краш после выполнения
   */
  private async handleCrashAfterPayment<T>(operation: () => Promise<T>, config?: Record<string, unknown>): Promise<T> {
    const result = await operation();
    
    // Симуляция краша
    throw new Error('Simulated crash after payment');
  }

  /**
   * Таймаут продавца
   */
  private async handleSellerTimeout<T>(operation: () => Promise<T>, config?: Record<string, unknown>): Promise<T> {
    const timeoutMs = (config?.['timeout_ms'] as number) || 30000;
    
    // Создаем промис, который никогда не разрешится (или разрешится после таймаута)
    return new Promise<T>((resolve, reject) => {
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
  private async handleConcurrentRequest<T>(operation: () => Promise<T>, config?: Record<string, unknown>): Promise<T> {
    const parallelCount = (config?.['parallel_count'] as number) || 5;
    
    const promises = Array.from({ length: parallelCount }, () => operation());
    const results = await Promise.all(promises);
    
    return results[0]; // Возвращаем первый результат как основной
  }

  /**
   * Повтор попытки при ошибке
   */
  private async handlePaymentRetry<T>(operation: () => Promise<T>, config?: Record<string, unknown>): Promise<T> {
    const retryCount = (config?.['retry_count'] as number) || 3;
    let lastError: Error | undefined;
    
    for (let i = 0; i < retryCount; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        // Продолжаем попытки
      }
    }
    
    throw lastError || new Error('All retries failed');
  }

  /**
   * Потеря доставки
   */
  private async handleLostDelivery<T>(operation: () => Promise<T>, config?: Record<string, unknown>): Promise<T> {
    const dropProbability = (config?.['drop_probability'] as number) || 1.0;
    
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
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
