import { describe, it, expect, beforeEach } from 'vitest';
import { EvidenceCollector, EvidenceSource } from '../../core/EvidenceCollector';
describe('EvidenceCollector', () => {
    let collector;
    beforeEach(() => {
        collector = new EvidenceCollector();
    });
    it('should preserve all evidence fields', () => {
        const record = collector.collect('payment_sent', EvidenceSource.AGENT, { amount: 100 }, 'run-123', 'Payment sent by agent');
        expect(record.runId).toBe('run-123');
        expect(record.type).toBe('payment_sent');
        expect(record.source).toBe(EvidenceSource.AGENT);
        expect(record.data).toEqual({ amount: 100 });
        expect(record.sequence).toBe(1);
    });
    it('should preserve conflicting sources', () => {
        collector.collect('delivery_completed', EvidenceSource.AGENT, {}, 'run-123');
        collector.collect('timeout', EvidenceSource.ADAPTER, {}, 'run-123');
        collector.collect('response_sent', EvidenceSource.TARGET, {}, 'run-123');
        const evidence = collector.getEvidenceSet();
        expect(evidence.length).toBe(3);
        // Ensure no deduplication happened
        const sources = evidence.map(e => e.source);
        expect(sources).toContain(EvidenceSource.AGENT);
        expect(sources).toContain(EvidenceSource.ADAPTER);
        expect(sources).toContain(EvidenceSource.TARGET);
    });
    it('sequence should reflect observation order, not causality', () => {
        collector.collect('A', EvidenceSource.SYSTEM, {}, 'run-123');
        collector.collect('B', EvidenceSource.SYSTEM, {}, 'run-123');
        collector.collect('C', EvidenceSource.SYSTEM, {}, 'run-123');
        const evidence = collector.getEvidenceSet();
        expect(evidence[0].sequence).toBe(1);
        expect(evidence[1].sequence).toBe(2);
        expect(evidence[2].sequence).toBe(3);
        // Sequence is just order of collection, no causal claim made
    });
    it('should allow metadata for concurrency reservation', () => {
        collector.collect('parallel_event', EvidenceSource.ENGINE, {}, 'run-123', undefined, { concurrentWith: ['event-b'] });
        const evidence = collector.getEvidenceSet();
        expect(evidence[0].metadata).toBeDefined();
        expect(evidence[0].metadata?.concurrentWith).toEqual(['event-b']);
    });
    it('should NOT calculate verdict', () => {
        // Collector only stores data
        const result = collector.collect('test', EvidenceSource.SYSTEM, {}, 'run-123');
        // Result is just the record, no PASS/FAIL logic inside collector
        expect(result).toHaveProperty('evidenceId');
        expect(result).not.toHaveProperty('verdict');
    });
});
//# sourceMappingURL=EvidenceCollector.test.js.map