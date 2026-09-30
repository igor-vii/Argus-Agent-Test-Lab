/**
 * R2 — Minimal Lifecycle Observation Plumbing tests.
 *
 * Proves ONLY the implemented plumbing:
 * 1. A legitimate lifecycle observation reported by the simulated source
 *    (settlement layer of the Sut, via MockTargetAdapter config) enters the
 *    EXISTING evidence path (metadata.observations → ScenarioEngine →
 *    EvidenceCollector) and reaches existing scenario assertions.
 * 2. The evidence retains its exact lifecycle identity ('payment_settled',
 *    'settlement_unknown') — no renaming, no normalization.
 * 3. Lifecycle observations do NOT invoke FaultInjector dispatch
 *    (L0-F2 preserved: only action_* triggers enter active dispatch).
 * 4. UNKNOWN remains distinct from FAILURE / success / failed.
 * 5. S1/S5 action-fault behavior is not regressed.
 * 6. S8 x402 engine evidence is not reinterpreted as settlement.
 */

import { describe, expect, it } from 'vitest';
import { RunOrchestrator } from '../../core/RunOrchestrator';
import { ScenarioEngine } from '../../core/ScenarioEngine';
import { ExecutionRegistry } from '../../core/ExecutionRegistry';
import { FaultInjector } from '../../core/FaultInjector';
import { EvidenceCollector } from '../../core/EvidenceCollector';
import { RunContext, RunStatus } from '../../core/RunLifecycle';
import { AgentController } from '../../core/AgentController';
import {
  MockTargetAdapter,
  MOCK_LIFECYCLE_OBSERVATION_TYPES,
} from '../../adapters/MockTargetAdapter';
import { validateFaultDispatch } from '../../core/validateScenario';
import { ExchangeStatus, PaymentRequired } from '../../core/AgentTargetPort';
import { S1_DuplicateRequest } from '../../scenarios/S1_DuplicateRequest';
import { S2_PaymentBeforeExecution } from '../../scenarios/S2_PaymentBeforeExecution';
import { S5_ConcurrentDuplicate } from '../../scenarios/S5_ConcurrentDuplicate';
import { S8_X402Payment } from '../../scenarios/S8_X402Payment';
import { ScenarioDefinition } from '../../core/ScenarioDefinition';

/**
 * Engine-level harness: connects the controller BEFORE running the engine.
 * (RunOrchestrator owns connect/disconnect in production runs; here we drive
 * ScenarioEngine directly so tests can inspect the EvidenceCollector.)
 */
async function runEngine(
  scenario: ScenarioDefinition,
  lifecycleObservations: Record<string, string[]>,
  runId: string,
  paymentResolver?: (paymentRequired: PaymentRequired) => Promise<string>,
): Promise<EvidenceCollector> {
  const targetAdapter = new MockTargetAdapter('mock');
  const controller = new AgentController(targetAdapter, {
    connectionConfig: {
      transportType: 'mock',
      options: { lifecycleObservations },
    },
    runId,
  });
  await controller.connect();

  const registry = new ExecutionRegistry();
  registry.register('buyer-1', controller);

  const context: RunContext = {
    runId,
    scenarioId: scenario.id,
    seed: scenario.seed,
    startedAt: new Date(),
    status: RunStatus.CREATED,
  };

  const collector = new EvidenceCollector();
  const faultInjector = new FaultInjector([]);
  const getFaultsSpy = vi_spy(faultInjector, 'getFaultsForEvent');

  const engine = new ScenarioEngine(
    scenario,
    context,
    registry,
    faultInjector,
    collector,
    paymentResolver,
  );
  await engine.execute();

  // Plumbing never routes lifecycle observations through FaultInjector:
  // lookup happened only for the action trigger.
  expect(getFaultsSpy.calls).toEqual(['action_request_payment']);

  return collector;
}

function runWithMock(
  scenario: ScenarioDefinition,
  lifecycleObservations: Record<string, string[]>,
) {
  const targetAdapter = new MockTargetAdapter('mock');
  const controller = new AgentController(targetAdapter, {
    connectionConfig: {
      transportType: 'mock',
      options: { lifecycleObservations },
    },
    runId: `run_${Date.now()}`,
  });

  const controllers = new Map<string, AgentController>();
  for (const p of scenario.participants) {
    if (p.ownership === 'ARGUS') {
      controllers.set(p.participantId, controller);
    }
  }
  if (controllers.size === 0) {
    controllers.set('default', controller);
  }

  const orchestrator = new RunOrchestrator(scenario, controllers, scenario.assertions || []);
  return orchestrator.run();
}

