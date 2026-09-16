import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import {
  PaymentAdapter,
  Address,
  TxHash,
  Amount,
  Receipt,
  InsufficientBalanceError,
} from '../PaymentAdapter';

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
export class BaseSepoliaPaymentAdapter implements PaymentAdapter {
  private readonly publicClient: any;
  private readonly walletClient: any;
  private readonly account: ReturnType<typeof privateKeyToAccount>;
  private readonly receiveAddresses: Map<string, Address>;

  constructor(config: {
    rpcUrl: string;
    privateKey: `0x${string}`;
    receiveAddresses?: Record<string, Address>;
  }) {
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
    this.receiveAddresses = new Map(
      Object.entries(config.receiveAddresses ?? {})
    );
  }

  async send(from: Address, to: Address, amount: Amount): Promise<TxHash> {
    // В Мире A у Argus один test wallet. from должен совпадать
    // с this.account.address, иначе throw.
    if (from.toLowerCase() !== this.account.address.toLowerCase()) {
      throw new Error(
        `Cannot send from ${from}: Argus manages only ${this.account.address}`
      );
    }

    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: baseSepolia,
      to,
      value: amount,
    });

    return hash;
  }

  getReceiveAddress(forRole: string): Address {
    const addr = this.receiveAddresses.get(forRole);
    if (!addr) {
      throw new Error(
        `No receive address configured for role: ${forRole}`
      );
    }
    return addr;
  }

  async getBalance(address: Address): Promise<Amount> {
    return await this.publicClient.getBalance({ address });
  }

  async waitForConfirmation(txHash: TxHash): Promise<Receipt> {
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

  async assertSufficientBalance(
    address: Address,
    threshold: Amount
  ): Promise<void> {
    const balance = await this.getBalance(address);
    if (balance < threshold) {
      throw new InsufficientBalanceError(address, balance, threshold);
    }
  }

  getArgusAddress(): Address {
    return this.account.address;
  }
}
