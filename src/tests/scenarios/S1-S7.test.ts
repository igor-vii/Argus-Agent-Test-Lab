import { describe, it, expect } from 'vitest';
import { RunOrchestrator } from '../../core/RunOrchestrator';
import { MockTargetAdapter } from '../../adapters/MockTargetAdapter';
import { AgentController } from '../../core/AgentController';
import { S1_DuplicateRequest } from '../../scenarios/S1_DuplicateRequest';
import { S2_PaymentBeforeExecution } from '../../scenarios/S2_PaymentBeforeExecution';
import { S3_CrashAfterSettlement } from '../../scenarios/S3_CrashAfterSettlement';
import { S4_SellerTimeout } from '../../scenarios/S4_SellerTimeout';
import { S5_ConcurrentDuplicate } from '../../scenarios/S5_ConcurrentDuplicate';
import { S6_PaymentRetry } from '../../scenarios/S6_PaymentRetry';
import { S7_LostDelivery } from '../../scenarios/S7_LostDelivery';

describe('Canonical Scenarios S1-S7', () => {
  const scenarios = [
    { id: 'S1', def: S1_DuplicateRequest },
    { id: 'S2', def: S2_PaymentBeforeExecution },
    { id: 'S3', def: S3_CrashAfterSettlement },
    { id: 'S4', def: S4_SellerTimeout },
    { id: 'S5', def: S5_ConcurrentDuplicate },
    { id: 'S6', def: S6_PaymentRetry },
    { id: 'S7', def: S7_LostDelivery },
  ];

  scenarios.forEach(({ id, def }) => {
    it(`${id} - should execute and produce evidence with verdict`, async () => {
      const targetAdapter = new MockTargetAdapter('mock');
      const controller = new AgentController(targetAdapter, {
        connectionConfig: { transportType: 'mock' },
        runId: `run_${Date.now()}`
      });
      
      const assertionsRaw = def.metadata?.assertions;
      let assertions: any[] | any;
      
      if (assertionsRaw && typeof assertionsRaw === 'object' && 'operator' in assertionsRaw) {
        assertions = assertionsRaw;
      } else if (Array.isArray(assertionsRaw)) {
        assertions = assertionsRaw;
      } else {
        assertions = [];
      }

      const orchestrator = new RunOrchestrator(def, controller, targetAdapter, assertions);
      const result = await orchestrator.run();

      expect(result.scenarioId).toBe(id);
      expect(result.evidenceCount).toBeGreaterThan(0);
      expect(result.verdict).toBeDefined();
      if (result.verdict) {
        expect(['PASS', 'FAIL', 'INCONCLUSIVE']).toContain(result.verdict.status);
      }
    });
  });

  it('S1 - should detect duplicate payment (FAIL expected)', async () => {
    const targetAdapter = new MockTargetAdapter('mock');
    const controller = new AgentController(targetAdapter, {
      connectionConfig: { transportType: 'mock' },
      runId: `run_${Date.now()}`
    });
    
    const assertionsRaw = S1_DuplicateRequest.metadata?.assertions;
    let assertions: any[] | any = assertionsRaw || [];

    const orchestrator = new RunOrchestrator(S1_DuplicateRequest, controller, targetAdapter, assertions);
    const result = await orchestrator.run();

    // S1 ожидает FAIL, так как MockTarget симулирует нарушение (дубликат)
    if (result.verdict) {
      expect(result.verdict.status).toBe('FAIL');
    }
  });

  it('S6 - should pass valid flow (PASS expected)', async () => {
    const targetAdapter = new MockTargetAdapter('mock');
    const controller = new AgentController(targetAdapter, {
      connectionConfig: { transportType: 'mock' },
      runId: `run_${Date.now()}`
    });
    
    const assertionsRaw = S6_PaymentRetry.metadata?.assertions;
    let assertions: any[] | any = assertionsRaw || [];

    const orchestrator = new RunOrchestrator(S6_PaymentRetry, controller, targetAdapter, assertions);
    const result = await orchestrator.run();

    // S6 ожидает PASS, так как это корректный сценарий
    if (result.verdict) {
      expect(result.verdict.status).toBe('PASS');
    }
  });
});
