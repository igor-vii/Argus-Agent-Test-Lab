import { PaymentAdapter, Address, TxHash, Amount, Receipt } from '../PaymentAdapter';
import { SigningBinding } from '../SigningBinding';
/**
 * X Layer PaymentAdapter — заготовка.
 *
 * X Layer — EVM-совместимый, реализуется через viem
 * с custom chain definition.
 */
export declare class XLayerPaymentAdapter implements PaymentAdapter {
    send(_from: Address, _to: Address, _amount: Amount): Promise<TxHash>;
    getReceiveAddress(_forRole: string): Address;
    getBalance(_address: Address): Promise<Amount>;
    waitForConfirmation(_txHash: TxHash): Promise<Receipt>;
    assertSufficientBalance(_address: Address, _threshold: Amount): Promise<void>;
    signX402Payment(_binding: SigningBinding): Promise<string>;
}
//# sourceMappingURL=XLayerPaymentAdapter.d.ts.map