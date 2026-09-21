import { PaymentAdapter, Address, TxHash, Amount, Receipt } from '../PaymentAdapter';
/**
 * Base (mainnet) PaymentAdapter — заготовка.
 *
 * Реализовать при переходе на Base mainnet. Структура —
 * как у BaseSepoliaPaymentAdapter, но с chain: base (mainnet)
 * и реальными деньгами.
 */
export declare class BasePaymentAdapter implements PaymentAdapter {
    send(_from: Address, _to: Address, _amount: Amount): Promise<TxHash>;
    getReceiveAddress(_forRole: string): Address;
    getBalance(_address: Address): Promise<Amount>;
    waitForConfirmation(_txHash: TxHash): Promise<Receipt>;
    assertSufficientBalance(_address: Address, _threshold: Amount): Promise<void>;
}
//# sourceMappingURL=BasePaymentAdapter.d.ts.map