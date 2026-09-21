import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { randomBytes } from 'crypto';
import {
  PaymentAdapter,
  Address,
  TxHash,
  Amount,
  Receipt,
  InsufficientBalanceError,
} from '../PaymentAdapter';
import { PaymentRequired } from '../../../core/AgentTargetPort';

// USDC на Base Sepolia
const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;
const CHAIN_ID_BASE_SEPOLIA = 84532;

// EIP-712 domain для USDC на Base Sepolia
const USDC_DOMAIN = {
  name: 'USDC',
  version: '2',
  chainId: CHAIN_ID_BASE_SEPOLIA,
  verifyingContract: USDC_BASE_SEPOLIA,
} as const;

// EIP-712 types для EIP-3009 TransferWithAuthorization
const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

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

  /**
   * Подписать x402 payment requirements через EIP-712.
   *
   * Возвращает Base64-encoded JSON:
   * {
   *   x402Version: 2,
   *   scheme: 'exact',
   *   network: 'eip155:84532',
   *   payload: {
   *     signature: '0x...',
   *     authorization: {
   *       from: '0x...',
   *       to: '0x...',
   *       value: '10000',
   *       validAfter: '0',
   *       validBefore: '1735689600',
   *       nonce: '0x...'
   *     }
   *   }
   * }
   */
  async signX402Payment(paymentRequired: PaymentRequired): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const validAfter = 0n;
    const validBefore = BigInt(
      now + (paymentRequired.maxTimeoutSeconds || 3600)
    );

    // Криптографически стойкий случайный nonce (32 байта)
    const nonce = `0x${randomBytes(32).toString('hex')}` as `0x${string}`;

    const authorization = {
      from: this.account.address,
      to: paymentRequired.payTo as `0x${string}`,
      value: BigInt(paymentRequired.amount),
      validAfter,
      validBefore,
      nonce,
    };

    const signature = await this.account.signTypedData({
      domain: USDC_DOMAIN,
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: 'TransferWithAuthorization',
      message: authorization,
    });

    const payload = {
      x402Version: 2,
      scheme: paymentRequired.scheme,
      network: paymentRequired.network,
      payload: {
        signature,
        authorization: {
          from: authorization.from,
          to: authorization.to,
          value: authorization.value.toString(),
          validAfter: authorization.validAfter.toString(),
          validBefore: authorization.validBefore.toString(),
          nonce: authorization.nonce,
        },
      },
    };

    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }
}
