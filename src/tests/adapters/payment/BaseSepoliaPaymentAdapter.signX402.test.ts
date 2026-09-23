import { describe, it, expect, beforeEach } from 'vitest';
import { BaseSepoliaPaymentAdapter } from '../../../adapters/payment/evm/BaseSepoliaPaymentAdapter';
import { PaymentRequired } from '../../../core/AgentTargetPort';

describe('BaseSepoliaPaymentAdapter.signX402Payment', () => {
  let adapter: BaseSepoliaPaymentAdapter;

  // Standard Anvil test key #0
  const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`;
  const TEST_RPC_URL = 'http://localhost:8545';

  beforeEach(() => {
    adapter = new BaseSepoliaPaymentAdapter({
      rpcUrl: TEST_RPC_URL,
      privateKey: TEST_PRIVATE_KEY,
      receiveAddresses: {
        'seller-1': '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      },
    });
  });

  const paymentRequired: PaymentRequired = {
    raw: 'test-raw',
    parsed: {
      x402Version: 2,
      resource: { url: 'http://localhost:1234/resource' },
      accepts: [{
        scheme: 'exact',
        network: 'eip155:84532',
        maxAmountRequired: '10000',
        resource: 'http://localhost:1234/resource',
        payTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        maxTimeoutSeconds: 60,
        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      }],
    },
    scheme: 'exact',
    network: 'eip155:84532',
    amount: '10000',
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    payTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    maxTimeoutSeconds: 60,
  };

  it('should return a Base64-encoded string', async () => {
    const result = await adapter.signX402Payment(paymentRequired);
    expect(typeof result).toBe('string');
    
    // Should be valid Base64
    expect(() => Buffer.from(result, 'base64').toString('utf-8')).not.toThrow();
  });

  it('should decode to valid JSON with required structure', async () => {
    const result = await adapter.signX402Payment(paymentRequired);
    const decoded = JSON.parse(Buffer.from(result, 'base64').toString('utf-8'));

    expect(decoded.x402Version).toBe(2);
    expect(decoded.scheme).toBe('exact');
    expect(decoded.network).toBe('eip155:84532');
    expect(decoded.payload).toBeDefined();
    expect(decoded.payload.signature).toBeDefined();
    expect(decoded.payload.authorization).toBeDefined();
  });

  it('should have correct authorization.from (Argus address)', async () => {
    const result = await adapter.signX402Payment(paymentRequired);
    const decoded = JSON.parse(Buffer.from(result, 'base64').toString('utf-8'));

    const argusAddress = adapter.getArgusAddress();
    expect(decoded.payload.authorization.from.toLowerCase()).toBe(argusAddress.toLowerCase());
  });

  it('should have correct authorization.to (payTo from paymentRequired)', async () => {
    const result = await adapter.signX402Payment(paymentRequired);
    const decoded = JSON.parse(Buffer.from(result, 'base64').toString('utf-8'));

    expect(decoded.payload.authorization.to.toLowerCase()).toBe(paymentRequired.payTo.toLowerCase());
  });

  it('should have correct authorization.value (amount as string)', async () => {
    const result = await adapter.signX402Payment(paymentRequired);
    const decoded = JSON.parse(Buffer.from(result, 'base64').toString('utf-8'));

    expect(decoded.payload.authorization.value).toBe(paymentRequired.amount);
  });

  it('should have valid nonce (66 chars, 0x + 64 hex)', async () => {
    const result = await adapter.signX402Payment(paymentRequired);
    const decoded = JSON.parse(Buffer.from(result, 'base64').toString('utf-8'));

    const nonce = decoded.payload.authorization.nonce;
    expect(typeof nonce).toBe('string');
    expect(nonce.length).toBe(66); // 0x + 64 hex chars
    expect(nonce.startsWith('0x')).toBe(true);
    expect(/^0x[0-9a-f]{64}$/i.test(nonce)).toBe(true);
  });

  it('should have validBefore > validAfter', async () => {
    const result = await adapter.signX402Payment(paymentRequired);
    const decoded = JSON.parse(Buffer.from(result, 'base64').toString('utf-8'));

    const validAfter = BigInt(decoded.payload.authorization.validAfter);
    const validBefore = BigInt(decoded.payload.authorization.validBefore);

    expect(validBefore).toBeGreaterThan(validAfter);
  });

  it('should generate different nonce on each call (cryptographic randomness)', async () => {
    const result1 = await adapter.signX402Payment(paymentRequired);
    const result2 = await adapter.signX402Payment(paymentRequired);

    const decoded1 = JSON.parse(Buffer.from(result1, 'base64').toString('utf-8'));
    const decoded2 = JSON.parse(Buffer.from(result2, 'base64').toString('utf-8'));

    expect(decoded1.payload.authorization.nonce).not.toBe(decoded2.payload.authorization.nonce);
  });

  it('should produce valid signature format (0x + 130 hex chars)', async () => {
    const result = await adapter.signX402Payment(paymentRequired);
    const decoded = JSON.parse(Buffer.from(result, 'base64').toString('utf-8'));

    const signature = decoded.payload.signature;
    expect(typeof signature).toBe('string');
    expect(signature.startsWith('0x')).toBe(true);
    expect(signature.length).toBe(132); // 0x + 65 bytes * 2 = 130 hex chars (or 132 with v=27/28)
  });
});
