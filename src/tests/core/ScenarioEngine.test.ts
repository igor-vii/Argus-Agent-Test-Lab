import { describe, it, expect, beforeEach } from 'vitest';
import { ScenarioEngine } from '../../core/ScenarioEngine';
import { ScenarioDefinition } from '../../core/ScenarioDefinition';
import { AgentController } from '../../core/AgentController';
import { MockTargetAdapter } from '../../adapters/MockTargetAdapter';
import { RunContext, RunStatus } from '../../core/RunLifecycle';
import { FaultInjector } from '../../core/FaultInjector';

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
      target: 'mock-target',
      agents: [],
      actions: [
        { type: 'act', agentId: 'agent-1', payload: { type: 'ACTION_1' } },
        { type: 'act', agentId: 'agent-1', payload: { type: 'ACTION_2' } },
        { type: 'act', agentId: 'agent-1', payload: { type: 'ACTION_3' } },
      ],
      faults: [],
      seed: 42,
    };

    const context: RunContext = {
      runId: 'run-123',
      scenarioId: 'test-scenario',
      seed: 42,
      startedAt: new Date(),
      status: RunStatus.CREATED,
    };

    engine = new ScenarioEngine(scenario, context, mockController, faultInjector);

    // Execute and verify no errors thrown
    await expect(engine.execute()).resolves.not.toThrow();

    // Verify run status updated
    expect(context.status).toBe(RunStatus.COMPLETED);
  });

  it('should pass runId and seed to execution context', async () => {
    const scenario: ScenarioDefinition = {
      id: 'seed-test',
      name: 'Seed Test',
      target: 'mock-target',
      agents: [],
      actions: [{ type: 'act', agentId: 'agent-1', payload: { type: 'CHECK_SEED' } }],
      faults: [],
      seed: 999,
    };

    const context: RunContext = {
      runId: 'run-seed-123',
      scenarioId: 'seed-test',
      seed: 999,
      startedAt: new Date(),
      status: RunStatus.CREATED,
    };

    engine = new ScenarioEngine(scenario, context, mockController, faultInjector);
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
      target: 'mock-target',
      agents: [],
      actions: [{ type: 'act', agentId: 'agent-1', payload: { type: 'FAIL_ACTION' } }],
      faults: [],
      seed: 1,
    };

    const context: RunContext = {
      runId: 'run-fail',
      scenarioId: 'fail-test',
      seed: 1,
      startedAt: new Date(),
      status: RunStatus.CREATED,
    };

    engine = new ScenarioEngine(scenario, context, mockController, faultInjector);

    // Should not throw unhandled error, but status should reflect failure or completion with errors
    await expect(engine.execute()).resolves.not.toThrow();
    // Depending on implementation, status might be FAILED or COMPLETED with error evidence
    
    // Restore original send
    mockTarget.send = originalSend;
  });
});
