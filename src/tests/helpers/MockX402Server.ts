import http from 'http';
import type { AddressInfo } from 'net';

export interface MockServerBehavior {
  type: '402_with_header' | '402_with_body_only' | '402_invalid_header' | '200' | '500' | 'delay' | '402_with_signature_check';
  paymentRequired?: Record<string, unknown>;
  body?: Record<string, unknown>;
  delayMs?: number;
}

export interface ReceivedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Mock HTTP server for testing x402 flows.
 * Simulates a target that returns 402 Payment Required with x402 V2 headers.
 */
export class MockX402Server {
  private server?: http.Server;
  private port = 0;
  private behavior: MockServerBehavior = { type: '200', body: {} };
  private requests: ReceivedRequest[] = [];

  setBehavior(behavior: MockServerBehavior) {
    this.behavior = behavior;
  }

  getRequests(): ReceivedRequest[] {
    return this.requests;
  }

  async start(): Promise<{ port: number; url: string }> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          const headers: Record<string, string> = {};
          Object.entries(req.headers).forEach(([k, v]) => {
            if (v) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
          });

          this.requests.push({
            method: req.method || 'GET',
            url: req.url || '/',
            headers,
            body: body ? JSON.parse(body) : undefined,
          });

          const { type, paymentRequired, body: responseBody, delayMs } = this.behavior;

          const sendResponse = () => {
            // If request has payment-signature header, treat as paid (return 200)
            if (headers['payment-signature']) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(responseBody || { paid: true, signatureReceived: true }));
              return;
            }

            if (type === '402_with_header' && paymentRequired) {
              const headerValue = Buffer.from(JSON.stringify(paymentRequired)).toString('base64');
              res.writeHead(402, { 
                'Content-Type': 'application/json', 
                'payment-required': headerValue 
              });
              res.end(JSON.stringify({ error: 'Payment Required' }));
            } else if (type === '402_with_body_only' && paymentRequired) {
              res.writeHead(402, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(paymentRequired));
            } else if (type === '402_invalid_header') {
              res.writeHead(402, { 
                'Content-Type': 'application/json', 
                'payment-required': 'not-valid-base64!!!' 
              });
              res.end(JSON.stringify(body || { error: 'Invalid' }));
            } else if (type === '500') {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Internal Server Error' }));
            } else if (type === 'delay' && delayMs) {
              setTimeout(() => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(responseBody || { delayed: true }));
              }, delayMs);
              return;
            } else {
              // Default 200
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(responseBody || { success: true }));
            }
          };

          if (delayMs && type !== 'delay') {
            setTimeout(sendResponse, delayMs);
          } else {
            sendResponse();
          }
        });
      });

      this.server.listen(0, () => {
        const address = this.server!.address() as AddressInfo;
        this.port = address.port;
        resolve({ port: this.port, url: `http://localhost:${this.port}` });
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
