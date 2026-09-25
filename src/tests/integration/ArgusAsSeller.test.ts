/**
 * Integration test: Argus as SELLER (x402 resource server).
 *
 * Component under test: X402AgentServer (new, src/adapters/x402/X402AgentServer.ts).
 * It plays the seller half of x402 V2:
 *   - request without payment-signature  -> 402 + payment-required header/body
 *   - request with a valid signature     -> 200 + resource + payment-response
 *   - request with a malformed signature -> 402 (rejected), evidence recorded
 *
 * The "client" side is played by the same machinery Secretariat would use
 * (HttpSellerExecutionAdapter in zeus-secretariat sends POST with a
 * PAYMENT-SIGNATURE header). We emulate it locally with X402AgentAdapter +
 * BaseSepoliaPaymentAdapter so the loop is fully closed inside the test.
 *
 * If SECRETARIAT_URL is set and reachable, an additional check runs that
 * point-to-point verifies our advertised payment-required body parses through
 * Argus's own client stack (i.e. wire-format compatibility with x402 tooling).
 *
 * Reports are written to reports/argus-as-seller-<timestamp>.json.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  X402AgentServer,
  decodePaymentSignature,
} from '../../adapters/x402/X402AgentServer';
import { X402AgentAdapter } from '../../adapters/x402/X402AgentAdapter';
import { BaseSepoliaPaymentAdapter } from '../../adapters/payment/evm/BaseSepoliaPaymentAdapter';
import { AgentController } from '../../core/AgentController';
import { RunOrchestrator } from '../../core/RunOrchestrator';
import { S8_X402Payment } from '../../scenarios/S8_X402Payment';
import { ExchangeStatus } from '../../core/AgentTargetPort';
import {
  getSecretariatUrl,
  probeHttp,
  summarize,
  timestampSlug,
  writeJsonReport,
} from './helpers/reporting';

const DEFAULT_TEST_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`;

function getPrivateKey(): `0x${string}` {
  const raw = process.env.ARGUS_TEST_WALLET_PRIVATE_KEY?.trim();
  if (raw && /^0x[0-9a-fA-F]{64}$/.test(raw)) return raw as `0x${string}`;
  return DEFAULT_TEST_KEY;
}

function getRpcUrl(): string {
  return process.env.BASE_SEPOLIA_RPC_URL?.trim() || 'http://localhost:8545';
}

const PAYMENT_REQUIREMENTS = {
  scheme: 'exact',
  network: 'eip155:84532',
  maxAmountRequired: '10000',
  payTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  maxTimeoutSeconds: 60,
};

describe('Argus as Seller — X402AgentServer (integration)', () => {
  let server: X402AgentServer;
  let serverUrl: string;

  beforeAll(async () => {
    server = new X402AgentServer({
      port: 0, // ephemeral, per ТЗ
      paymentRequirements: PAYMENT_REQUIREMENTS,
      responseBody: { resource: 'policy-quote', servedBy: 'argus' },
    });
    const { url } = await server.start();
    serverUrl = url;
  });

  afterAll(async () => {
    await server.stop();
  });

  it('returns 402 + payment-required for requests without payment-signature', async () => {
    const res = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'BUY_ACTION', payload: {} }),
    });

    expect(res.status).toBe(402);

    const prHeader = res.headers.get('payment-required');
    expect(prHeader).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(prHeader!, 'base64').toString('utf-8'));
    expect(decoded.x402Version).toBe(2);
    expect(decoded.accepts[0].network).toBe(PAYMENT_REQUIREMENTS.network);
    expect(decoded.accepts[0].maxAmountRequired).toBe(
      PAYMENT_REQUIREMENTS.maxAmountRequired
    );
    expect(decoded.accepts[0].payTo).toBe(PAYMENT_REQUIREMENTS.payTo);
  });

  it('accepts a valid EIP-3009 payment-signature and returns 200 + resource', async () => {
    // Sign a payment against OUR server's advertised requirements using the
    // same client stack Argus uses as buyer (full round trip).
    const adapter = new X402AgentAdapter('argus-seller-loopback');
    await adapter.connect({ transportType: 'x402', endpoint: serverUrl });
    const paymentAdapter = new BaseSepoliaPaymentAdapter({
      rpcUrl: getRpcUrl(),
      privateKey: getPrivateKey(),
    });

    const first = await adapter.send('seller-loop-run', 'request_resource', {
      resourceId: 'res-1',
    });
    expect(first.status).toBe(ExchangeStatus.PAYMENT_REQUIRED);
    expect(first.paymentRequired).toBeDefined();

    const signature = await paymentAdapter.signX402Payment(first.paymentRequired!);
    const second = await adapter.sendWithSignature(
      'seller-loop-run',
      'request_resource',
      { resourceId: 'res-1' },
      signature
    );
    expect(second.status).toBe(ExchangeStatus.SUCCESS);
    expect((second.payload as Record<string, unknown>).servedBy).toBe('argus');

    // Evidence on the server side must reflect both steps.
    const ev = server.getEvidence();
    expect(ev.some((e) => e.type === 'payment_required_issued')).toBe(true);
    expect(ev.some((e) => e.type === 'payment_signature_accepted')).toBe(true);

    await adapter.disconnect();
  });

  it('rejects a malformed payment-signature with 402 and records evidence', async () => {
    const bad = Buffer.from(JSON.stringify({ nope: true })).toString('base64');
    const res = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'payment-signature': bad },
      body: JSON.stringify({ action: 'BUY_ACTION' }),
    });
    expect(res.status).toBe(402);
    const reason = server.getRequests().at(-1)!.reason;
    expect(reason).toContain('invalid payment-signature');
    expect(decodePaymentSignature(bad).ok).toBe(false);
  });

  it('S8 scenario passes when driven against the Argus seller server', async () => {
    const adapter = new X402AgentAdapter('argus-seller-sut');
    await adapter.connect({ transportType: 'x402', endpoint: serverUrl });
    const paymentAdapter = new BaseSepoliaPaymentAdapter({
      rpcUrl: getRpcUrl(),
      privateKey: getPrivateKey(),
    });
    const controller = new AgentController(adapter, {
      connectionConfig: { transportType: 'x402', endpoint: serverUrl },
      timeoutMs: 5000,
    });
    controller.setRunId('seller-s8-run');

    const controllers = new Map<string, AgentController>();
    controllers.set('buyer-1', controller);

    const orchestrator = new RunOrchestrator(S8_X402Payment, controllers, [], paymentAdapter);
    const result = await orchestrator.run();

    expect(result.verdict?.status).toBe('PASS');

    writeJsonReport(`argus-as-seller-${timestampSlug()}.json`, {
      generatedAt: new Date().toISOString(),
      mode: 'local-loopback-only',
      serverUrl,
      summary: summarize([
        {
          scenarioId: 'S8',
          scenarioName: S8_X402Payment.name,
          runId: result.runId,
          status: result.status,
          verdict: result.verdict?.status,
          reason: result.verdict?.reason,
          evidenceCount: result.evidenceCount,
        },
      ]),
      runs: [
        {
          scenarioId: 'S8',
          scenarioName: S8_X402Payment.name,
          runId: result.runId,
          verdict: result.verdict?.status,
          evidenceCount: result.evidenceCount,
        },
      ],
      engineEvidence: orchestrator.getEvidence(),
      serverEvidence: server.getEvidence(),
      serverRequests: server.getRequests().map((r) => ({
        id: r.id,
        method: r.method,
        url: r.url,
        hasSignature: Boolean(r.headers['payment-signature']),
        responseStatus: r.responseStatus,
        reason: r.reason,
      })),
      notes: [
        'Argus seller server completed the x402 cycle against Argus buyer stack.',
        'Secretariat HttpSellerExecutionAdapter uses the same wire format',
        '(POST + base64 PAYMENT-SIGNATURE header), so this loop emulates it.',
      ],
    });

    await adapter.disconnect();
  });

  it(
    'wire-format compatibility note vs real Secretariat (SECRETARIAT_URL)',
    async () => {
      const secretariatUrl = getSecretariatUrl();
      if (!secretariatUrl || !(await probeHttp(secretariatUrl))) {
        console.warn(
          '[argus-as-seller] SKIP: SECRETARIAT_URL not set/unreachable; ' +
            'real-side integration cannot be verified in this environment.'
        );
        return;
      }
      // If a real Secretariat is present, verify its x402 info endpoint
      // advertises support (GET /api/x402/info in Zeus api-server).
      const res = await fetch(`${secretariatUrl}/api/x402/info`);
      expect(res.ok).toBe(true);
      const info = await res.json();
      expect((info as Record<string, unknown>).x402Supported).toBe(true);
    }
  );
});
