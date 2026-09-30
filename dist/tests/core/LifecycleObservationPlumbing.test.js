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
import { RunStatus } from '../../core/RunLifecycle';
import { AgentController } from '../../core/AgentController';
import { MockTargetAdapter, MOCK_LIFECYCLE_OBSERVATION_TYPES, } from '../../adapters/MockTargetAdapter';
import { validateFaultDispatch } from '../../core/validateScenario';
import { ExchangeStatus } from '../../core/AgentTargetPort';
import { S1_DuplicateRequest } from '../../scenarios/S1_DuplicateRequest';
import { S2_PaymentBeforeExecution } from '../../scenarios/S2_PaymentBeforeExecution';
import { S5_ConcurrentDuplicate } from '../../scenarios/S5_ConcurrentDuplicate';
import { S8_X402Payment } from '../../scenarios/S8_X402Payment';
/**
 * Engine-level harness: connects the controller BEFORE running the engine.
 * (RunOrchestrator owns connect/disconnect in production runs; here we drive
 * ScenarioEngine directly so tests can inspect the EvidenceCollector.)
 */
async function runEngine(scenario, lifecycleObservations, runId, opts) {
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
    registry.register(opts?.actor ?? 'client-1', controller);
    // R3 multi-actor harness: if the scenario contains actions from other
    // ARGUS-owned actors (e.g. resource-server-1 'deliver' in S2/S4), register a
    // per-participant connected controller for each of them, mirroring what
    // RunOrchestrator does in production. The primary actor keeps opts.actor's
    // controller above.
    for (const p of scenario.participants) {
        if (p.ownership !== 'ARGUS')
            continue;
        if (registry.get(p.participantId))
            continue;
        const extra = new AgentController(new MockTargetAdapter('mock'), {
            connectionConfig: { transportType: 'mock', options: { lifecycleObservations } },
            runId,
        });
        extra.setParticipantId(p.participantId);
        await extra.connect();
        registry.register(p.participantId, extra);
    }
    const context = {
        runId,
        scenarioId: scenario.id,
        seed: scenario.seed,
        startedAt: new Date(),
        status: RunStatus.CREATED,
    };
    const collector = new EvidenceCollector();
    const faultInjector = new FaultInjector(opts?.faults ?? []);
    const getFaultsSpy = vi_spy(faultInjector, 'getFaultsForEvent');
    const engine = new ScenarioEngine(scenario, context, registry, faultInjector, collector, opts?.paymentResolver);
    await engine.execute();
    // Plumbing never routes lifecycle observations through FaultInjector:
    // lookup happened only for action_* triggers (one per scenario action).
    expect(getFaultsSpy.calls).toEqual(scenario.actions.map((a) => `action_${a.type}`));
    return { collector, spy: getFaultsSpy };
}
function runWithMock(scenario, lifecycleObservations) {
    const targetAdapter = new MockTargetAdapter('mock');
    const controller = new AgentController(targetAdapter, {
        connectionConfig: {
            transportType: 'mock',
            options: { lifecycleObservations },
        },
        runId: `run_${Date.now()}`,
    });
    const controllers = new Map();
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
        expect(result.verdict?.reason).toContain('success not observed yet — still pending, expected');
    }, 20000);
    it('evidence record keeps exact lifecycle identity through EvidenceCollector', async () => {
        // Legitimate per §5.1: the simulated Sut (FACILITATOR sut-1) reports its
        // own settlement state on request_payment. The first action's actor is used
        // and no faults are injected: S2's canonical delayed_response now fires on
        // the second action ('deliver', R3 seller-action) and would stall the run.
        // Coexistence of observations with action-fault dispatch is proven by the
        // S1/S5 regression test below instead.
        const { collector, spy } = await runEngine(S2_PaymentBeforeExecution, { request_payment: ['payment_settled'] }, 'run_identity', 
        // faults: [] — the canonical delayed_response now fires on action_deliver
        // (5s) and would stall this engine-level identity run; coexistence with
        // action-fault dispatch is proven in S2-S4-SellerAction.test.ts.
        { faults: [] });
        const records = collector.getByType('run_identity', 'payment_settled');
        expect(records).toHaveLength(1);
        expect(records[0].type).toBe('payment_settled'); // identity survives unchanged
        expect(records[0].source).toBe('sut-1'); // testSubject association preserved
        // Lifecycle observation did NOT enter FaultInjector dispatch: lookup
        // happened only for action_* triggers (L0-F2 boundary). The canonical S2
        // delayed_response fault fires on the second action ('deliver', R3
        // seller-action), so this run uses faults: [] to isolate observations.
        expect(spy.calls).toEqual(['action_request_payment', 'action_deliver']);
    });
    it('settlement_unknown enters evidence as its own identity and never becomes failure/success', async () => {
        // Direct collector inspection: settlement layer reports UNKNOWN explicitly.
        const { collector } = await runEngine({ ...S1_DuplicateRequest, faults: [] }, { request_payment: ['settlement_unknown'] }, 'run_unknown');
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
        const { collector } = await runEngine({ ...S1_DuplicateRequest, faults: [] }, 
        // 'some_invented_fact' and 'delivery_received' are not on the allow-list.
        { request_payment: ['some_invented_fact', 'delivery_received'] }, 'run_deny');
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
                target: { kind: 'participant', participantId: 'resource-server-1' },
                type: 'hang',
                trigger: 'payment_settled',
                config: { duration_ms: -1 },
            },
        ]);
        expect(injector.getFaultsForEvent('payment_settled', 'resource-server-1')).toHaveLength(0);
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
        const pay402 = {
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
            connect: async (_config) => ({ success: true, connectionId: 'c1' }),
            isConnected: () => true,
            send: async (_runId, type, payload) => ({
                id: 'exch-1',
                runId: _runId,
                direction: 'outbound',
                type,
                timestamp: Date.now(),
                payload: payload ?? {},
                status: ExchangeStatus.PAYMENT_REQUIRED,
                // Canonical location of the parsed 402 (AgentTargetPort.Exchange):
                // X402AgentAdapter sets exchange.paymentRequired — not metadata.
                paymentRequired: pay402,
                metadata: {},
            }),
            sendWithSignature: async (_runId, type, payload) => ({
                id: 'exch-2',
                runId: _runId,
                direction: 'outbound',
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
            disconnect: async () => { },
        };
        const controller = new AgentController(port, {
            connectionConfig: { transportType: 'mock' },
            runId: 'run_s8',
        });
        await controller.connect(); // RunOrchestrator owns connect in production runs
        const registry = new ExecutionRegistry();
        registry.register('client-1', controller);
        const context = {
            runId: 'run_s8',
            scenarioId: S8_X402Payment.id,
            seed: S8_X402Payment.seed,
            startedAt: new Date(),
            status: RunStatus.CREATED,
        };
        const collector = new EvidenceCollector();
        const engine = new ScenarioEngine(S8_X402Payment, context, registry, new FaultInjector([]), collector, async () => 'sig');
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
function vi_spy(obj, method) {
    const original = obj[method].bind(obj);
    const spy = { calls: [] };
    obj[method] = (...args) => {
        spy.calls.push(String(args[0]));
        return original(...args);
    };
    return spy;
}
//# sourceMappingURL=LifecycleObservationPlumbing.test.js.map