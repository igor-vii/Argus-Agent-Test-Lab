/**
 * Роли агентов в системе тестирования
 */
export var AgentRole;
(function (AgentRole) {
    AgentRole["BUYER"] = "BUYER";
    AgentRole["SELLER"] = "SELLER";
    AgentRole["OBSERVER"] = "OBSERVER";
    AgentRole["CONTROLLER"] = "CONTROLLER";
})(AgentRole || (AgentRole = {}));
/**
 * Универсальная модель агента
 */
export class Agent {
    id;
    role;
    capabilities;
    config;
    state = {};
    constructor(config) {
        this.id = config.id;
        this.role = config.role;
        this.capabilities = config.capabilities;
        this.config = config.config || {};
    }
    /**
     * Проверка наличия возможности
     */
    hasCapability(capability) {
        return !!this.capabilities[capability];
    }
    /**
     * Выполнение действия с проверкой возможности
     */
    async act(action, payload) {
        // Простая проверка capability для демонстрации boundary
        const actionToCapability = {
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
    async observe(type) {
        if (!this.hasCapability('canObserve')) {
            throw new Error(`Agent ${this.id} does not have capability canObserve`);
        }
        return { type, agentId: this.id };
    }
    /**
     * Обновление состояния
     */
    updateState(newState) {
        this.state = { ...this.state, ...newState };
    }
    /**
     * Получение состояния
     */
    getState() {
        return { ...this.state };
    }
}
//# sourceMappingURL=AgentRuntime.js.map