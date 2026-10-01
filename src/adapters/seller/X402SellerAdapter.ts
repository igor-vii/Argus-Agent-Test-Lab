/**
 * X402SellerAdapter - Mode A MVP: Argus as ephemeral RESOURCE_SERVER / SELLER.
 *
 * Responsibilities:
 * - Start an ephemeral HTTP server on a unique port
 * - Emit valid x402 V2 402 Payment Required on first request
 * - Accept and validate PAYMENT-SIGNATURE header
 * - Return deterministic resource response after valid payment
 * - Record all interactions as SessionEvidence
 *
 * Reuses:
 * - x402 V2 envelope format from existing codebase conventions
 * - EIP-712 verification via viem (already a dependency)
 * - Evidence model from core/Evidence
 *
 * Does NOT:
 * - Perform on-chain settlement verification
 * - Support fault injection profiles (B6 scope)
 * - Persist state beyond in-memory TestSession
 */

import http from 'http';
import type { AddressInfo } from 'net';
import { recoverTypedDataAddress } from 'viem';
import { TestSession, type SessionEvidence } from '../../sessions/TestSession';

// USDC on Base Sepolia - matches existing BaseSepoliaPaymentAdapter constants
const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const CHAIN_ID_BASE_SEPOLIA = 84532;
const NETWORK_BASE_SEPOLIA = `eip155:${CHAIN_ID_BASE_SEPOLIA}`;
export const DEFAULT_BASE_SEPOLIA_PAY_TO = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const USDC_DOMAIN = {
  name: 'USDC',
  version: '2',
  chainId: CHAIN_ID_BASE_SEPOLIA,
  verifyingContract: USDC_BASE_SEPOLIA,
} as const;

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

interface PaymentRequiredBody {
  x402Version: number;
  resource: { url: string };
  accepts: Array<{
    scheme: string;
    network: string;
    amount: string;
    payTo: string;
    asset: string;
    maxTimeoutSeconds: number;
  }>;
}

export interface X402SellerAdapterConfig {
  port?: number;
  amount?: string;
  payTo?: string;
  maxTimeoutSeconds?: number;
}

export class X402SellerAdapter {
  private server: http.Server | null = null;
  private port: number;
  private config: Required<X402SellerAdapterConfig>;

  constructor(config: X402SellerAdapterConfig = {}) {
    this.port = config.port ?? 0;
    this.config = {
      port: this.port,
      amount: config.amount ?? '10000',
      payTo: config.payTo ?? DEFAULT_BASE_SEPOLIA_PAY_TO,
      maxTimeoutSeconds: config.maxTimeoutSeconds ?? 60,
    };
  }

