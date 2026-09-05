import { FaultInjector } from '../src/fault';
import { FaultDefinition } from '../src/fault/types';

describe('Fault Injection', () => {
  let injector: FaultInjector;

  beforeEach(() => {
    injector = new FaultInjector();
  });

  it('should register a fault', () => {
    const fault: FaultDefinition = {
      id: 'fault-1',
      type: 'duplicate_request',
      params: { count: 2 },
      trigger: { event: 'request.created' }
    };

    injector.registerFault(fault);
    expect(injector.getRegisteredFaults().length).toBe(1);
  });

  it('should emit an event and apply fault', async () => {
    const fault: FaultDefinition = {
      id: 'fault-1',
      type: 'delayed_payment',
      params: { delayMs: 1000 },
      trigger: { event: 'payment.submitted' }
    };

    injector.registerFault(fault);

    const results = await injector.emitEvent({
      type: 'payment.submitted',
      data: { paymentId: 'pay-1' },
      timestamp: Date.now()
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].applied).toBe(true);
  });

  it('should check if fault should be injected', () => {
    const fault: FaultDefinition = {
      id: 'fault-1',
      type: 'crash_after_payment',
      params: {},
      trigger: { event: 'payment.settled' }
    };

    injector.registerFault(fault);

    expect(injector.shouldInjectFault('payment.settled')).toBe(true);
    expect(injector.shouldInjectFault('unknown.event')).toBe(false);
  });

  it('should clear all faults', () => {
    const fault: FaultDefinition = {
      id: 'fault-1',
      type: 'duplicate_request',
      params: {}
    };

    injector.registerFault(fault);
    expect(injector.getRegisteredFaults().length).toBe(1);

    injector.clear();
    expect(injector.getRegisteredFaults().length).toBe(0);
  });
});
