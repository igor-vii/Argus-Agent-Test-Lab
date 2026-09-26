import { BaseSepoliaPaymentAdapter } from './evm/BaseSepoliaPaymentAdapter';
import { BasePaymentAdapter } from './evm/BasePaymentAdapter';
import { XLayerPaymentAdapter } from './evm/XLayerPaymentAdapter';
import { SolanaPaymentAdapter } from './solana/SolanaPaymentAdapter';
/**
 * Создать PaymentAdapter для указанной сети.
 *
 * MVP: реализован только base-sepolia.
 * Остальные — заготовки, бросают NotImplementedError.
 */
export function createPaymentAdapter(config) {
    switch (config.network) {
        case 'base-sepolia':
            return new BaseSepoliaPaymentAdapter({
                rpcUrl: config.rpcUrl,
                privateKey: config.privateKey,
                receiveAddresses: config.receiveAddresses,
            });
        case 'base':
            return new BasePaymentAdapter();
        case 'xlayer':
            return new XLayerPaymentAdapter();
        case 'solana':
            return new SolanaPaymentAdapter();
        default:
            throw new Error(`Unknown payment network: ${config.network}`);
    }
}
//# sourceMappingURL=PaymentAdapterFactory.js.map