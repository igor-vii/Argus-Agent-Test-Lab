import { Fault } from './Fault';
import { Observation } from './Evidence';

/**
 * Инжектор фолтов (сбоев) для тестирования
 */
export class FaultInjector {
  private faults: Map<string, Fault> = new Map();

  constructor(faults: Fault[] = []) {
    for (const fault of faults) {
      this.registerFault(fault);
    }
  }

  /**
   * Регистрация фолта
   */
  public registerFault(fault: Fault): void {
    const key = fault.trigger;
    this.faults.set(key, fault);
  }

  /**
   * Получение фолта для события (engine event)
   */
  public getFaultForEvent(eventType: string): Fault | undefined {
    return this.faults.get(eventType);
  }

  /**
   * Применение фолта к операции
   */
  public async apply<T>(
    fault: Fault,
    operation: () => Promise<T>,
    emit?: (observation: Observation) => void
  ): Promise<T> {
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
  private async handleDelayedResponse<T>(
    operation: () => Promise<T>,
    config?: Record<string, unknown>,
    source?: string | null,
    emit?: (observation: Observation) => void
  ): Promise<T> {
    const delayMs = (config?.['delay_ms'] as number) || 5000;
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
  private async handleCrash<T>(operation: () => Promise<T>, config?: Record<string, unknown>): Promise<T> {
    const result = await operation();

    // Симуляция краша
    throw new Error('Simulated crash');
  }

  /**
   * Таймаут (зависание)
   */
  private async handleHang<T>(
    operation: () => Promise<T>,
    config?: Record<string, unknown>,
    source?: string | null,
    emit?: (observation: Observation) => void
  ): Promise<T> {
    const durationMs = (config?.['duration_ms'] as number) || -1;
    if (emit && source) {
      emit({
        source,
        type: 'delivery_started',
        data: {},
        timestamp: Date.now(),
      });
    }
    if (durationMs < 0) {
      return new Promise<T>(() => {});
    }
    return new Promise<T>((resolve, reject) => {
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
  private async handleConcurrentRequest<T>(operation: () => Promise<T>, config?: Record<string, unknown>): Promise<T> {
    const parallelCount = (config?.['parallel_count'] as number) || 5;

    const promises = Array.from({ length: parallelCount }, () => operation());
    const results = await Promise.all(promises);

    return results[0]; // Возвращаем первый результат как основной
  }

  /**
   * Повтор попытки при ошибке
   */
  private async handleRetry<T>(operation: () => Promise<T>, config?: Record<string, unknown>): Promise<T> {
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
   * Respond — НЕ fault по смыслу (baseline-поведение participant'а),
   * живёт здесь ради единообразия механизма emission
   * (FaultInjector.apply + callback).
   */
  private async handleRespond<T>(
    operation: () => Promise<T>,
    config?: Record<string, unknown>,
    source?: string | null,
    emit?: (observation: Observation) => void
  ): Promise<T> {
    if (emit && source) {
      const emitType = config?.['emit'] as string | undefined;
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
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
