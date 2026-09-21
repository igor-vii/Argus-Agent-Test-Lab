import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { X402AgentAdapter } from '../../../adapters/x402/X402AgentAdapter';
import { ExchangeStatus, MessageDirection } from '../../../core/AgentTargetPort';
import http from 'http';
import type { AddressInfo } from 'net';

interface MockServerBehavior {
  type: '402_with_header' | '402_with_body_only' | '402_invalid_header' | '200' | '500' | 'delay';
  paymentRequired?: Record<string, unknown>;
  body?: Record<string, unknown>;
  delayMs?: number;
}

class MockX402Server {
  private server?: http.Server;
  private port = 0;
  private behavior: MockServerBehavior = { type: '200', body: {} };
  private requests: Array<{ method: string; url: string; headers: Record<string, string>; body: unknown }> = [];

  setBehavior(behavior: MockServerBehavior) {
    this.behavior = behavior;
  }

  getRequests() {
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
            if (type === '402_with_header' && paymentRequired) {
              const headerValue = Buffer.from(JSON.stringify(paymentRequired)).toString('base64');
              res.writeHead(402, { 'Content-Type': 'application/json', 'payment-required': headerValue });
              res.end(JSON.stringify({ error: 'Payment Required' }));
            } else if (type === '402_with_body_only' && paymentRequired) {
              res.writeHead(402, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(paymentRequired));
            } else if (type === '402_invalid_header') {
              res.writeHead(402, { 'Content-Type': 'application/json', 'payment-required': 'not-valid-base64!!!' });
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

describe('X402AgentAdapter', () => {
  let adapter: X402AgentAdapter;
  let server: MockX402Server;

  beforeEach(() => {
    adapter = new X402AgentAdapter('x402-target');
    server = new MockX402Server();
  });

  afterEach(async () => {
    await server.stop();
    adapter.disconnect();
    adapter.reset();
  });

  describe('connect()', () => {
    it('should succeed with valid x402 config', async () => {
      const result = await adapter.connect({
        transportType: 'x402',
        endpoint: 'http://localhost:1234',
      });
      expect(result.success).toBe(true);
      expect(adapter.isConnected()).toBe(true);
    });

    it('should fail with invalid transport type', async () => {
      const result = await adapter.connect({
        transportType: 'http',
        endpoint: 'http://localhost:1234',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transport type');
      expect(adapter.isConnected()).toBe(false);
    });

    it('should fail without endpoint', async () => {
      const result = await adapter.connect({
        transportType: 'x402',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('endpoint URL is required');
    });

    it('should fail with invalid URL', async () => {
      const result = await adapter.connect({
        transportType: 'x402',
        endpoint: 'not-a-url',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid URL');
    });
  });

  describe('send() without connect', () => {
    it('should throw if not connected', async () => {
      await expect(adapter.send('run-1', 'test')).rejects.toThrow('Not connected');
    });
  });

  describe('send() with 402 responses', () => {
    it('should parse 402 with valid payment-required header', async () => {
      const { url } = await server.start();
      await adapter.connect({ transportType: 'x402', endpoint: url });

      const paymentRequiredBody = {
        x402Version: 2,
        resource: { url: 'http://localhost/resource' },
        accepts: [{
          scheme: 'exact',
          network: 'eip155:84532',
          maxAmountRequired: '10000',
          resource: 'http://localhost/resource',
          payTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          maxTimeoutSeconds: 60,
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        }],
      };

      server.setBehavior({ type: '402_with_header', paymentRequired: paymentRequiredBody });

      const exchange = await adapter.send('run-1', 'request_resource', { resourceId: 'res-1' });

      expect(exchange.status).toBe(ExchangeStatus.PAYMENT_REQUIRED);
      expect(exchange.paymentRequired).toBeDefined();
      expect(exchange.paymentRequired?.scheme).toBe('exact');
      expect(exchange.paymentRequired?.network).toBe('eip155:84532');
      expect(exchange.paymentRequired?.amount).toBe('10000');
      expect(exchange.paymentRequired?.payTo).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
      expect(exchange.paymentRequired?.maxTimeoutSeconds).toBe(60);
    });

    it('should fallback to body if header Base64 is invalid', async () => {
      const { url } = await server.start();
      await adapter.connect({ transportType: 'x402', endpoint: url });

      const paymentRequiredBody = {
        x402Version: 2,
        resource: { url: 'http://localhost/resource' },
        accepts: [{
          scheme: 'exact',
          network: 'eip155:84532',
          maxAmountRequired: '10000',
          resource: 'http://localhost/resource',
          payTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          maxTimeoutSeconds: 60,
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        }],
      };

      server.setBehavior({ type: '402_invalid_header', body: paymentRequiredBody });

      const exchange = await adapter.send('run-1', 'request_resource', { resourceId: 'res-1' });

      expect(exchange.status).toBe(ExchangeStatus.PAYMENT_REQUIRED);
      expect(exchange.paymentRequired).toBeDefined();
      expect(exchange.paymentRequired?.amount).toBe('10000');
    });

    it('should parse 402 from body only (no header)', async () => {
      const { url } = await server.start();
      await adapter.connect({ transportType: 'x402', endpoint: url });

      const paymentRequiredBody = {
        x402Version: 2,
        resource: { url: 'http://localhost/resource' },
        accepts: [{
          scheme: 'exact',
          network: 'eip155:84532',
          maxAmountRequired: '10000',
          resource: 'http://localhost/resource',
          payTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          maxTimeoutSeconds: 60,
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        }],
      };

      server.setBehavior({ type: '402_with_body_only', paymentRequired: paymentRequiredBody });

      const exchange = await adapter.send('run-1', 'request_resource', { resourceId: 'res-1' });

      expect(exchange.status).toBe(ExchangeStatus.PAYMENT_REQUIRED);
      expect(exchange.paymentRequired).toBeDefined();
    });

    it('should fail if 402 has no valid header or body', async () => {
      const { url } = await server.start();
      await adapter.connect({ transportType: 'x402', endpoint: url });

      server.setBehavior({ type: '402_with_body_only', paymentRequired: { error: 'nope' } });

      const exchange = await adapter.send('run-1', 'request_resource', { resourceId: 'res-1' });

      expect(exchange.status).toBe(ExchangeStatus.FAILURE);
      expect(exchange.error).toContain('could not parse');
    });
  });

  describe('send() with other statuses', () => {
    it('should succeed with 200 response', async () => {
      const { url } = await server.start();
      await adapter.connect({ transportType: 'x402', endpoint: url });

      server.setBehavior({ type: '200', body: { data: 'success' } });

      const exchange = await adapter.send('run-1', 'request_resource', { resourceId: 'res-1' });

      expect(exchange.status).toBe(ExchangeStatus.SUCCESS);
      expect(exchange.payload).toEqual({ data: 'success' });
    });

    it('should fail with 500 response', async () => {
      const { url } = await server.start();
      await adapter.connect({ transportType: 'x402', endpoint: url });

      server.setBehavior({ type: '500' });

      const exchange = await adapter.send('run-1', 'request_resource', { resourceId: 'res-1' });

      expect(exchange.status).toBe(ExchangeStatus.FAILURE);
      expect(exchange.error).toContain('HTTP 500');
    });

    it('should timeout if response is delayed', async () => {
      const { url } = await server.start();
      await adapter.connect({ transportType: 'x402', endpoint: url, timeoutMs: 100 });

      server.setBehavior({ type: 'delay', delayMs: 500, body: { delayed: true } });

      const exchange = await adapter.send('run-1', 'request_resource', { resourceId: 'res-1' });

      expect(exchange.status).toBe(ExchangeStatus.TIMEOUT);
      expect(exchange.error).toContain('timeout');
    });
  });

  describe('sendWithSignature()', () => {
    it('should send payment-signature header and succeed', async () => {
      const { url } = await server.start();
      await adapter.connect({ transportType: 'x402', endpoint: url });

      server.setBehavior({ type: '200', body: { paid: true } });

      const signature = Buffer.from(JSON.stringify({ sig: 'test' })).toString('base64');
      const exchange = await adapter.sendWithSignature('run-1', 'request_resource', { resourceId: 'res-1' }, signature);

      expect(exchange.status).toBe(ExchangeStatus.SUCCESS);
      
      const requests = server.getRequests();
      expect(requests.length).toBe(1);
      expect(requests[0].headers['payment-signature']).toBe(signature);
    });

    it('should handle 402 if signature is rejected', async () => {
      const { url } = await server.start();
      await adapter.connect({ transportType: 'x402', endpoint: url });

      const paymentRequiredBody = {
        x402Version: 2,
        resource: { url: 'http://localhost/resource' },
        accepts: [{
          scheme: 'exact',
          network: 'eip155:84532',
          maxAmountRequired: '10000',
          resource: 'http://localhost/resource',
          payTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          maxTimeoutSeconds: 60,
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        }],
      };
      server.setBehavior({ type: '402_with_header', paymentRequired: paymentRequiredBody });

      const signature = Buffer.from(JSON.stringify({ sig: 'bad' })).toString('base64');
      const exchange = await adapter.sendWithSignature('run-1', 'request_resource', { resourceId: 'res-1' }, signature);

      expect(exchange.status).toBe(ExchangeStatus.PAYMENT_REQUIRED);
    });

    it('should capture payment-response header in metadata', async () => {
      const { url } = await server.start();
      await adapter.connect({ transportType: 'x402', endpoint: url });

      const responseBody = { receipt: 'abc' };
      server.setBehavior({ type: '200', body: responseBody });

      const signature = Buffer.from(JSON.stringify({ sig: 'test' })).toString('base64');
      const exchange = await adapter.sendWithSignature('run-1', 'request_resource', { resourceId: 'res-1' }, signature);

      expect(exchange.status).toBe(ExchangeStatus.SUCCESS);
      expect(exchange.metadata?.paymentResponse).toBeDefined();
    });
  });

  describe('receive(), captureEvidence(), disconnect(), reset()', () => {
    it('receive should return INBOUND exchange', async () => {
      const { url } = await server.start();
      await adapter.connect({ transportType: 'x402', endpoint: url });

      const exchange = await adapter.receive('run-1', 'observation', { data: 'obs' });

      expect(exchange.status).toBe(ExchangeStatus.SUCCESS);
      expect(exchange.direction).toBe(MessageDirection.INBOUND);
      expect(exchange.payload).toEqual({ data: 'obs' });
    });

    it('captureEvidence should create evidence', async () => {
      const { url } = await server.start();
      await adapter.connect({ transportType: 'x402', endpoint: url });

      const evidence = await adapter.captureEvidence('run-1', 'state_change', { state: 'new' }, 'Description');

      expect(evidence.type).toBe('state_change');
      expect(evidence.data).toEqual({ state: 'new' });
      expect(evidence.description).toBe('Description');
    });

    it('disconnect should set isConnected to false', async () => {
      const { url } = await server.start();
      await adapter.connect({ transportType: 'x402', endpoint: url });
      expect(adapter.isConnected()).toBe(true);

      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
    });

    it('reset should clear exchanges and evidences', async () => {
      const { url } = await server.start();
      await adapter.connect({ transportType: 'x402', endpoint: url });

      await adapter.send('run-1', 'test', {});
      await adapter.captureEvidence('run-1', 'test', {});

      expect(adapter.getExchanges().length).toBeGreaterThan(0);
      expect(adapter.getEvidences().length).toBeGreaterThan(0);

      adapter.reset();

      expect(adapter.getExchanges().length).toBe(0);
      expect(adapter.getEvidences().length).toBe(0);
    });
  });
});
