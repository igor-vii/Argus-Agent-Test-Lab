"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FaultInjector = void 0;
/**
 * Event-based Fault Injection Engine
 *
 * Faults are triggered by events, not just time-based delays.
 * This allows precise control over when faults are injected.
 */
class FaultInjector {
    constructor() {
        this.pendingFaults = new Map();
        this.eventHandlers = new Map();
    }
    /**
     * Register a fault for injection
     */
    registerFault(fault) {
        this.pendingFaults.set(fault.id, fault);
        // Register event handler if trigger is defined
        if (fault.trigger) {
            this.registerTrigger(fault.trigger, fault);
        }
    }
    /**
     * Unregister a fault
     */
    unregisterFault(faultId) {
        this.pendingFaults.delete(faultId);
    }
    /**
     * Emit an event that may trigger faults
     */
    async emitEvent(event) {
        const results = [];
        const handlers = this.eventHandlers.get(event.type) || [];
        for (const handler of handlers) {
            try {
                await handler(event);
                results.push({
                    faultId: event.faultId || 'unknown',
                    applied: true,
                    timestamp: Date.now(),
                    effect: event.data
                });
            }
            catch (error) {
                results.push({
                    faultId: event.faultId || 'unknown',
                    applied: false,
                    timestamp: Date.now(),
                    effect: { error: String(error) }
                });
            }
        }
        return results;
    }
    /**
     * Check if a fault should be applied for a given event
     */
    shouldInjectFault(eventType, faultType) {
        if (!faultType) {
            return this.eventHandlers.has(eventType);
        }
        const handlers = this.eventHandlers.get(eventType) || [];
        return handlers.length > 0;
    }
    /**
     * Get all registered faults
     */
    getRegisteredFaults() {
        return Array.from(this.pendingFaults.values());
    }
    /**
     * Clear all registered faults
     */
    clear() {
        this.pendingFaults.clear();
        this.eventHandlers.clear();
    }
    /**
     * Register a trigger for a fault
     */
    registerTrigger(trigger, fault) {
        const eventType = trigger.event;
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        const handlers = this.eventHandlers.get(eventType);
        handlers.push(async (event) => {
            // Apply fault logic based on type
            await this.applyFault(fault, event);
        });
    }
    /**
     * Apply a fault based on its type
     */
    async applyFault(fault, event) {
        // Fault application logic is handled by the ScenarioEngine
        // This is a hook for custom fault behavior
        event.faultId = fault.id;
        event.data = { ...event.data, ...fault.params };
    }
}
exports.FaultInjector = FaultInjector;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRmF1bHRJbmplY3Rvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9mYXVsdC9GYXVsdEluamVjdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUVBOzs7OztHQUtHO0FBQ0gsTUFBYSxhQUFhO0lBQTFCO1FBQ1Usa0JBQWEsR0FBaUMsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUN4RCxrQkFBYSxHQUE2RCxJQUFJLEdBQUcsRUFBRSxDQUFDO0lBdUc5RixDQUFDO0lBckdDOztPQUVHO0lBQ0gsYUFBYSxDQUFDLEtBQXNCO1FBQ2xDLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEMsK0NBQStDO1FBQy9DLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2xCLElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM3QyxDQUFDO0lBQ0gsQ0FBQztJQUVEOztPQUVHO0lBQ0gsZUFBZSxDQUFDLE9BQWU7UUFDN0IsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDckMsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFpQjtRQUMvQixNQUFNLE9BQU8sR0FBMkIsRUFBRSxDQUFDO1FBQzNDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFFMUQsS0FBSyxNQUFNLE9BQU8sSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUMvQixJQUFJLENBQUM7Z0JBQ0gsTUFBTSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ3JCLE9BQU8sQ0FBQyxJQUFJLENBQUM7b0JBQ1gsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPLElBQUksU0FBUztvQkFDbkMsT0FBTyxFQUFFLElBQUk7b0JBQ2IsU0FBUyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUU7b0JBQ3JCLE1BQU0sRUFBRSxLQUFLLENBQUMsSUFBSTtpQkFDbkIsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2YsT0FBTyxDQUFDLElBQUksQ0FBQztvQkFDWCxPQUFPLEVBQUUsS0FBSyxDQUFDLE9BQU8sSUFBSSxTQUFTO29CQUNuQyxPQUFPLEVBQUUsS0FBSztvQkFDZCxTQUFTLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRTtvQkFDckIsTUFBTSxFQUFFLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRTtpQkFDakMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztRQUNILENBQUM7UUFFRCxPQUFPLE9BQU8sQ0FBQztJQUNqQixDQUFDO0lBRUQ7O09BRUc7SUFDSCxpQkFBaUIsQ0FBQyxTQUFpQixFQUFFLFNBQWtCO1FBQ3JELElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNmLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDM0MsQ0FBQztRQUVELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUN6RCxPQUFPLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0lBQzdCLENBQUM7SUFFRDs7T0FFRztJQUNILG1CQUFtQjtRQUNqQixPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQ2pELENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUs7UUFDSCxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzNCLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDN0IsQ0FBQztJQUVEOztPQUVHO0lBQ0ssZUFBZSxDQUFDLE9BQXFCLEVBQUUsS0FBc0I7UUFDbkUsTUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQztRQUVoQyxJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztZQUN2QyxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDeEMsQ0FBQztRQUVELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBRSxDQUFDO1FBQ3BELFFBQVEsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLEtBQWlCLEVBQUUsRUFBRTtZQUN4QyxrQ0FBa0M7WUFDbEMsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0QyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRDs7T0FFRztJQUNLLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBc0IsRUFBRSxLQUFpQjtRQUNoRSwyREFBMkQ7UUFDM0QsMkNBQTJDO1FBQzNDLEtBQUssQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUN6QixLQUFLLENBQUMsSUFBSSxHQUFHLEVBQUUsR0FBRyxLQUFLLENBQUMsSUFBSSxFQUFFLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQ2xELENBQUM7Q0FDRjtBQXpHRCxzQ0F5R0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBGYXVsdERlZmluaXRpb24sIEZhdWx0SW5qZWN0aW9uUmVzdWx0LCBGYXVsdFRyaWdnZXIsIEZhdWx0RXZlbnQgfSBmcm9tICcuL3R5cGVzJztcblxuLyoqXG4gKiBFdmVudC1iYXNlZCBGYXVsdCBJbmplY3Rpb24gRW5naW5lXG4gKiBcbiAqIEZhdWx0cyBhcmUgdHJpZ2dlcmVkIGJ5IGV2ZW50cywgbm90IGp1c3QgdGltZS1iYXNlZCBkZWxheXMuXG4gKiBUaGlzIGFsbG93cyBwcmVjaXNlIGNvbnRyb2wgb3ZlciB3aGVuIGZhdWx0cyBhcmUgaW5qZWN0ZWQuXG4gKi9cbmV4cG9ydCBjbGFzcyBGYXVsdEluamVjdG9yIHtcbiAgcHJpdmF0ZSBwZW5kaW5nRmF1bHRzOiBNYXA8c3RyaW5nLCBGYXVsdERlZmluaXRpb24+ID0gbmV3IE1hcCgpO1xuICBwcml2YXRlIGV2ZW50SGFuZGxlcnM6IE1hcDxzdHJpbmcsIEFycmF5PChldmVudDogRmF1bHRFdmVudCkgPT4gUHJvbWlzZTx2b2lkPj4+ID0gbmV3IE1hcCgpO1xuXG4gIC8qKlxuICAgKiBSZWdpc3RlciBhIGZhdWx0IGZvciBpbmplY3Rpb25cbiAgICovXG4gIHJlZ2lzdGVyRmF1bHQoZmF1bHQ6IEZhdWx0RGVmaW5pdGlvbik6IHZvaWQge1xuICAgIHRoaXMucGVuZGluZ0ZhdWx0cy5zZXQoZmF1bHQuaWQsIGZhdWx0KTtcbiAgICBcbiAgICAvLyBSZWdpc3RlciBldmVudCBoYW5kbGVyIGlmIHRyaWdnZXIgaXMgZGVmaW5lZFxuICAgIGlmIChmYXVsdC50cmlnZ2VyKSB7XG4gICAgICB0aGlzLnJlZ2lzdGVyVHJpZ2dlcihmYXVsdC50cmlnZ2VyLCBmYXVsdCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFVucmVnaXN0ZXIgYSBmYXVsdFxuICAgKi9cbiAgdW5yZWdpc3RlckZhdWx0KGZhdWx0SWQ6IHN0cmluZyk6IHZvaWQge1xuICAgIHRoaXMucGVuZGluZ0ZhdWx0cy5kZWxldGUoZmF1bHRJZCk7XG4gIH1cblxuICAvKipcbiAgICogRW1pdCBhbiBldmVudCB0aGF0IG1heSB0cmlnZ2VyIGZhdWx0c1xuICAgKi9cbiAgYXN5bmMgZW1pdEV2ZW50KGV2ZW50OiBGYXVsdEV2ZW50KTogUHJvbWlzZTxGYXVsdEluamVjdGlvblJlc3VsdFtdPiB7XG4gICAgY29uc3QgcmVzdWx0czogRmF1bHRJbmplY3Rpb25SZXN1bHRbXSA9IFtdO1xuICAgIGNvbnN0IGhhbmRsZXJzID0gdGhpcy5ldmVudEhhbmRsZXJzLmdldChldmVudC50eXBlKSB8fCBbXTtcblxuICAgIGZvciAoY29uc3QgaGFuZGxlciBvZiBoYW5kbGVycykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgaGFuZGxlcihldmVudCk7XG4gICAgICAgIHJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgZmF1bHRJZDogZXZlbnQuZmF1bHRJZCB8fCAndW5rbm93bicsXG4gICAgICAgICAgYXBwbGllZDogdHJ1ZSxcbiAgICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgICAgICAgZWZmZWN0OiBldmVudC5kYXRhXG4gICAgICAgIH0pO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgcmVzdWx0cy5wdXNoKHtcbiAgICAgICAgICBmYXVsdElkOiBldmVudC5mYXVsdElkIHx8ICd1bmtub3duJyxcbiAgICAgICAgICBhcHBsaWVkOiBmYWxzZSxcbiAgICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgICAgICAgZWZmZWN0OiB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgaWYgYSBmYXVsdCBzaG91bGQgYmUgYXBwbGllZCBmb3IgYSBnaXZlbiBldmVudFxuICAgKi9cbiAgc2hvdWxkSW5qZWN0RmF1bHQoZXZlbnRUeXBlOiBzdHJpbmcsIGZhdWx0VHlwZT86IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIGlmICghZmF1bHRUeXBlKSB7XG4gICAgICByZXR1cm4gdGhpcy5ldmVudEhhbmRsZXJzLmhhcyhldmVudFR5cGUpO1xuICAgIH1cblxuICAgIGNvbnN0IGhhbmRsZXJzID0gdGhpcy5ldmVudEhhbmRsZXJzLmdldChldmVudFR5cGUpIHx8IFtdO1xuICAgIHJldHVybiBoYW5kbGVycy5sZW5ndGggPiAwO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBhbGwgcmVnaXN0ZXJlZCBmYXVsdHNcbiAgICovXG4gIGdldFJlZ2lzdGVyZWRGYXVsdHMoKTogRmF1bHREZWZpbml0aW9uW10ge1xuICAgIHJldHVybiBBcnJheS5mcm9tKHRoaXMucGVuZGluZ0ZhdWx0cy52YWx1ZXMoKSk7XG4gIH1cblxuICAvKipcbiAgICogQ2xlYXIgYWxsIHJlZ2lzdGVyZWQgZmF1bHRzXG4gICAqL1xuICBjbGVhcigpOiB2b2lkIHtcbiAgICB0aGlzLnBlbmRpbmdGYXVsdHMuY2xlYXIoKTtcbiAgICB0aGlzLmV2ZW50SGFuZGxlcnMuY2xlYXIoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWdpc3RlciBhIHRyaWdnZXIgZm9yIGEgZmF1bHRcbiAgICovXG4gIHByaXZhdGUgcmVnaXN0ZXJUcmlnZ2VyKHRyaWdnZXI6IEZhdWx0VHJpZ2dlciwgZmF1bHQ6IEZhdWx0RGVmaW5pdGlvbik6IHZvaWQge1xuICAgIGNvbnN0IGV2ZW50VHlwZSA9IHRyaWdnZXIuZXZlbnQ7XG4gICAgXG4gICAgaWYgKCF0aGlzLmV2ZW50SGFuZGxlcnMuaGFzKGV2ZW50VHlwZSkpIHtcbiAgICAgIHRoaXMuZXZlbnRIYW5kbGVycy5zZXQoZXZlbnRUeXBlLCBbXSk7XG4gICAgfVxuXG4gICAgY29uc3QgaGFuZGxlcnMgPSB0aGlzLmV2ZW50SGFuZGxlcnMuZ2V0KGV2ZW50VHlwZSkhO1xuICAgIGhhbmRsZXJzLnB1c2goYXN5bmMgKGV2ZW50OiBGYXVsdEV2ZW50KSA9PiB7XG4gICAgICAvLyBBcHBseSBmYXVsdCBsb2dpYyBiYXNlZCBvbiB0eXBlXG4gICAgICBhd2FpdCB0aGlzLmFwcGx5RmF1bHQoZmF1bHQsIGV2ZW50KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBcHBseSBhIGZhdWx0IGJhc2VkIG9uIGl0cyB0eXBlXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGFwcGx5RmF1bHQoZmF1bHQ6IEZhdWx0RGVmaW5pdGlvbiwgZXZlbnQ6IEZhdWx0RXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAvLyBGYXVsdCBhcHBsaWNhdGlvbiBsb2dpYyBpcyBoYW5kbGVkIGJ5IHRoZSBTY2VuYXJpb0VuZ2luZVxuICAgIC8vIFRoaXMgaXMgYSBob29rIGZvciBjdXN0b20gZmF1bHQgYmVoYXZpb3JcbiAgICBldmVudC5mYXVsdElkID0gZmF1bHQuaWQ7XG4gICAgZXZlbnQuZGF0YSA9IHsgLi4uZXZlbnQuZGF0YSwgLi4uZmF1bHQucGFyYW1zIH07XG4gIH1cbn1cbiJdfQ==