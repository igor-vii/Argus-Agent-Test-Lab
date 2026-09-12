/**
 * Роли агентов в системе тестирования
 */
export declare enum AgentRole {
    BUYER = "BUYER",
    SELLER = "SELLER",
    OBSERVER = "OBSERVER",
    CONTROLLER = "CONTROLLER"
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
export declare class Agent {
    readonly id: string;
    readonly role: AgentRole;
    readonly capabilities: AgentCapabilities;
    readonly config: Record<string, unknown>;
    private state;
    constructor(config: AgentConfig);
    /**
     * Проверка наличия возможности
     */
    hasCapability(capability: keyof AgentCapabilities): boolean;
    /**
     * Выполнение действия с проверкой возможности
     */
    act(action: string, payload?: unknown): Promise<unknown>;
    /**
     * Наблюдение
     */
    observe(type: string): Promise<unknown>;
    /**
     * Обновление состояния
     */
    updateState(newState: Record<string, unknown>): void;
    /**
     * Получение состояния
     */
    getState(): Record<string, unknown>;
}
//# sourceMappingURL=AgentRuntime.d.ts.map