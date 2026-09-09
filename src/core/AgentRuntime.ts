/**
 * Роли агентов в системе тестирования
 */
export enum AgentRole {
  BUYER = 'BUYER',
  SELLER = 'SELLER',
  OBSERVER = 'OBSERVER',
  CONTROLLER = 'CONTROLLER'
}

/**
 * Декларативные возможности агента
 */
export interface AgentCapabilities {
  canRequest?: boolean;
  canPay?: boolean;
  canExecute?: boolean;
  canObserve?: boolean;
  canRetry?: boolean;
  canCrash?: boolean;
  canDelay?: boolean;
  canOrchestrate?: boolean;
}

/**
 * Конфигурация агента
 */
export interface AgentConfig {
  id: string;
  role: AgentRole;
  capabilities: AgentCapabilities;
  config?: Record<string, unknown>;
}

/**
 * Универсальная модель агента
 */
export class Agent {
  public readonly id: string;
  public readonly role: AgentRole;
  public readonly capabilities: AgentCapabilities;
  public readonly config: Record<string, unknown>;
  private state: Record<string, unknown> = {};

  constructor(config: AgentConfig) {
    this.id = config.id;
    this.role = config.role;
    this.capabilities = config.capabilities;
    this.config = config.config || {};
  }

  /**
   * Проверка наличия возможности
   */
  public hasCapability(capability: keyof AgentCapabilities): boolean {
    return !!this.capabilities[capability];
  }

  /**
   * Выполнение действия с проверкой возможности
   */
  public async act(action: string, payload?: unknown): Promise<unknown> {
    // Простая проверка capability для демонстрации boundary
    const actionToCapability: Record<string, keyof AgentCapabilities> = {
      'request': 'canRequest',
      'pay': 'canPay',
      'execute': 'canExecute',
      'retry': 'canRetry',
    };

    const requiredCap = actionToCapability[action];
    if (requiredCap && !this.hasCapability(requiredCap)) {
      throw new Error(`Agent ${this.id} does not have capability ${requiredCap} to perform action ${action}`);
    }

    // Логика действия делегируется наружу (через Controller)
    return { action, payload, agentId: this.id };
  }

  /**
   * Наблюдение
   */
  public async observe(type: string): Promise<unknown> {
    if (!this.hasCapability('canObserve')) {
      throw new Error(`Agent ${this.id} does not have capability canObserve`);
    }
    return { type, agentId: this.id };
  }

  /**
   * Обновление состояния
   */
  public updateState(newState: Record<string, unknown>): void {
    this.state = { ...this.state, ...newState };
  }

  /**
   * Получение состояния
   */
  public getState(): Record<string, unknown> {
    return { ...this.state };
  }
}
