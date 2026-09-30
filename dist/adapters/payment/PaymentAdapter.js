/**
 * PaymentAdapter — интерфейс для работы с test wallet'ами
 * в реальной сети.
 *
 * Ответственность:
 * - Отправка платежей (Argus как buyer)
 * - Получение адреса для приёма (Argus как seller)
 * - Наблюдение за подтверждением в сети
 * - Pre-flight check баланса
 * - Подпись x402 payment requirements (EIP-3009)
 *
 * НЕ ответственность:
 * - Платёжная логика (это в Secretariat)
 * - Работа с authorization (это в Secretariat)
 * - Facilitator интеграция (это в Secretariat)
 * - Отправка HTTP-запросов (это в AgentTargetPort)
 */
export class InsufficientBalanceError extends Error {
    address;
    balance;
    threshold;
    constructor(address, balance, threshold) {
        super(`Insufficient balance at ${address}: ` +
            `have ${balance}, need >= ${threshold}`);
        this.address = address;
        this.balance = balance;
        this.threshold = threshold;
        this.name = 'InsufficientBalanceError';
    }
}
export class NotImplementedError extends Error {
    constructor(network) {
        super(`Not implemented for network: ${network}`);
        this.name = 'NotImplementedError';
    }
}
//# sourceMappingURL=PaymentAdapter.js.map