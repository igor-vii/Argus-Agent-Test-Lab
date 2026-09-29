import { describe, expect, it } from 'vitest';
import { validateFaultDispatch } from '../../core/validateScenario';
import { S1_DuplicateRequest } from '../../scenarios/S1_DuplicateRequest';
import { S2_PaymentBeforeExecution } from '../../scenarios/S2_PaymentBeforeExecution';
import { S3_CrashAfterSettlement } from '../../scenarios/S3_CrashAfterSettlement';
import { S4_SellerTimeout } from '../../scenarios/S4_SellerTimeout';
import { S5_ConcurrentDuplicate } from '../../scenarios/S5_ConcurrentDuplicate';
import { S6_PaymentRetry } from '../../scenarios/S6_PaymentRetry';
import { S7_LostDelivery } from '../../scenarios/S7_LostDelivery';
import { ScenarioDefinition } from '../../core/ScenarioDefinition';

describe('L0-F2 fault dispatch contract', () => {
  it('accepts S1/S5 active action faults and treats lifecycle faults as declared-only', () => {
    for (const scenario of [
      S1_DuplicateRequest,
      S2_PaymentBeforeExecution,
      S3_CrashAfterSettlement,
      S4_SellerTimeout,
      S5_ConcurrentDuplicate,
      S6_PaymentRetry,
      S7_LostDelivery,
    ]) {
      const result = validateFaultDispatch(scenario);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
  });

  it('rejects an active participant fault whose target differs from action actor', () => {
    const scenario: ScenarioDefinition = {
      ...S1_DuplicateRequest,
      faults: [{
        target: { kind: 'participant', participantId: 'seller-1' },
        type: 'duplicate_request',
        trigger: 'action_request_payment',
        config: {},
      }],
    };

    const result = validateFaultDispatch(scenario);
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.rule).toBe('L0-F2: target equals actor');
  });

  it('rejects edge targets on active action-triggered faults', () => {
    const scenario: ScenarioDefinition = {
      ...S1_DuplicateRequest,
      faults: [{
        target: { kind: 'edge', from: 'seller-1', to: 'sut-1' },
        type: 'lost_delivery',
        trigger: 'action_request_payment',
        config: {},
      }],
    };

    const result = validateFaultDispatch(scenario);
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.rule).toBe('L0-F2: active fault target');
  });
});
