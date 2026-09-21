import { NotImplementedError, } from '../PaymentAdapter';
/**
 * X Layer PaymentAdapter — заготовка.
 *
 * X Layer — EVM-совместимый, реализуется через viem
 * с custom chain definition.
 */
export class XLayerPaymentAdapter {
    async send(_from, _to, _amount) {
        throw new NotImplementedError('xlayer');
    }
    getReceiveAddress(_forRole) {
        throw new NotImplementedError('xlayer');
    }
    async getBalance(_address) {
        throw new NotImplementedError('xlayer');
    }
    async waitForConfirmation(_txHash) {
        throw new NotImplementedError('xlayer');
    }
    async assertSufficientBalance(_address, _threshold) {
        throw new NotImplementedError('xlayer');
    }
}
//# sourceMappingURL=XLayerPaymentAdapter.js.map