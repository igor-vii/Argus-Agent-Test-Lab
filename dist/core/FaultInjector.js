import { isActionTrigger, isBaselineResponder } from './Fault';
/**
 * Fault dispatch contract, L0-F2:
 * 1. Only action_<type> events enter active fault dispatch.
 * 2. Active dispatch supports participant targets only.
 * 3. A participant target must equal the current action actor.
 * 4. Lifecycle events are evidence-only; no recursive dispatch.
 * 5. Edge/infrastructure targets are declared-only.
 *
 * respond is a compatibility baseline behavior, not an active fault.
 */
export class FaultInjector {
    faults = new Map();
    constructor(faults = []) {
        for (const fault of faults) {
            this.registerFault(fault);
        }
    }
    registerFault(fault) {
        const key = fault.trigger;
        const existing = this.faults.get(key) ?? [];
        existing.push(fault);
        this.faults.set(key, existing);
    }
    /**
     * Return runtime-applicable faults for an action.
     *
     * actorId is mandatory so target/actor cannot silently diverge.
     * Lifecycle triggers, edge/infrastructure targets, and target mismatches
     * are excluded from active dispatch.
     */
    getFaultsForEvent(eventType, actorId) {
        if (!isActionTrigger(eventType)) {
            return [];
        }
        return (this.faults.get(eventType) ?? []).filter((fault) => {
            if (isBaselineResponder(fault)) {
                return false;
            }
            return (fault.target.kind === 'participant' &&
                fault.target.participantId === actorId);
        });
    }
    /**
     * Compatibility path for S7's baseline seller response.
     *
     * This is deliberately NOT recursive fault dispatch and is not used for
     * lifecycle-triggered fault lookup. It exists only because respond
     * describes normal participant behavior rather than a fault.
     */
    getRespondersForEvent(eventType) {
        if (!isActionTrigger(eventType)) {
            return [];
        }
        return (this.faults.get(eventType) ?? []).filter(isBaselineResponder);
    }
    async apply(fault, operation, emit) {
        const source = fault.target.kind === 'participant'
            ? fault.target.participantId
            : null;
        switch (fault.type) {
            case 'duplicate_request':
                return this.handleDuplicateRequest(operation, fault.config);
            case 'delayed_response':
                return this.handleDelayedResponse(operation, fault.config, source, emit);
            case 'crash':
                return this.handleCrash(operation);
            case 'hang':
                return this.handleHang(operation, fault.config, source, emit);
            case 'concurrent_request':
                return this.handleConcurrentRequest(operation, fault.config);
            case 'retry':
                return this.handleRetry(operation, fault.config);
            case 'lost_delivery':
                return this.handleLostDelivery(operation, fault.config);
            case 'respond':
                return this.handleRespond(operation, fault.config, source, emit);
            default:
                return operation();
        }
    }
    async handleDuplicateRequest(operation, config) {
        const repeatCount = config?.['repeat_count'] || 2;
        let result;
        for (let i = 0; i < repeatCount; i++)
            result = await operation();
        return result;
    }
    async handleDelayedResponse(operation, config, source, emit) {
        const delayMs = config?.['delay_ms'] || 5000;
        if (emit && source) {
            emit({ source, type: 'delivery_started', data: {}, timestamp: Date.now() });
        }
        await this.sleep(delayMs);
        if (emit && source) {
            emit({ source, type: 'delivery_completed', data: {}, timestamp: Date.now() });
        }
        return operation();
    }
    async handleCrash(operation) {
        await operation();
        throw new Error('Simulated crash');
    }
    async handleHang(operation, config, source, emit) {
        const durationMs = config?.['duration_ms'] || -1;
        if (emit && source) {
            emit({ source, type: 'delivery_started', data: {}, timestamp: Date.now() });
        }
        if (durationMs < 0)
            return new Promise(() => { });
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Hang timeout')), durationMs);
            operation().then(result => {
                clearTimeout(timer);
                resolve(result);
            }).catch(reject);
        });
    }
    async handleConcurrentRequest(operation, config) {
        const parallelCount = config?.['parallel_count'] || 5;
        const results = await Promise.all(Array.from({ length: parallelCount }, () => operation()));
        return results[0];
    }
    async handleRetry(operation, config) {
        const retryCount = config?.['retry_count'] || 3;
        let lastError;
        for (let i = 0; i < retryCount; i++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
            }
        }
        throw lastError || new Error('All retries failed');
    }
    async handleLostDelivery(operation, config) {
        const dropProbability = config?.['drop_probability'] || 1.0;
        const result = await operation();
        if (Math.random() < dropProbability) {
            throw new Error('Delivery lost in transit');
        }
        return result;
    }
    async handleRespond(operation, config, source, emit) {
        if (emit && source) {
            const emitType = config?.['emit'];
            if (emitType) {
                emit({ source, type: emitType, data: {}, timestamp: Date.now() });
            }
        }
        return operation();
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
//# sourceMappingURL=FaultInjector.js.map