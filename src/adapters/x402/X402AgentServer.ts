/**
 * X402AgentServer — x402 V2 resource server for Argus-as-seller scenarios.
 *
 * This is a NEW component (does not modify X402AgentAdapter, which only
 * handles the client/buyer side of the protocol).
 *
 * Responsibilities:
 * - Serve an HTTP endpoint that implements the seller half of x402 V2:
 *   - Request without `payment-signature` header  -> 402 + `payment-required`
 *     header (Base64-encoded x402 V2 payment requirements body).
 *   - Request with `payment-signature` header     -> verify the payload is a
 *     well-formed x402 V2 signature envelope (MVP: structural check; full
 *     EIP-3009 verification lives in Secretariat / PaymentAdapter land)
 *     -> 200 + resource body + `payment-response` header.
 * - Log every request/response exchange as evidence.
 *
 * Explicitly NOT doing:
 * - Signing payments (that is PaymentAdapter).
 * - Knowing anything about Secretariat.
 * - Interpreting payment economics (amounts are configured, not decided).
 */

import http from 'http';
import type { AddressInfo } from 'net';

/** Generate a unique ID */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export interface X402ServerPaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds?: number;
}

export interface X402AgentServerConfig {
  /** Port to listen on. 0 = ephemeral port assigned by the OS. */
  port?: number;
  /** Host/interface to bind. Default 127.0.0.1. */
  host?: string;
  /** URL path that is payment-guarded. Default '/resource'. */
  path?: string;
  /** Payment requirements advertised in the 402 response. */
  paymentRequirements: X402ServerPaymentRequirements;
  /** Body returned with 200 after a (structurally) valid payment signature. */
  responseBody?: Record<string, unknown>;
}

export interface X402ServerRequestLog {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  reason: string;
}

/** One evidence record per processed request. */
export interface X402ServerEvidence {
  source: 'x402-server';
  type:
    | 'request_received'
    | 'payment_required_issued'
    | 'payment_signature_accepted'
    | 'payment_signature_rejected';
  data: Record<string, unknown>;
  timestamp: number;
}

interface DecodedSignature {
  ok: boolean;
  reason: string;
  decoded?: Record<string, unknown>;
}

/**
 * Structural validation of a Base64-encoded x402 V2 PAYMENT-SIGNATURE payload.
 * Expected shape:
 *   { x402Version, scheme, network, payload: { signature, authorization: {...} } }
 */
export function decodePaymentSignature(headerValue: string): DecodedSignature {
  let json: string;
  try {
    json = Buffer.from(headerValue, 'base64').toString('utf-8');
  } catch {
    return { ok: false, reason: 'signature header is not valid base64' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'signature payload is not valid JSON' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: 'signature payload is not an object' };
  }

  const p = parsed as Record<string, unknown>;
  if (p.x402Version === undefined) {
    return { ok: false, reason: 'missing x402Version' };
  }
  if (typeof p.scheme !== 'string' || typeof p.network !== 'string') {
    return { ok: false, reason: 'missing scheme/network' };
  }
  const inner = p.payload as Record<string, unknown> | undefined;
  if (!inner || typeof inner !== 'object') {
    return { ok: false, reason: 'missing payload' };
  }
  if (typeof inner.signature !== 'string' || inner.signature.length === 0) {
    return { ok: false, reason: 'missing payload.signature' };
  }
  const auth = inner.authorization as Record<string, unknown> | undefined;
  if (!auth || typeof auth !== 'object') {
    return { ok: false, reason: 'missing payload.authorization' };
  }
  for (const field of ['from', 'to', 'value', 'validAfter', 'validBefore', 'nonce']) {
    if (typeof auth[field] !== 'string') {
      return { ok: false, reason: `missing payload.authorization.${field}` };
    }
  }

  return { ok: true, reason: 'ok', decoded: p };
}

export class X402AgentServer {
  private readonly config: Required<Pick<X402AgentServerConfig, 'port' | 'host' | 'path'>> &
    X402AgentServerConfig;
  private server?: http.Server;
  private actualPort = 0;
  private requests: X402ServerRequestLog[] = [];
  private evidence: X402ServerEvidence[] = [];

  constructor(config: X402AgentServerConfig) {
    this.config = {
      port: config.port ?? 0,
      host: config.host ?? '127.0.0.1',
      path: config.path ?? '/resource',
      ...config,
    };
  }

