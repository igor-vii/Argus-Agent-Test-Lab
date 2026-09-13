import { describe, it, expect, beforeEach } from 'vitest';
import { FaultInjector } from '../../core/FaultInjector';
import { ScenarioFault } from '../../core/ScenarioDefinition';

describe('FaultInjector', () => {
  let injector: FaultInjector;

  beforeEach(() => {
    injector = new FaultInjector();
  });

  it('duplicate_request should call operation twice', async () => {
    let callCount = 0;
    const operation = async () => { callCount++; return 'result'; };
    const fault: ScenarioFault = { type: 'duplicate_request', config: { repeat_count: 2 } };

    await injector.apply(fault, operation);

    expect(callCount).toBe(2);
  });

  it('delayed_payment should add delay', async () => {
    const start = Date.now();
    const operation = async () => 'result';
    const fault: ScenarioFault = { type: 'delayed_payment', config: { delay_ms: 100 } };

    await injector.apply(fault, operation);

    const duration = Date.now() - start;
    expect(duration).toBeGreaterThanOrEqual(90); // Allow small margin
  });

  it('crash_after_payment should throw error', async () => {
    const operation = async () => 'result';
    const fault: ScenarioFault = { type: 'crash_after_payment' };

    await expect(injector.apply(fault, operation))
      .rejects.toThrow('Simulated crash after payment');
  });

  it('concurrent_request should execute in parallel', async () => {
    const operation = async () => {
      await new Promise(r => setTimeout(r, 50));
      return 'result';
    };
    const fault: ScenarioFault = { type: 'concurrent_request', config: { parallel_count: 3 } };
    const start = Date.now();

    await injector.apply(fault, operation);

    const duration = Date.now() - start;
    // If sequential: 150ms. If parallel: ~50ms.
    expect(duration).toBeLessThan(100);
  });

  it('lost_delivery should throw error for lost response', async () => {
    const operation = async () => ({ status: 'OK' });
    // Use 100% drop probability to ensure loss
    const fault: ScenarioFault = { type: 'lost_delivery', config: { drop_probability: 1.0 } };

    await expect(injector.apply(fault, operation))
      .rejects.toThrow('Delivery lost in transit');
  });
});