  async start(session: TestSession): Promise<string> {
    const endpointPath = session.getEndpointPath();

    this.server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        void this.handleRequest(req, res, body, session, endpointPath);
      });
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.config.port, '127.0.0.1', () => {
        const addr = this.server!.address() as AddressInfo;
        this.port = addr.port;
        const url = `http://127.0.0.1:${this.port}${endpointPath}`;
        resolve(url);
      });
      this.server!.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server!.close(() => resolve());
    });
  }

  getPort(): number {
    return this.port;
  }

  // -----------------------------------------------------------------------
  // Request handling
  // -----------------------------------------------------------------------

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body: string,
    session: TestSession,
    expectedPath: string,
  ): Promise<void> {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';
    const headers = this.normalizeHeaders(req.headers);

    if (url !== expectedPath) {
      const ev: Omit<SessionEvidence, 'session_id'> = {
        timestamp: Date.now(),
        direction: 'inbound',
        method,
        path: url,
        status_code: 404,
        headers,
        payment_validation_result: 'not_present',
      };
      session.recordInteraction(ev);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const paymentSignatureHeader = headers['payment-signature'];

    if (paymentSignatureHeader) {
      await this.handlePaidRequest(req, res, body, session, headers, paymentSignatureHeader);
    } else {
      this.handleUnpaidRequest(req, res, body, session, headers);
    }
  }

  private handleUnpaidRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body: string,
    session: TestSession,
    headers: Record<string, string>,
  ): void {
    const paymentRequired = this.buildPaymentRequired(session);
    const headerValue = Buffer.from(JSON.stringify(paymentRequired)).toString('base64');

    const ev: Omit<SessionEvidence, 'session_id'> = {
      timestamp: Date.now(),
      direction: 'inbound',
      method: req.method ?? 'GET',
      path: req.url ?? '/',
      status_code: 402,
      headers,
      payment_validation_result: 'not_present',
      body_summary: body ? body.substring(0, 200) : undefined,
    };
    session.recordInteraction(ev);

    res.writeHead(402, {
      'Content-Type': 'application/json',
      'payment-required': headerValue,
    });
    res.end(JSON.stringify({ error: 'Payment Required' }));
  }

  private async handlePaidRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body: string,
    session: TestSession,
    headers: Record<string, string>,
    paymentSignatureBase64: string,
  ): Promise<void> {
    const validationResult = await this.validatePaymentSignatureAsync(paymentSignatureBase64);

    const ev: Omit<SessionEvidence, 'session_id'> = {
      timestamp: Date.now(),
      direction: 'inbound',
      method: req.method ?? 'GET',
      path: req.url ?? '/',
      status_code: validationResult.valid ? 200 : 402,
      headers,
      payment_validation_result: validationResult.valid ? 'valid' : 'invalid',
      body_summary: body ? body.substring(0, 200) : undefined,
    };
    session.recordInteraction(ev);
    session.markPaymentReceived(validationResult.valid);

    if (validationResult.valid) {
      const paymentResponse = Buffer.from(JSON.stringify({
        success: true,
        network: NETWORK_BASE_SEPOLIA,
      })).toString('base64');

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'payment-response': paymentResponse,
      });
      session.complete();
      res.end(JSON.stringify({
        ok: true,
        test_session: session.session_id,
        resource: 'argus-test-resource',
      }));
    } else {
      const paymentRequired = this.buildPaymentRequired(session);
      const headerValue = Buffer.from(JSON.stringify(paymentRequired)).toString('base64');

      res.writeHead(402, {
        'Content-Type': 'application/json',
        'payment-required': headerValue,
      });
      res.end(JSON.stringify({
        error: 'Invalid payment signature',
        detail: validationResult.error,
      }));
    }
  }

  // -----------------------------------------------------------------------
  // x402 helpers
  // -----------------------------------------------------------------------

  private buildPaymentRequired(session: TestSession): PaymentRequiredBody {
    return {
      x402Version: 2,
      resource: { url: `http://127.0.0.1:${this.port}${session.getEndpointPath()}` },
      accepts: [{
        scheme: 'exact',
        network: NETWORK_BASE_SEPOLIA,
        amount: this.config.amount,
        payTo: this.config.payTo,
        asset: USDC_BASE_SEPOLIA,
        maxTimeoutSeconds: this.config.maxTimeoutSeconds,
      }],
    };
  }

  private validatePaymentSignature(base64Payload: string): { valid: boolean; error?: string } {
    try {
      const decoded = Buffer.from(base64Payload, 'base64').toString('utf-8');
      const envelope = JSON.parse(decoded);

      if (envelope.x402Version !== 2) {
        return { valid: false, error: `Expected x402Version 2, got ${envelope.x402Version}` };
      }
      if (!envelope.payload?.signature || !envelope.payload?.authorization) {
        return { valid: false, error: 'Missing payload.signature or payload.authorization' };
      }

      const { signature, authorization } = envelope.payload;

      // Structural validation only; cryptographic verification is performed
      // by validatePaymentSignatureAsync before accepting the payment.

      // Structural checks
      if (!authorization.from || !authorization.to || !authorization.value) {
        return { valid: false, error: 'Incomplete authorization fields' };
      }
      if (authorization.nonce === undefined || authorization.nonce === null || authorization.validAfter === undefined || authorization.validAfter === null || authorization.validBefore === undefined || authorization.validBefore === null) {
        return { valid: false, error: 'Missing nonce/validAfter/validBefore' };
      }

      // Verify recipient matches our configured payTo
      if (authorization.to.toLowerCase() !== this.config.payTo.toLowerCase()) {
        return {
          valid: false,
          error: `Recipient mismatch: got ${authorization.to}, expected ${this.config.payTo}`,
        };
      }

      // Signature format check (basic)
      if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
        return { valid: false, error: 'Invalid signature format (expected 0x + 65 bytes hex)' };
      }

      // Full EIP-712 verification is performed by the async request path.

      return { valid: true };
    } catch (err) {
      return { valid: false, error: `Signature decode/validation error: ${(err as Error).message}` };
    }
  }

  /**
   * Async version with full EIP-712 cryptographic verification.
   * Use this in production/integration tests.
   */
  async validatePaymentSignatureAsync(base64Payload: string): Promise<{ valid: boolean; error?: string }> {
    // First do structural validation
    const structural = this.validatePaymentSignature(base64Payload);
    if (!structural.valid) return structural;

    try {
      const decoded = Buffer.from(base64Payload, 'base64').toString('utf-8');
      const envelope = JSON.parse(decoded);
      const { signature, authorization } = envelope.payload;

      const recoveredAddress = await recoverTypedDataAddress({
        domain: USDC_DOMAIN,
        types: TRANSFER_WITH_AUTHORIZATION_TYPES,
        primaryType: 'TransferWithAuthorization',
        message: {
          from: authorization.from,
          to: authorization.to,
          value: BigInt(authorization.value),
          validAfter: BigInt(authorization.validAfter),
          validBefore: BigInt(authorization.validBefore),
          nonce: authorization.nonce,
        },
        signature,
      });

      if (recoveredAddress.toLowerCase() !== authorization.from.toLowerCase()) {
        return {
          valid: false,
          error: `Signer mismatch: recovered ${recoveredAddress}, expected ${authorization.from}`,
        };
      }

      return { valid: true };
    } catch (err) {
      return { valid: false, error: `Crypto verification failed: ${(err as Error).message}` };
    }
  }

  private normalizeHeaders(raw: http.IncomingHttpHeaders): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (value != null) {
        result[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
      }
    }
    return result;
  }
}