  /** Start listening. Resolves with the bound URL (use port 0 for ephemeral). */
  async start(): Promise<{ port: number; url: string }> {
    if (this.server) {
      throw new Error('X402AgentServer already started');
    }

    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this.handle(req, res).catch((err) => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
        });
      });

      server.on('error', reject);
      server.listen(this.config.port, this.config.host, () => {
        const addr = server.address() as AddressInfo;
        this.actualPort = addr.port;
        resolve({
          port: addr.port,
          url: `http://${this.config.host}:${addr.port}${this.config.path}`,
        });
      });

      this.server = server;
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = undefined;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  getUrl(): string {
    if (!this.actualPort) {
      throw new Error('X402AgentServer not started');
    }
    return `http://${this.config.host}:${this.actualPort}${this.config.path}`;
  }

  getRequests(): X402ServerRequestLog[] {
    return this.requests;
  }

  getEvidence(): X402ServerEvidence[] {
    return this.evidence;
  }

  private buildPaymentRequiredBody(url: string): Record<string, unknown> {
    const pr = this.config.paymentRequirements;
    return {
      x402Version: 2,
      resource: { url },
      accepts: [
        {
          scheme: pr.scheme,
          network: pr.network,
          maxAmountRequired: pr.maxAmountRequired,
          resource: url,
          payTo: pr.payTo,
          maxTimeoutSeconds: pr.maxTimeoutSeconds ?? 60,
          asset: pr.asset,
        },
      ],
    };
  }

  private record(
    type: X402ServerEvidence['type'],
    data: Record<string, unknown>
  ): void {
    this.evidence.push({ source: 'x402-server', type, data, timestamp: Date.now() });
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const requestId = generateId('x402-req');
    let rawBody = '';
    for await (const chunk of req) {
      rawBody += chunk;
    }

    let body: unknown;
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      body = rawBody;
    }

    const headers: Record<string, string> = {};
    Object.entries(req.headers).forEach(([k, v]) => {
      if (v) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
    });

    const url = this.getUrl();
    const signatureHeader = headers['payment-signature'];

    let responseStatus: number;
    let responseHeaders: Record<string, string>;
    let reason: string;
    let responseBody: Record<string, unknown>;

    if (!signatureHeader) {
      // No payment attached -> 402 + payment-required (header and body).
      const prBody = this.buildPaymentRequiredBody(url);
      const prBase64 = Buffer.from(JSON.stringify(prBody)).toString('base64');
      responseStatus = 402;
      responseHeaders = {
        'Content-Type': 'application/json',
        'payment-required': prBase64,
      };
      responseBody = prBody;
      reason = 'missing payment-signature';
      this.record('payment_required_issued', {
        requestId,
        method: req.method,
        url: req.url,
      });
    } else {
      const decoded = decodePaymentSignature(signatureHeader);
      if (decoded.ok) {
        // MVP: structural validation only. Full EIP-3009 signature recovery
        // is the responsibility of a verifier (e.g. Secretariat's
        // eip3009-verifier), not of this transport-level server.
        responseStatus = 200;
        const paymentResponse = Buffer.from(
          JSON.stringify({ success: true, network: this.config.paymentRequirements.network })
        ).toString('base64');
        responseHeaders = {
          'Content-Type': 'application/json',
          'payment-response': paymentResponse,
        };
        responseBody = this.config.responseBody ?? { served: true };
        reason = 'payment-signature accepted';
        this.record('payment_signature_accepted', {
          requestId,
          scheme: (decoded.decoded as Record<string, unknown>)?.scheme,
          network: (decoded.decoded as Record<string, unknown>)?.network,
        });
      } else {
        responseStatus = 402;
        const prBody = this.buildPaymentRequiredBody(url);
        responseHeaders = {
          'Content-Type': 'application/json',
          'payment-required': Buffer.from(JSON.stringify(prBody)).toString('base64'),
        };
        responseBody = prBody;
        reason = `invalid payment-signature: ${decoded.reason}`;
        this.record('payment_signature_rejected', {
          requestId,
          detail: decoded.reason,
        });
      }
    }

    this.requests.push({
      id: requestId,
      timestamp: Date.now(),
      method: req.method || 'GET',
      url: req.url || '/',
      headers,
      body,
      responseStatus,
      responseHeaders,
      reason,
    });

    this.record('request_received', {
      requestId,
      method: req.method,
      url: req.url,
      hasSignature: Boolean(signatureHeader),
      responseStatus,
    });

    res.writeHead(responseStatus, responseHeaders);
    res.end(JSON.stringify(responseBody));
  }
}
