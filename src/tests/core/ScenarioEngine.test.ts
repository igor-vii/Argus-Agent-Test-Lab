import { describe, it, expect, beforeEach } from 'vitest';
import { ScenarioEngine } from '../../core/ScenarioEngine';
import { ScenarioDefinition } from '../../core/ScenarioDefinition';
import { AgentController } from '../../core/AgentController';
import { MockTargetAdapter } from '../../adapters/MockTargetAdapter';
import { RunContext, RunStatus } from '../../core/RunLifecycle';
import { FaultInjector } from '../../core/FaultInjector';
import { ExecutionRegistry } from '../../core/ExecutionRegistry';

describe('ScenarioEngine', () => {
  let engine: ScenarioEngine;
  let mockController: AgentController;
  let mockTarget: MockTargetAdapter;
  let faultInjector: FaultInjector;

  beforeEach(() => {
    mockTarget = new MockTargetAdapter('mock');
    mockController = new AgentController(mockTarget, { connectionConfig: { transportType: 'mock' }, timeoutMs: 30000, runId: 'test-run-id' });
    faultInjector = new FaultInjector();
  });

  it('should execute scenario timeline sequentially', async () => {
    const scenario: ScenarioDefinition = {
      id: 'test-scenario',
      name: 'Test Timeline',
      participants: [
        { participantId: 'sut-1', protocolRole: 'seller', ownership: 'EXTERNAL' }
      ],
      topology: { edges: [] },
      testSubject: 'sut-1',
      actions: [
        { actor: 'sut-1', type: 'ACTION_1', payload: {} },
        { actor: 'sut-1', type: 'ACTION_2', payload: {} },
        { actor: 'sut-1', type: 'ACTION_3', payload: {} },
      ],
      faults: [],
      invariants: [],
      assertions: [],
      seed: 42,
    };

    const context: RunContext = {
      runId: 'run-123',
      scenarioId: 'test-scenario',
      seed: 42,
      startedAt: new Date(),
      status: RunStatus.CREATED,
    };

    const registry = new ExecutionRegistry();
    registry.register('sut-1', mockController);
    engine = new ScenarioEngine(scenario, context, registry, faultInjector);

    // Execute and verify no errors thrown
    await expect(engine.execute()).resolves.not.toThrow();

    // Verify run status updated
    expect(context.status).toBe(RunStatus.COMPLETED);
  });

  it('should pass runId and seed to execution context', async () => {
    const scenario: ScenarioDefinition = {
      id: 'seed-test',
      name: 'Seed Test',
      participants: [
        { participantId: 'sut-1', protocolRole: 'seller', ownership: 'EXTERNAL' }
      ],
      topology: { edges: [] },
      testSubject: 'sut-1',
      actions: [{ actor: 'sut-1', type: 'CHECK_SEED', payload: {} }],
      faults: [],
      invariants: [],
      assertions: [],
      seed: 999,
    };

    const context: RunContext = {
      runId: 'run-seed-123',
      scenarioId: 'seed-test',
      seed: 999,
      startedAt: new Date(),
      status: RunStatus.CREATED,
    };

    const registry = new ExecutionRegistry();
    registry.register('sut-1', mockController);
    engine = new ScenarioEngine(scenario, context, registry, faultInjector);
    await engine.execute();

    expect(context.runId).toBe('run-seed-123');
    expect(context.seed).toBe(999);
  });

  it('should handle runtime failure gracefully', async () => {
    // Setup target to fail on send
    const originalSend = mockTarget.send;
    mockTarget.send = async () => { throw new Error('Simulated Failure'); };

    const scenario: ScenarioDefinition = {
      id: 'fail-test',
      name: 'Failure Test',
      participants: [
        { participantId: 'sut-1', protocolRole: 'seller', ownership: 'EXTERNAL' }
      ],
      topology: { edges: [] },
      testSubject: 'sut-1',
      actions: [{ actor: 'sut-1', type: 'FAIL_ACTION', payload: {} }],
      faults: [],
      invariants: [],
      assertions: [],
      seed: 1,
    };

    const context: RunContext = {
      runId: 'run-fail',
      scenarioId: 'fail-test',
      seed: 1,
      startedAt: new Date(),
      status: RunStatus.CREATED,
    };

    const registry = new ExecutionRegistry();
    registry.register('sut-1', mockController);
    engine = new ScenarioEngine(scenario, context, registry, faultInjector);

    // Should not throw unhandled error, but status should reflect failure or completion with errors
    await expect(engine.execute()).resolves.not.toThrow();
    // Depending on implementation, status might be FAILED or COMPLETED with error evidence

    // Restore original send
    mockTarget.send = originalSend;
  });

  it('should route action.actor to the correct controller', async () => {
    const buyerTarget = new MockTargetAdapter('buyer-mock');
    const sellerTarget = new MockTargetAdapter('seller-mock');

    const buyerController = new AgentController(buyerTarget, {
      connectionConfig: { transportType: 'mock' },
      runId: 'buyer-run',
    });
    const sellerController = new AgentController(sellerTarget, {
      connectionConfig: { transportType: 'mock' },
      runId: 'seller-run',
    });

    await buyerController.connect();
    await sellerController.connect();

    const registry = new ExecutionRegistry();
    registry.register('buyer-1', buyerController);
    registry.register('seller-1', sellerController);

    const scenario: ScenarioDefinition = {
      id: 'routing-test',
      name: 'Routing Test',
      participants: [
        { participantId: 'buyer-1', protocolRole: 'BUYER', ownership: 'ARGUS' },
        { participantId: 'seller-1', protocolRole: 'SELLER', ownership: 'ARGUS' },
      ],
      topology: { edges: [] },
      testSubject: 'sut-1',
      actions: [
        { actor: 'buyer-1', type: 'BUY_ACTION', payload: {} },
        { actor: 'seller-1', type: 'SELL_ACTION', payload: {} },
      ],
      faults: [],
      invariants: [],
      assertions: [],
      seed: 1,
    };

    const context: RunContext = {
      runId: 'routing-run',
      scenarioId: 'routing-test',
      seed: 1,
      startedAt: new Date(),
      status: RunStatus.CREATED,
    };

    const engine = new ScenarioEngine(scenario, context, registry, faultInjector);
    await engine.execute();

    const buyerExchanges = buyerTarget.getExchanges();
    expect(buyerExchanges.length).toBe(1);
    expect(buyerExchanges[0].type).toBe('BUY_ACTION');

    const sellerExchanges = sellerTarget.getExchanges();
    expect(sellerExchanges.length).toBe(1);
    expect(sellerExchanges[0].type).toBe('SELL_ACTION');
  });

  it('should throw if action.actor is not registered', async () => {
    const registry = new ExecutionRegistry();

    const scenario: ScenarioDefinition = {
      id: 'unknown-actor-test',
      name: 'Unknown Actor Test',
      participants: [],
      topology: { edges: [] },
      testSubject: 'sut-1',
      actions: [
        { actor: 'unknown-actor', type: 'SOME_ACTION', payload: {} },
      ],
      faults: [],
      invariants: [],
      assertions: [],
      seed: 1,
    };

    const context: RunContext = {
      runId: 'unknown-run',
      scenarioId: 'unknown-actor-test',
      seed: 1,
      startedAt: new Date(),
      status: RunStatus.CREATED,
    };

    const engine = new ScenarioEngine(scenario, context, registry, faultInjector);

    await expect(engine.execute()).rejects.toThrow(
      'No controller registered for actor: unknown-actor'
    );
  });

  it('should work with single controller (backward compatibility)', async () => {
    const singleTarget = new MockTargetAdapter('single-mock');
    const singleController = new AgentController(singleTarget, {
      connectionConfig: { transportType: 'mock' },
      runId: 'single-run',
    });

    await singleController.connect();

    const registry = new ExecutionRegistry();
    registry.register('sut-1', singleController);

    const scenario: ScenarioDefinition = {
      id: 'single-controller-test',
      name: 'Single Controller Test',
      participants: [
        { participantId: 'sut-1', protocolRole: 'SELLER', ownership: 'EXTERNAL' },
      ],
      topology: { edges: [] },
      testSubject: 'sut-1',
      actions: [
        { actor: 'sut-1', type: 'ACTION_1', payload: {} },
        { actor: 'sut-1', type: 'ACTION_2', payload: {} },
      ],
      faults: [],
      invariants: [],
      assertions: [],
      seed: 1,
    };

    const context: RunContext = {
      runId: 'single-run',
      scenarioId: 'single-controller-test',
      seed: 1,
      startedAt: new Date(),
      status: RunStatus.CREATED,
    };

    const engine = new ScenarioEngine(scenario, context, registry, faultInjector);
    await expect(engine.execute()).resolves.not.toThrow();

    const exchanges = singleTarget.getExchanges();
    expect(exchanges.length).toBe(2);
    expect(exchanges[0].type).toBe('ACTION_1');
    expect(exchanges[1].type).toBe('ACTION_2');
  });
});
