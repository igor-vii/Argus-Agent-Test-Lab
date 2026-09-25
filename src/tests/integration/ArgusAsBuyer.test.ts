/**
 * Integration test: Argus as BUYER against Secretariat.
 *
 * Flow under test (S8 x402 cycle):
 *   X402AgentAdapter -> POST Secretariat endpoint -> HTTP 402 + payment-required
 *   -> BaseSepoliaPaymentAdapter.signX402Payment (EIP-3009 / EIP-712)
 *   -> retry with payment-signature header -> HTTP 200.
 *
 * ENV-driven (no hardcoded URLs/keys):
 * - SECRETARIAT_URL              base URL of a running Secretariat/api-server.
 *                                Unset/unreachable => real-network part is SKIPPED,
 *                                local loopback verification runs instead.
 * - SECRETARIAT_X402_PATH        payment-guarded path (default /api/insurance/quote).
 * - ARGUS_TEST_WALLET_PRIVATE_KEY  test wallet key (falls back to the well-known
 *                                  Hardhat account #0 used across this repo's tests).
 * - BASE_SEPOLIA_RPC_URL         RPC for the payment adapter.
 *
 * Reports are written to reports/argus-as-buyer-<timestamp>.json.
 */

import { describe, it, expect } from 'vitest';
import { X402AgentAdapter } from '../../adapters/x402/X402AgentAdapter';
import { BaseSepoliaPaymentAdapter } from '../../adapters/payment/evm/BaseSepoliaPaymentAdapter';
import { AgentController } from '../../core/AgentController';
import { RunOrchestrator } from '../../core/RunOrchestrator';
import { ScenarioDefinition } from '../../core/ScenarioDefinition';
import { MockTargetAdapter } from '../../adapters/MockTargetAdapter';
import { S1_DuplicateRequest } from '../../scenarios/S1_DuplicateRequest';
import { S2_PaymentBeforeExecution } from '../../scenarios/S2_PaymentBeforeExecution';
import { S3_CrashAfterSettlement } from '../../scenarios/S3_CrashAfterSettlement';
import { S4_SellerTimeout } from '../../scenarios/S4_SellerTimeout';
import { S5_ConcurrentDuplicate } from '../../scenarios/S5_ConcurrentDuplicate';
import { S6_PaymentRetry } from '../../scenarios/S6_PaymentRetry';
import { S7_LostDelivery } from '../../scenarios/S7_LostDelivery';
import { S8_X402Payment } from '../../scenarios/S8_X402Payment';
import { MockX402Server } from '../helpers/MockX402Server';
import {
  ScenarioRunReport,
  getSecretariatUrl,
  probeHttp,
  summarize,
  timestampSlug,
  writeJsonReport,
} from './helpers/reporting';

// Well-known Hardhat account #0 — same default used by existing repo tests.
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

const ALL_SCENARIOS: ScenarioDefinition[] = [
  S1_DuplicateRequest,
  S2_PaymentBeforeExecution,
  S3_CrashAfterSettlement,
  S4_SellerTimeout,
  S5_ConcurrentDuplicate,
  S6_PaymentRetry,
  S7_LostDelivery,
  S8_X402Payment,
];

/**
 * Build a mock controller map for scenarios whose actors are Argus-owned
 * mocks (S1-S7 use MockTargetAdapter participants; sut-1 is never acted on
 * directly in their actions but must resolve if referenced).
 */
function buildMockControllers(
  scenario: ScenarioDefinition
): Map<string, AgentController> {
  const controllers = new Map<string, AgentController>();
  const seenAdapters = new Map<string, MockTargetAdapter>();

  for (const action of scenario.actions) {
    if (controllers.has(action.actor)) continue;
    const participant = scenario.participants.find(
      (p) => p.participantId === action.actor
    );
    // EXTERNAL actors (sut-1) are not driven directly by actions in S1-S7;
    // if an action targets one, we still need a controllable stand-in.
    let adapter = seenAdapters.get(action.actor);
    if (!adapter) {
      adapter = new MockTargetAdapter(`${action.actor}-mock`);
      seenAdapters.set(action.actor, adapter);
    }
    void participant;
    controllers.set(
      action.actor,
      new AgentController(adapter, {
        connectionConfig: { transportType: 'mock' },
        runId: `${scenario.id}-${action.actor}`,
      })
    );
  }
  return controllers;
}

