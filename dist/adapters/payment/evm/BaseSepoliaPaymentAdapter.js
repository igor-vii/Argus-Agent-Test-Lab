import { createPublicClient, createWalletClient, http, } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { InsufficientBalanceError, } from '../PaymentAdapter';
/**
 * Base Sepolia PaymentAdapter.
 *
 * Управляет test wallet'ом Argus через приватный ключ из ENV.
 * Реализует:
 * - отправку ETH (send)
 * - наблюдение за подтверждением (waitForConfirmation)
 * - проверку баланса (getBalance)
 * - pre-flight check (assertSufficientBalance)
 *
 * НЕ реализует:
 * - платёжную логику (это в Secretariat)
 * - работу с ERC-20 (пока только native ETH)
 */
export class BaseSepoliaPaymentAdapter {
    publicClient;
    walletClient;
    account;
    receiveAddresses;
    constructor(config) {
        this.account = privateKeyToAccount(config.privateKey);
        this.publicClient = createPublicClient({
            chain: baseSepolia,
            transport: http(config.rpcUrl),
        });
        this.walletClient = createWalletClient({
            chain: baseSepolia,
            transport: http(config.rpcUrl),
            account: this.account,
        });
        this.receiveAddresses = new Map(Object.entries(config.receiveAddresses ?? {}));
    }
    async send(from, to, amount) {
        // В Мире A у Argus один test wallet. from должен совпадать
        // с this.account.address, иначе throw.
        if (from.toLowerCase() !== this.account.address.toLowerCase()) {
            throw new Error(`Cannot send from ${from}: Argus manages only ${this.account.address}`);
        }
        const hash = await this.walletClient.sendTransaction({
            account: this.account,
            chain: baseSepolia,
            to,
            value: amount,
        });
        return hash;
    }
    getReceiveAddress(forRole) {
        const addr = this.receiveAddresses.get(forRole);
        if (!addr) {
            throw new Error(`No receive address configured for role: ${forRole}`);
        }
        return addr;
    }
    async getBalance(address) {
        return await this.publicClient.getBalance({ address });
    }
    async waitForConfirmation(txHash) {
        const receipt = await this.publicClient.waitForTransactionReceipt({
            hash: txHash,
        });
        return {
            txHash,
            blockNumber: receipt.blockNumber,
            status: receipt.status === 'success' ? 'success' : 'reverted',
            gasUsed: receipt.gasUsed,
        };
    }
    async assertSufficientBalance(address, threshold) {
        const balance = await this.getBalance(address);
        if (balance < threshold) {
            throw new InsufficientBalanceError(address, balance, threshold);
        }
    }
    getArgusAddress() {
        return this.account.address;
    }
}
//# sourceMappingURL=BaseSepoliaPaymentAdapter.js.map