describe('R2 lifecycle observation plumbing', () => {
  it('simulated-source payment_settled flows through the existing evidence path into S2 assertion', async () => {
    // Legitimate per §5.1: a FACILITATOR sut-1 reports its own settlement state.
    // With settled observed but no success and no seller response, the existing
    // assert_no_premature_success must advance from 'payment_settled not
    // observed yet' to 'success not observed yet — still pending, expected'.
    const result = await runWithMock(S2_PaymentBeforeExecution, {
      request_payment: ['payment_settled'],
    });

    expect(result.verdict?.status).toBe('INCONCLUSIVE');
    expect(result.verdict?.reason).toContain(
      'success not observed yet — still pending, expected',
    );
  }, 20000);

  it('evidence record keeps exact lifecycle identity through EvidenceCollector', async () => {
    const scenario: ScenarioDefinition = {
      ...S2_PaymentBeforeExecution,
      // Silence the delayed_response fault so this test exercises the pure
      // observation path without any FaultInjector involvement at all.
      faults: [],
    };

    const targetAdapter = new MockTargetAdapter('mock');
    const controller = new AgentController(targetAdapter, {
      connectionConfig: {
        transportType: 'mock',
        options: { lifecycleObservations: { request_payment: ['payment_settled'] } },
      },
      runId: 'run_identity',
    });
    controller.setParticipantId('buyer-1');

    const registry = new ExecutionRegistry();
    registry.register('buyer-1', controller);

    const context: RunContext = {
      runId: 'run_identity',
      scenarioId: scenario.id,
      seed: scenario.seed,
      startedAt: new Date(),
      status: RunStatus.CREATED,
    };

    // FaultInjector registered with NO faults: nothing can dispatch through it.
    const faultInjector = new FaultInjector([]);
    const getFaultsSpy = vi_spy(faultInjector, 'getFaultsForEvent');

    const collector = new EvidenceCollector();
    const engine = new ScenarioEngine(scenario, context, registry, faultInjector, collector);
    await engine.execute();

    const records = collector.getByType('run_identity', 'payment_settled');
    expect(records).toHaveLength(1);
    expect(records[0].type).toBe('payment_settled'); // identity survives unchanged
    expect(records[0].source).toBe('sut-1');         // testSubject association preserved
    expect(records[0].actorId).toBe('buyer-1');      // actor identity preserved where supported

    // Plumbing did not route lifecycle observations through FaultInjector:
    // lookup happened only for the action trigger and returned zero faults.
    expect(getFaultsSpy.calls).toEqual(['action_request_payment']);
  });

  it('settlement_unknown enters evidence as its own identity and never becomes failure/success', async () => {
    // Direct collector inspection: settlement layer reports UNKNOWN explicitly.
    const scenario: ScenarioDefinition = { ...S1_DuplicateRequest, faults: [] };
    const targetAdapter = new MockTargetAdapter('mock');
    const controller = new AgentController(targetAdapter, {
      connectionConfig: {
        transportType: 'mock',
        options: { lifecycleObservations: { request_payment: ['settlement_unknown'] } },
      },
      runId: 'run_unknown',
    });
    const registry = new ExecutionRegistry();
    registry.register('buyer-1', controller);
    const context: RunContext = {
      runId: 'run_unknown',
      scenarioId: scenario.id,
      seed: scenario.seed,
      startedAt: new Date(),
      status: RunStatus.CREATED,
    };
    const collector = new EvidenceCollector();
    const engine = new ScenarioEngine(scenario, context, registry, new FaultInjector([]), collector);
    await engine.execute();

    const unknown = collector.getByType('run_unknown', 'settlement_unknown');
    expect(unknown).toHaveLength(1);
    expect(unknown[0].source).toBe('sut-1');

    // UNKNOWN ≠ FAILURE: no translation into failed/success/cancelled happened.
    expect(collector.getByType('run_unknown', 'failed')).toHaveLength(0);
    expect(collector.getByType('run_unknown', 'success')).toHaveLength(0);
    expect(collector.getByType('run_unknown', 'payment_settled')).toHaveLength(0);
  });

  it('allow-list blocks speculative types that no canonical assertion consumes', async () => {
    expect(MOCK_LIFECYCLE_OBSERVATION_TYPES.has('delivery_received')).toBe(false);
    expect(MOCK_LIFECYCLE_OBSERVATION_TYPES.has('recovery_completed')).toBe(false);
    expect(MOCK_LIFECYCLE_OBSERVATION_TYPES.has('forward_request')).toBe(false);

    const scenario: ScenarioDefinition = { ...S1_DuplicateRequest, faults: [] };
    const targetAdapter = new MockTargetAdapter('mock');
    const controller = new AgentController(targetAdapter, {
      connectionConfig: {
        transportType: 'mock',
        // 'some_invented_fact' and 'delivery_received' are not on the allow-list.
        options: { lifecycleObservations: { request_payment: ['some_invented_fact', 'delivery_received'] } },
      },
      runId: 'run_deny',
    });
    const registry = new ExecutionRegistry();
    registry.register('buyer-1', controller);
    const context: RunContext = {
      runId: 'run_deny',
      scenarioId: scenario.id,
      seed: scenario.seed,
      startedAt: new Date(),
      status: RunStatus.CREATED,
    };
    const collector = new EvidenceCollector();
    const engine = new ScenarioEngine(scenario, context, registry, new FaultInjector([]), collector);
    await engine.execute();

    expect(collector.getByType('run_deny', 'some_invented_fact')).toHaveLength(0);
    expect(collector.getByType('run_deny', 'delivery_received')).toHaveLength(0);
    // Existing intent evidence still flows.
    expect(collector.getByType('run_deny', 'payment_intent_created')).toHaveLength(1);
  });

  it('L0-F2 boundary intact: lifecycle triggers never enter active fault dispatch', () => {
    // Canonical scenarios remain dispatch-valid.
    for (const scenario of [S1_DuplicateRequest, S2_PaymentBeforeExecution, S5_ConcurrentDuplicate]) {
      expect(validateFaultDispatch(scenario).valid).toBe(true);
    }

    // Even when a lifecycle-named event is emitted as evidence, FaultInjector
    // refuses to dispatch faults registered on non-action triggers.
    const injector = new FaultInjector([
      {
        target: { kind: 'participant', participantId: 'seller-1' },
        type: 'hang',
        trigger: 'payment_settled',
        config: { duration_ms: -1 },
      },
    ]);
    expect(injector.getFaultsForEvent('payment_settled', 'seller-1')).toHaveLength(0);
    expect(injector.getRespondersForEvent('payment_settled')).toHaveLength(0);
  });

  it('S1/S5 action-fault behavior is not regressed', async () => {
    const s1 = await runWithMock(S1_DuplicateRequest, {});
    expect(s1.verdict?.status).toBe('PASS');

    const s5 = await runWithMock(S5_ConcurrentDuplicate, {});
    expect(s5.verdict?.status).toBe('PASS');
  }, 20000);

  it('S8 boundary: signed retry stays engine evidence — never payment_settled', async () => {
    // A port that answers request_resource with PAYMENT_REQUIRED (x402 402)
    // and accepts the retried signed request. No settlement layer exists here.
    const pay402: PaymentRequired = {
      raw: 'cGF5bWVudC1yZXF1aXJlZA==',
      parsed: {
        x402Version: 2,
        resource: { url: 'http://mock/res-1' },
        accepts: [
          {
            scheme: 'exact',
            network: 'eip155:84532',
            amount: '100',
            asset: '0xasset',
            payTo: '0xpayto',
            maxTimeoutSeconds: 60,
          },
        ],
      },
      scheme: 'exact',
      network: 'eip155:84532',
      amount: '100',
      asset: '0xasset',
      payTo: '0xpayto',
      maxTimeoutSeconds: 60,
    };
    const port = {
      getId: () => 'port-1',
      getTargetType: () => 'mock-x402',
      connect: async () => ({ success: true, connectionId: 'c1' }),
      isConnected: () => true,
      send: async (_runId: string, type: string, payload?: unknown) => ({
        id: 'exch-1',
        runId: _runId,
        direction: 'outbound' as never,
        type,
        timestamp: Date.now(),
        payload: payload ?? {},
        status: ExchangeStatus.PAYMENT_REQUIRED,
        metadata: { paymentRequired: pay402 },
      }),
      sendWithSignature: async (_runId: string, type: string, payload?: unknown) => ({
        id: 'exch-2',
        runId: _runId,
        direction: 'outbound' as never,
        type,
        timestamp: Date.now(),
        payload: payload ?? {},
        status: ExchangeStatus.SUCCESS,
        metadata: {},
      }),
      receive: async () => {
        throw new Error('unused');
      },
      captureEvidence: async () => {
        throw new Error('unused');
      },
      disconnect: async () => {},
    };

    const controller = new AgentController(port as never, {
      connectionConfig: { transportType: 'mock' },
      runId: 'run_s8',
    });
    const registry = new ExecutionRegistry();
    registry.register('buyer-1', controller);
    const context: RunContext = {
      runId: 'run_s8',
      scenarioId: S8_X402Payment.id,
      seed: S8_X402Payment.seed,
      startedAt: new Date(),
      status: RunStatus.CREATED,
    };
    const collector = new EvidenceCollector();
    const engine = new ScenarioEngine(
      S8_X402Payment,
      context,
      registry,
      new FaultInjector([]),
      collector,
      async () => 'sig',
    );
    await engine.execute();

    // Existing S8 engine evidence intact...
    const signed = collector.getByType('run_s8', 'payment_signed_and_retried');
    expect(signed).toHaveLength(1);
    expect(signed[0].source).toBe('engine');
    // ...and NOT reinterpreted/derived as a settlement fact (§9).
    expect(collector.getByType('run_s8', 'payment_settled')).toHaveLength(0);
  });
});

/**
 * Minimal spy helper: records the first argument of each call to a method.
 * Avoids adding a mocking dependency.
 */
function vi_spy<T extends { [k: string]: any }>(obj: T, method: string): { calls: string[] } {
  const original = obj[method].bind(obj) as (...args: unknown[]) => unknown;
  const spy = { calls: [] as string[] };
  (obj as Record<string, unknown>)[method] = (...args: unknown[]) => {
    spy.calls.push(String(args[0]));
    return original(...args);
  };
  return spy;
}
