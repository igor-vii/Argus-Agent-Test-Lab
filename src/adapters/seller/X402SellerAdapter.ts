/**
 * X402SellerAdapter — Mode A MVP vertical slice.
 *
 * Ephemeral HTTP server that acts as an x402 V2 Resource Server / Seller.
 * Used to test external BUYER agents without controlling them.
 *
 * FLOW:
 *   External BUYER → GET /sessions/{id}/resource
 *     → Argus returns 402 + PAYMENT-REQUIRED header
 *   External BUYER → GET /sessions/{id}/resource + PAYMENT-SIGNATURE header
 *     → Argus validates signature structure
 *     → If valid: returns 200 + resource + PAYMENT-RESPONSE header
 *     → If invalid: returns 402 again with error
 *
 * PRINCIPLES:
 * - Does NOT perform on-chain settlement verification.
 * - Accepting a payment signature is an observed protocol event, not proof of settlement.
 * - All interactions are recorded as SessionEvidence.
 * - Reuses existing x402 types from core/AgentTargetPort.
 * - Does NOT import PaymentAdapter or SigningBinding (seller-side does not sign).
 */

import http from 'http';
import type { AddressInfo } from 'net';
import { randomBytes } from 'crypto';
import type {
  TestSession,
  SessionEvidence,
} from '../../sessions/TestSession';
import { createSessionEvidence } from '../../sessions/TestSession';

/**
 * Decode and structurally validate a Base64-encoded x402 V2 PAYMENT-SIGNATURE.
 * Returns parsed object if valid, null otherwise.
 * This is a STRUCTURAL check only — no cryptographic verification.
 */
function decodePaymentSignature(raw: string): {
  x402Version: number;
  accepted?: Record<string, unknown>;
  payload?: {
    signature?: string;
    authorization?: Record<string, unknown>;
  };
} | null {
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);

    if (typeof parsed !== 'object' || parsed === null) return null;
    if (parsed.x402Version !== 2) return null;
    if (typeof parsed.payload !== 'object' || parsed.payload === null) return null;
    if (typeof parsed.payload.signature !== 'string') return null;
    if (typeof parsed.payload.authorization !== 'object' || parsed.payload.authorization === null) return null;

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Build the PAYMENT-REQUIRED header value (Base64-encoded JSON).
 */
function buildPaymentRequiredHeader(session: TestSession): string {
  const body = {
    x402Version: 2,
    resource: {
      url: session.sessionEndpoint,
      description: 'Argus test resource',
    },
    accepts: [{
      scheme: session.paymentConfig.scheme,
      network: session.paymentConfig.network,
      amount: session.paymentConfig.amount,
      asset: session.paymentConfig.asset,
      payTo: session.paymentConfig.payTo,
      maxTimeoutSeconds: session.paymentConfig.maxTimeoutSeconds,
    }],
  };
  return Buffer.from(JSON.stringify(body)).toString('base64');
}

/**
 * Build the PAYMENT-RESPONSE header value (Base64-encoded JSON).
 * Note: tx hash is synthetic — no on-chain settlement in MVP.
 */
function buildPaymentResponseHeader(): string {
  const body = {
    success: true,
    transaction: '0x' + randomBytes(32).toString('hex'),
    network: 'eip155:84532',
  };
  return Buffer.from(JSON.stringify(body)).toString('base64');
}

export class X402SellerAdapter {
  private server: http.Server | null = null;
  private port: number = 0;
  private sessions: Map<string, TestSession> = new Map();

  /**
   * Start the ephemeral HTTP server.
   * Returns the base URL (e.g., http://localhost:PORT).
   */
  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          console.error('[X402SellerAdapter] Unhandled error:', err);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        });
      });

      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address() as AddressInfo;
        this.port = addr.port;
        resolve(`http://127.0.0.1:${this.port}`);
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Stop the server and clean up.
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /**
   * Register a session so the server knows how to respond.
   */
  registerSession(session: TestSession): void {
    this.sessions.set(session.sessionId, session);
  }

  /**
   * Get the full URL for a session's resource endpoint.
   */
  getSessionUrl(sessionId: string): string {
    return `http://127.0.0.1:${this.port}/sessions/${sessionId}/resource`;
  }

  /**
   * Handle an inbound HTTP request.
   */
  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const url = req.url || '/';
    const method = req.method || 'GET';

    // Parse session ID from path: /sessions/{id}/resource
    const match = url.match(/^\/sessions\/([^/]+)\/resource$/);
    if (!match) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const sessionId = match[1];
    const session = this.sessions.get(sessionId);

    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unknown session' }));
      return;
    }

    // Check session expiry
    if (Date.now() > session.expiresAt) {
      session.status = 'EXPIRED';
      res.writeHead(410, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session expired' }));
      return;
    }

    // Read request body (if any)
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    // Collect headers
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        headers[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
      }
    }

    // Check for PAYMENT-SIGNATURE header
    const paymentSignatureRaw = headers['payment-signature'];

    if (paymentSignatureRaw) {
      // === PAID REQUEST PATH ===
      const decoded = decodePaymentSignature(paymentSignatureRaw);

      if (!decoded) {
        // Invalid signature format
        const evidence = createSessionEvidence('inbound', method, url, 402, {
          paymentSignatureReceived: true,
          paymentSignatureValid: false,
          paymentValidationError: 'Invalid PAYMENT-SIGNATURE format',
          rawPaymentSignature: paymentSignatureRaw,
        });
        session.evidence.push(evidence);

        const prHeader = buildPaymentRequiredHeader(session);
        res.writeHead(402, {
          'Content-Type': 'application/json',
          'payment-required': prHeader,
        });
        res.end(JSON.stringify({ error: 'Invalid payment signature' }));
        return;
      }

      // Signature structurally valid — accept payment
      const evidence = createSessionEvidence('inbound', method, url, 200, {
        paymentSignatureReceived: true,
        paymentSignatureValid: true,
        rawPaymentSignature: paymentSignatureRaw,
      });
      session.evidence.push(evidence);

      // Return resource + PAYMENT-RESPONSE
      const responseHeader = buildPaymentResponseHeader();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'payment-response': responseHeader,
      });
      res.end(JSON.stringify({
        ok: true,
        test_session: sessionId,
        resource: 'argus-test-resource',
      }));

      // Mark session as completed if this was a valid interaction
      session.status = 'COMPLETED';
      return;
    }

    // === UNPAID REQUEST PATH → emit 402 ===
    const evidence = createSessionEvidence('inbound', method, url, 402, {
      paymentRequiredEmitted: true,
    });
    session.evidence.push(evidence);

    const prHeader = buildPaymentRequiredHeader(session);
    res.writeHead(402, {
      'Content-Type': 'application/json',
      'payment-required': prHeader,
    });
    res.end(JSON.stringify({ error: 'Payment Required' }));
  }
}
