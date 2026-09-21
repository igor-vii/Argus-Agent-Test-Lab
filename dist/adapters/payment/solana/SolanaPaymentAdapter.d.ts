import { PaymentAdapter, Address, TxHash, Amount, Receipt } from '../PaymentAdapter';
/**
 * Solana PaymentAdapter — заготовка.
 *
 * Solana — не EVM, реализуется через @solana/web3.js.
 * Интерфейс PaymentAdapter частично не подходит (другие типы
 * адресов, txHash). Реализовать при переходе на Solana,
 * возможно с отдельным интерфейсом.
 *
 * ВАЖНО: Address = `0x${string}` в нашем интерфейсе НЕ подходит
 * для Solana. Пока оставляем как заглушку — реальная типизация
 * Solana будет отдельно.
 */
export declare class SolanaPaymentAdapter implements PaymentAdapter {
    send(_from: Address, _to: Address, _amount: Amount): Promise<TxHash>;
    getReceiveAddress(_forRole: string): Address;
    getBalance(_address: Address): Promise<Amount>;
    waitForConfirmation(_txHash: TxHash): Promise<Receipt>;
    assertSufficientBalance(_address: Address, _threshold: Amount): Promise<void>;
}
//# sourceMappingURL=SolanaPaymentAdapter.d.ts.map