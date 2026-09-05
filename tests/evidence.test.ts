import { EvidenceCollector } from '../src/evidence';

describe('Evidence Collection', () => {
  let collector: EvidenceCollector;

  beforeEach(() => {
    collector = new EvidenceCollector('run-123');
  });

  it('should record an event', () => {
    collector.record({
      timestamp: Date.now(),
      actor: 'buyer-1',
      eventType: 'request.created',
      data: { requestId: 'req-1' }
    });

    const evidence = collector.buildEvidence();
    expect(evidence.events.length).toBe(1);
    expect(evidence.events[0].actor).toBe('buyer-1');
  });

  it('should build evidence summary', () => {
    collector.record({
      timestamp: 1000,
      actor: 'buyer-1',
      eventType: 'request.created',
      data: {}
    });

    collector.record({
      timestamp: 2000,
      actor: 'seller-1',
      eventType: 'execution.completed',
      data: {}
    });

    const evidence = collector.buildEvidence();
    expect(evidence.runId).toBe('run-123');
    expect(evidence.summary.totalEvents).toBe(2);
    expect(evidence.summary.actorsInvolved).toContain('buyer-1');
    expect(evidence.summary.actorsInvolved).toContain('seller-1');
  });

  it('should track payment and operation references', () => {
    collector.record({
      timestamp: Date.now(),
      actor: 'buyer-1',
      eventType: 'payment.submitted',
      paymentId: 'pay-1',
      operationId: 'op-1',
      data: {}
    });

    const evidence = collector.buildEvidence();
    expect(evidence.events[0].paymentId).toBe('pay-1');
    expect(evidence.events[0].operationId).toBe('op-1');
  });
});
