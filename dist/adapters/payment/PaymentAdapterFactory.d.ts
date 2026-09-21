import { PaymentAdapter } from './PaymentAdapter';
export type PaymentNetwork = 'base-sepolia' | 'base' | 'xlayer' | 'solana';
export interface PaymentAdapterConfig {
    network: PaymentNetwork;
    rpcUrl: string;
    privateKey: `0x${string}`;
    receiveAddresses?: Record<string, string>;
}
/**
 * Создать PaymentAdapter для указанной сети.
 *
 * MVP: реализован только base-sepolia.
 * Остальные — заготовки, бросают NotImplementedError.
 */
export declare function createPaymentAdapter(config: PaymentAdapterConfig): PaymentAdapter;
//# sourceMappingURL=PaymentAdapterFactory.d.ts.map