import { describe, it, expect, beforeEach } from 'vitest';
import { FaultInjector } from '../../core/FaultInjector';
describe('FaultInjector', () => {
    let injector;
    beforeEach(() => {
        injector = new FaultInjector();
    });
    it('duplicate_request should call operation twice', async () => {
        let callCount = 0;
        const operation = async () => { callCount++; return 'result'; };
        const fault = {
            target: { kind: 'participant', participantId: 'test' },
            trigger: 'action_test',
            type: 'duplicate_request',
            config: { repeat_count: 2 }
        };
        await injector.apply(fault, operation);
        expect(callCount).toBe(2);
    });
    it('delayed_response should add delay', async () => {
        const start = Date.now();
        const operation = async () => 'result';
        const fault = {
            target: { kind: 'participant', participantId: 'test' },
            trigger: 'action_test',
            type: 'delayed_response',
            config: { delay_ms: 100 }
        };
        await injector.apply(fault, operation);
        const duration = Date.now() - start;
        expect(duration).toBeGreaterThanOrEqual(90); // Allow small margin
    });
    it('crash should throw error', async () => {
        const operation = async () => 'result';
        const fault = {
            target: { kind: 'participant', participantId: 'test' },
            trigger: 'action_test',
            type: 'crash',
            config: {}
        };
        await expect(injector.apply(fault, operation))
            .rejects.toThrow('Simulated crash');
    });
    it('concurrent_request should execute in parallel', async () => {
        const operation = async () => {
            await new Promise(r => setTimeout(r, 50));
            return 'result';
        };
        const fault = {
            target: { kind: 'participant', participantId: 'test' },
            trigger: 'action_test',
            type: 'concurrent_request',
            config: { parallel_count: 3 }
        };
        const start = Date.now();
        await injector.apply(fault, operation);
        const duration = Date.now() - start;
        // If sequential: 150ms. If parallel: ~50ms.
        expect(duration).toBeLessThan(100);
    });
    it('lost_delivery should throw error for lost response', async () => {
        const operation = async () => ({ status: 'OK' });
        // Use 100% drop probability to ensure loss
        const fault = {
            target: { kind: 'participant', participantId: 'test' },
            trigger: 'action_test',
            type: 'lost_delivery',
            config: { drop_probability: 1.0 }
        };
        await expect(injector.apply(fault, operation))
            .rejects.toThrow('Delivery lost in transit');
    });
});
//# sourceMappingURL=FaultInjector.test.js.map