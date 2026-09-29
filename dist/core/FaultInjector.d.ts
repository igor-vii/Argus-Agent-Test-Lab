import { Fault } from './Fault';
import { Observation } from './Evidence';
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
export declare class FaultInjector {
    private faults;
    constructor(faults?: Fault[]);
    registerFault(fault: Fault): void;
    /**
     * Return runtime-applicable faults for an action.
     *
     * actorId is mandatory so target/actor cannot silently diverge.
     * Lifecycle triggers, edge/infrastructure targets, and target mismatches
     * are excluded from active dispatch.
     */
    getFaultsForEvent(eventType: string, actorId: string): Fault[];
    /**
     * Compatibility path for S7's baseline seller response.
     *
     * This is deliberately NOT recursive fault dispatch and is not used for
     * lifecycle-triggered fault lookup. It exists only because respond
     * describes normal participant behavior rather than a fault.
     */
    getRespondersForEvent(eventType: string): Fault[];
    apply<T>(fault: Fault, operation: () => Promise<T>, emit?: (observation: Observation) => void): Promise<T>;
    private handleDuplicateRequest;
    private handleDelayedResponse;
    private handleCrash;
    private handleHang;
    private handleConcurrentRequest;
    private handleRetry;
    private handleLostDelivery;
    private handleRespond;
    private sleep;
}
//# sourceMappingURL=FaultInjector.d.ts.map