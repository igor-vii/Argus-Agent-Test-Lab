import { NotImplementedError, } from '../PaymentAdapter';
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
export class SolanaPaymentAdapter {
    async send(_from, _to, _amount) {
        throw new NotImplementedError('solana');
    }
    getReceiveAddress(_forRole) {
        throw new NotImplementedError('solana');
    }
    async getBalance(_address) {
        throw new NotImplementedError('solana');
    }
    async waitForConfirmation(_txHash) {
        throw new NotImplementedError('solana');
    }
    async assertSufficientBalance(_address, _threshold) {
        throw new NotImplementedError('solana');
    }
}
//# sourceMappingURL=SolanaPaymentAdapter.js.map