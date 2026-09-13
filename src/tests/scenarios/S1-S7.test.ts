import { describe, it, expect } from 'vitest';
import { RunOrchestrator } from '../../core/RunOrchestrator';
import { MockTargetAdapter } from '../../adapters/MockTargetAdapter';
import * as S1 from '../../scenarios/S1_DuplicateRequest';
import * as S2 from '../../scenarios/S2_PaymentBeforeExecution';
import * as S3 from '../../scenarios/S3_CrashAfterSettlement';
import * as S4 from '../../scenarios/S4_SellerTimeout';
import * as S5 from '../../scenarios/S5_ConcurrentDuplicate';
import * as S6 from '../../scenarios/S6_PaymentRetry';
import * as S7 from '../../scenarios/S7_LostDelivery';

describe('Canonical Scenarios S1-S7', () => {
  const scenarios = [
    { id: 'S1', def: S1.default },
    { id: 'S2', def: S2.default },
    { id: 'S3', def: S3.default },
    { id: 'S4', def: S4.default },
    { id: 'S5', def: S5.default },
    { id: 'S6', def: S6.default },
    { id: 'S7', def: S7.default },
  ];

  scenarios.forEach(({ id, def }) => {
    it(`${id} - should execute and produce evidence with verdict`, async () => {
      const orchestrator = new RunOrchestrator(new MockTargetAdapter());
      const result = await orchestrator.run(def);

      expect(result.scenarioId).toBe(id);
      expect(result.evidence.length).toBeGreaterThan(0);
      expect(['PASS', 'FAIL', 'INCONCLUSIVE']).toContain(result.verdict.status);
    });
  });

  it('S1 - should detect duplicate payment (FAIL expected)', async () => {
    const orchestrator = new RunOrchestrator(new MockTargetAdapter());
    const result = await orchestrator.run(S1.default);
    
    // S1 ожидает FAIL, так как MockTarget симулирует нарушение (дубликат)
    expect(result.verdict.status).toBe('FAIL');
  });

  it('S6 - should pass valid flow (PASS expected)', async () => {
    const orchestrator = new RunOrchestrator(new MockTargetAdapter());
    const result = await orchestrator.run(S6.default);
    
    // S6 ожидает PASS, так как это корректный сценарий
    expect(result.verdict.status).toBe('PASS');
  });
});
