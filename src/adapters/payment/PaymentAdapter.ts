/**
 * PaymentAdapter — интерфейс для работы с test wallet'ами
 * в реальной сети.
 *
 * Ответственность:
 * - Отправка платежей (Argus как buyer)
 * - Получение адреса для приёма (Argus как seller)
 * - Наблюдение за подтверждением в сети
 * - Pre-flight check баланса
 *
 * НЕ ответственность:
 * - Платёжная логика (это в Secretariat)
 * - Работа с authorization (это в Secretariat)
 * - Facilitator интеграция (это в Secretariat)
 */

export type Address = `0x${string}`;
export type TxHash = `0x${string}`;
export type Amount = bigint;

export interface Receipt {
  txHash: TxHash;
  blockNumber: bigint;
  status: 'success' | 'reverted';
  gasUsed: bigint;
}

export interface PaymentAdapter {
  /**
   * Отправить платёж в сети.
   * От имени одного адреса другому.
   */
  send(from: Address, to: Address, amount: Amount): Promise<TxHash>;

  /**
   * Получить адрес для приёма платежа.
   * forRole — participantId (например, 'seller-1').
   * Адрес определяется по маппингу в адаптере
   * (например, из ENV или из конфига).
   */
  getReceiveAddress(forRole: string): Address;

  /**
   * Получить баланс адреса в сети.
   */
  getBalance(address: Address): Promise<Amount>;

  /**
   * Дождаться подтверждения транзакции.
   */
  waitForConfirmation(txHash: TxHash): Promise<Receipt>;

  /**
   * Pre-flight check: убедиться, что баланс >= threshold.
   * Бросает InsufficientBalanceError, если меньше.
   */
  assertSufficientBalance(
    address: Address,
    threshold: Amount
  ): Promise<void>;
}

export class InsufficientBalanceError extends Error {
  constructor(
    public readonly address: Address,
    public readonly balance: Amount,
    public readonly threshold: Amount
  ) {
    super(
      `Insufficient balance at ${address}: ` +
      `have ${balance}, need >= ${threshold}`
    );
    this.name = 'InsufficientBalanceError';
  }
}

export class NotImplementedError extends Error {
  constructor(network: string) {
    super(`Not implemented for network: ${network}`);
    this.name = 'NotImplementedError';
  }
}