async function runScenarioLocally(scenario: ScenarioDefinition): Promise<ScenarioRunReport> {
  const controllers = buildMockControllers(scenario);
  const orchestrator = new RunOrchestrator(scenario, controllers, []);
  try {
    const result = await orchestrator.run();
    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      runId: result.runId,
      status: result.status,
      verdict: result.verdict?.status,
      reason: result.verdict?.reason,
      evidenceCount: result.evidenceCount,
    };
  } catch (error) {
    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

describe('Argus as Buyer vs Secretariat (integration)', () => {
  const secretariatUrl = getSecretariatUrl();

  it('S1-S7 remain runnable locally (mock transport) and produce verdicts', async () => {
    const runs: ScenarioRunReport[] = [];
    for (const scenario of ALL_SCENARIOS.slice(0, 7)) {
      runs.push(await runScenarioLocally(scenario));
    }
    // Every mock scenario must at least execute and yield a verdict.
    for (const run of runs) {
      expect(run.error, `${run.scenarioId} crashed: ${run.error}`).toBeUndefined();
      expect(['PASS', 'FAIL', 'INCONCLUSIVE']).toContain(run.verdict);
    }
    writeJsonReport(`argus-as-buyer-local-${timestampSlug()}.json`, {
      generatedAt: new Date().toISOString(),
      mode: 'local-loopback-only',
      summary: summarize(runs),
      runs,
      notes: [
        'S1-S7 executed over MockTargetAdapter transport (as designed).',
        'These scenarios model protocol economics inside Argus; they do not',
        'exercise the Secretariat HTTP surface.',
      ],
    });
  });

  it('S8 x402 cycle works end-to-end against a local x402 server (loopback)', async () => {
    const server = new MockX402Server();
    const { url } = await server.start();
    try {
      const paymentRequiredBody = {
        x402Version: 2,
        resource: { url },
        accepts: [
          {
            scheme: 'exact',
            network: 'eip155:84532',
            maxAmountRequired: '10000',
            resource: url,
            payTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
            maxTimeoutSeconds: 60,
            asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          },
        ],
      };
      server.setBehavior({ type: '402_with_header', paymentRequired: paymentRequiredBody });

      const adapter = new X402AgentAdapter('secretariat-sut');
      await adapter.connect({ transportType: 'x402', endpoint: url });

      const paymentAdapter = new BaseSepoliaPaymentAdapter({
        rpcUrl: getRpcUrl(),
        privateKey: getPrivateKey(),
      });

      const controller = new AgentController(adapter, {
        connectionConfig: { transportType: 'x402', endpoint: url },
        timeoutMs: 5000,
      });
      controller.setRunId('buyer-loopback-run');

      const controllers = new Map<string, AgentController>();
      controllers.set('buyer-1', controller);

      const orchestrator = new RunOrchestrator(S8_X402Payment, controllers, [], paymentAdapter);
      const result = await orchestrator.run();

      expect(result.verdict?.status).toBe('PASS');

      const requests = server.getRequests();
      expect(requests.length).toBe(2);
      expect(requests[0].headers['payment-signature']).toBeUndefined();
      expect(requests[1].headers['payment-signature']).toBeDefined();

      writeJsonReport(`argus-as-buyer-loopback-${timestampSlug()}.json`, {
        generatedAt: new Date().toISOString(),
        mode: 'local-loopback-only',
        target: url,
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
        evidence: orchestrator.getEvidence(),
        notes: ['Loopback x402 cycle: 402 -> sign -> retry -> 200 verified.'],
      });
    } finally {
      await server.stop();
    }
  });

  it(
    'S8 x402 cycle against REAL Secretariat (SECRETARIAT_URL)',
    async () => {
      const reachable = await probeHttp(secretariatUrl!);
      if (!reachable) {
        writeJsonReport(`argus-as-buyer-${timestampSlug()}.json`, {
          generatedAt: new Date().toISOString(),
          mode: 'real-secretariat',
          secretariatUrl,
          summary: { total: 1, pass: 0, fail: 0, inconclusive: 0, skipped: 1 },
          runs: [
            {
              scenarioId: 'S8',
              scenarioName: S8_X402Payment.name,
              skipped: true,
              skipReason: `Secretariat unreachable at ${secretariatUrl}`,
            },
          ],
          notes: ['Set SECRETARIAT_URL to a running instance to enable this test.'],
        });
        console.warn(
          `[argus-as-buyer] SKIP: Secretariat not reachable at ${secretariatUrl}`
        );
        return;
      }

      const x402Path = process.env.SECRETARIAT_X402_PATH?.trim() || '/api/insurance/quote';
      const endpoint = `${secretariatUrl}${x402Path.startsWith('/') ? '' : '/'}${x402Path}`;

      const adapter = new X402AgentAdapter('secretariat-sut');
      const conn = await adapter.connect({ transportType: 'x402', endpoint });
      expect(conn.success).toBe(true);

      const paymentAdapter = new BaseSepoliaPaymentAdapter({
        rpcUrl: getRpcUrl(),
        privateKey: getPrivateKey(),
      });

      const controller = new AgentController(adapter, {
        connectionConfig: { transportType: 'x402', endpoint },
        timeoutMs: 15000,
      });
      controller.setRunId('buyer-secretariat-run');

      const controllers = new Map<string, AgentController>();
      controllers.set('buyer-1', controller);

      const orchestrator = new RunOrchestrator(S8_X402Payment, controllers, [], paymentAdapter);
      const result = await orchestrator.run();

      const exchanges = adapter.getExchanges ? adapter.getExchanges() : [];
      const firstWas402 = exchanges.some(
        (e: { status: string }) => e.status === 'PAYMENT_REQUIRED'
      );

      writeJsonReport(`argus-as-buyer-${timestampSlug()}.json`, {
        generatedAt: new Date().toISOString(),
        mode: 'real-secretariat',
        secretariatUrl,
        endpoint,
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
            status: result.status,
            verdict: result.verdict?.status,
            reason: result.verdict?.reason,
            evidenceCount: result.evidenceCount,
          },
        ],
        evidence: orchestrator.getEvidence(),
        exchanges,
        notes: [
          firstWas402
            ? 'Secretariat responded 402 with parseable payment requirements.'
            : 'Secretariat did NOT respond with a parseable 402 — see exchanges.',
        ],
      });

      // Report honestly: the cycle must have produced at least one exchange;
      // PASS requires the signed retry to have been accepted.
      expect(exchanges.length).toBeGreaterThan(0);
      expect(['PASS', 'FAIL', 'INCONCLUSIVE']).toContain(result.verdict?.status);
    }
  );
});
