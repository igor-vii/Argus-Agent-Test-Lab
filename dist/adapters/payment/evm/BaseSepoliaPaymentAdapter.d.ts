import { PaymentAdapter, Address, TxHash, Amount, Receipt } from '../PaymentAdapter';
import { SigningBinding } from '../SigningBinding';
/**
 * Base Sepolia PaymentAdapter.
 *
 * Управляет test wallet'ом Argus через приватный ключ из ENV.
 * Реализует:
 * - отправку ETH (send)
 * - наблюдение за подтверждением (waitForConfirmation)
 * - проверку баланса (getBalance)
 * - pre-flight check (assertSufficientBalance)
 * - подпись x402 payment requirements (signX402Payment)
 *
 * НЕ реализует:
 * - платёжную логику (это в Secretariat)
 * - работу с ERC-20 (пока только native ETH)
 */
export declare class BaseSepoliaPaymentAdapter implements PaymentAdapter {
    private readonly publicClient;
    private readonly walletClient;
    private readonly account;
    private readonly receiveAddresses;
    constructor(config: {
        rpcUrl: string;
        privateKey: `0x${string}`;
        receiveAddresses?: Record<string, Address>;
    });
    send(from: Address, to: Address, amount: Amount): Promise<TxHash>;
    getReceiveAddress(forRole: string): Address;
    getBalance(address: Address): Promise<Amount>;
    waitForConfirmation(txHash: TxHash): Promise<Receipt>;
    assertSufficientBalance(address: Address, threshold: Amount): Promise<void>;
    getArgusAddress(): Address;
    /**
     * Подписать x402 payment через EIP-3009, используя EXACT SigningBinding.
     *
     * Возвращает Base64-encoded JSON x402 V2 PaymentPayload:
     * {
     *   x402Version: 2,
     *   accepted: { scheme, network, asset, amount, payTo, maxTimeoutSeconds },
     *   payload: {
     *     signature: '0x...',
     *     authorization: {
     *       from, to, value, validAfter, validBefore, nonce  // = exact binding
     *     }
     *   }
     * }
     */
    signX402Payment(binding: SigningBinding): Promise<string>;
}
//# sourceMappingURL=BaseSepoliaPaymentAdapter.d.ts.map