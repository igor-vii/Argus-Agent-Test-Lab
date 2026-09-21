import { NotImplementedError, } from '../PaymentAdapter';
/**
 * Base (mainnet) PaymentAdapter — заготовка.
 *
 * Реализовать при переходе на Base mainnet. Структура —
 * как у BaseSepoliaPaymentAdapter, но с chain: base (mainnet)
 * и реальными деньгами.
 */
export class BasePaymentAdapter {
    async send(_from, _to, _amount) {
        throw new NotImplementedError('base');
    }
    getReceiveAddress(_forRole) {
        throw new NotImplementedError('base');
    }
    async getBalance(_address) {
        throw new NotImplementedError('base');
    }
    async waitForConfirmation(_txHash) {
        throw new NotImplementedError('base');
    }
    async assertSufficientBalance(_address, _threshold) {
        throw new NotImplementedError('base');
    }
    async signX402Payment(_paymentRequired) {
        throw new NotImplementedError('base');
    }
}
//# sourceMappingURL=BasePaymentAdapter.js.map