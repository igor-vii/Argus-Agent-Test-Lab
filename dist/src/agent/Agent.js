"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Agent = void 0;
/**
 * Unified Agent Runtime
 *
 * Single implementation that supports different roles and behaviors
 * through configuration. Not separate BuyerAgent/SellerAgent classes.
 */
class Agent {
    constructor(config, eventCallback) {
        this.config = config;
        this.eventCallback = eventCallback;
    }
    /**
     * Execute an action based on agent's role and behavior profile
     */
    async act(action, context) {
        const result = await this.executeAction(action, context);
        this.emit({
            eventType: `action.${action}`,
            data: { input: context, output: result }
        });
        return result;
    }
    /**
     * Observe the environment/target state
     */
    async observe(state) {
        const observation = await this.processObservation(state);
        this.emit({
            eventType: 'observation',
            data: { state, observation }
        });
        return observation;
    }
    /**
     * Get faults applicable to this agent
     */
    getFaults() {
        return this.config.faults;
    }
    /**
     * Check if agent has a specific fault type
     */
    hasFault(faultType) {
        return this.config.faults.some(f => f.type === faultType);
    }
    /**
     * Get fault configuration by type
     */
    getFaultConfig(faultType) {
        return this.config.faults.find(f => f.type === faultType);
    }
    /**
     * Emit an event
     */
    emit(event) {
        if (this.eventCallback) {
            this.eventCallback({
                ...event,
                timestamp: Date.now(),
                runId: '', // Will be set by ScenarioEngine
                agentId: this.config.id
            });
        }
    }
    /**
     * Execute action based on behavior profile
     * This is where faulty/adversarial behavior is applied
     */
    async executeAction(action, context) {
        // For MVP, behavior profile affects how faults are applied
        // The actual fault injection happens in the FaultInjection layer
        return context;
    }
    /**
     * Process observation based on behavior profile
     */
    async processObservation(state) {
        return state;
    }
}
exports.Agent = Agent;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQWdlbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvYWdlbnQvQWdlbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBYUE7Ozs7O0dBS0c7QUFDSCxNQUFhLEtBQUs7SUFDaEIsWUFDa0IsTUFBbUIsRUFDM0IsYUFBMkM7UUFEbkMsV0FBTSxHQUFOLE1BQU0sQ0FBYTtRQUMzQixrQkFBYSxHQUFiLGFBQWEsQ0FBOEI7SUFDbEQsQ0FBQztJQUVKOztPQUVHO0lBQ0gsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFjLEVBQUUsT0FBZ0M7UUFDeEQsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQztRQUV6RCxJQUFJLENBQUMsSUFBSSxDQUFDO1lBQ1IsU0FBUyxFQUFFLFVBQVUsTUFBTSxFQUFFO1lBQzdCLElBQUksRUFBRSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRTtTQUN6QyxDQUFDLENBQUM7UUFFSCxPQUFPLE1BQU0sQ0FBQztJQUNoQixDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQThCO1FBQzFDLE1BQU0sV0FBVyxHQUFHLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRXpELElBQUksQ0FBQyxJQUFJLENBQUM7WUFDUixTQUFTLEVBQUUsYUFBYTtZQUN4QixJQUFJLEVBQUUsRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFO1NBQzdCLENBQUMsQ0FBQztRQUVILE9BQU8sV0FBVyxDQUFDO0lBQ3JCLENBQUM7SUFFRDs7T0FFRztJQUNILFNBQVM7UUFDUCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO0lBQzVCLENBQUM7SUFFRDs7T0FFRztJQUNILFFBQVEsQ0FBQyxTQUFpQjtRQUN4QixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssU0FBUyxDQUFDLENBQUM7SUFDNUQsQ0FBQztJQUVEOztPQUVHO0lBQ0gsY0FBYyxDQUFDLFNBQWlCO1FBQzlCLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxTQUFTLENBQUMsQ0FBQztJQUM1RCxDQUFDO0lBRUQ7O09BRUc7SUFDSyxJQUFJLENBQUMsS0FBMEQ7UUFDckUsSUFBSSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDdkIsSUFBSSxDQUFDLGFBQWEsQ0FBQztnQkFDakIsR0FBRyxLQUFLO2dCQUNSLFNBQVMsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFO2dCQUNyQixLQUFLLEVBQUUsRUFBRSxFQUFFLGdDQUFnQztnQkFDM0MsT0FBTyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRTthQUN4QixDQUFDLENBQUM7UUFDTCxDQUFDO0lBQ0gsQ0FBQztJQUVEOzs7T0FHRztJQUNLLEtBQUssQ0FBQyxhQUFhLENBQ3pCLE1BQWMsRUFDZCxPQUFnQztRQUVoQywyREFBMkQ7UUFDM0QsaUVBQWlFO1FBQ2pFLE9BQU8sT0FBTyxDQUFDO0lBQ2pCLENBQUM7SUFFRDs7T0FFRztJQUNLLEtBQUssQ0FBQyxrQkFBa0IsQ0FDOUIsS0FBOEI7UUFFOUIsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0NBQ0Y7QUExRkQsc0JBMEZDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQWdlbnRDb25maWcsIEZhdWx0Q29uZmlnIH0gZnJvbSAnLi90eXBlcyc7XG5cbi8qKlxuICogRXZlbnQgZW1pdHRlZCBieSB0aGUgYWdlbnQgZHVyaW5nIGV4ZWN1dGlvblxuICovXG5leHBvcnQgaW50ZXJmYWNlIEFnZW50RXZlbnQge1xuICB0aW1lc3RhbXA6IG51bWJlcjtcbiAgcnVuSWQ6IHN0cmluZztcbiAgYWdlbnRJZDogc3RyaW5nO1xuICBldmVudFR5cGU6IHN0cmluZztcbiAgZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG59XG5cbi8qKlxuICogVW5pZmllZCBBZ2VudCBSdW50aW1lXG4gKiBcbiAqIFNpbmdsZSBpbXBsZW1lbnRhdGlvbiB0aGF0IHN1cHBvcnRzIGRpZmZlcmVudCByb2xlcyBhbmQgYmVoYXZpb3JzXG4gKiB0aHJvdWdoIGNvbmZpZ3VyYXRpb24uIE5vdCBzZXBhcmF0ZSBCdXllckFnZW50L1NlbGxlckFnZW50IGNsYXNzZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudCB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHB1YmxpYyByZWFkb25seSBjb25maWc6IEFnZW50Q29uZmlnLFxuICAgIHByaXZhdGUgZXZlbnRDYWxsYmFjaz86IChldmVudDogQWdlbnRFdmVudCkgPT4gdm9pZFxuICApIHt9XG5cbiAgLyoqXG4gICAqIEV4ZWN1dGUgYW4gYWN0aW9uIGJhc2VkIG9uIGFnZW50J3Mgcm9sZSBhbmQgYmVoYXZpb3IgcHJvZmlsZVxuICAgKi9cbiAgYXN5bmMgYWN0KGFjdGlvbjogc3RyaW5nLCBjb250ZXh0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IFByb21pc2U8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4ZWN1dGVBY3Rpb24oYWN0aW9uLCBjb250ZXh0KTtcbiAgICBcbiAgICB0aGlzLmVtaXQoe1xuICAgICAgZXZlbnRUeXBlOiBgYWN0aW9uLiR7YWN0aW9ufWAsXG4gICAgICBkYXRhOiB7IGlucHV0OiBjb250ZXh0LCBvdXRwdXQ6IHJlc3VsdCB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIE9ic2VydmUgdGhlIGVudmlyb25tZW50L3RhcmdldCBzdGF0ZVxuICAgKi9cbiAgYXN5bmMgb2JzZXJ2ZShzdGF0ZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBQcm9taXNlPFJlY29yZDxzdHJpbmcsIHVua25vd24+PiB7XG4gICAgY29uc3Qgb2JzZXJ2YXRpb24gPSBhd2FpdCB0aGlzLnByb2Nlc3NPYnNlcnZhdGlvbihzdGF0ZSk7XG4gICAgXG4gICAgdGhpcy5lbWl0KHtcbiAgICAgIGV2ZW50VHlwZTogJ29ic2VydmF0aW9uJyxcbiAgICAgIGRhdGE6IHsgc3RhdGUsIG9ic2VydmF0aW9uIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBvYnNlcnZhdGlvbjtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgZmF1bHRzIGFwcGxpY2FibGUgdG8gdGhpcyBhZ2VudFxuICAgKi9cbiAgZ2V0RmF1bHRzKCk6IEZhdWx0Q29uZmlnW10ge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5mYXVsdHM7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgaWYgYWdlbnQgaGFzIGEgc3BlY2lmaWMgZmF1bHQgdHlwZVxuICAgKi9cbiAgaGFzRmF1bHQoZmF1bHRUeXBlOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZmF1bHRzLnNvbWUoZiA9PiBmLnR5cGUgPT09IGZhdWx0VHlwZSk7XG4gIH1cblxuICAvKipcbiAgICogR2V0IGZhdWx0IGNvbmZpZ3VyYXRpb24gYnkgdHlwZVxuICAgKi9cbiAgZ2V0RmF1bHRDb25maWcoZmF1bHRUeXBlOiBzdHJpbmcpOiBGYXVsdENvbmZpZyB8IHVuZGVmaW5lZCB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmZhdWx0cy5maW5kKGYgPT4gZi50eXBlID09PSBmYXVsdFR5cGUpO1xuICB9XG5cbiAgLyoqXG4gICAqIEVtaXQgYW4gZXZlbnRcbiAgICovXG4gIHByaXZhdGUgZW1pdChldmVudDogT21pdDxBZ2VudEV2ZW50LCAndGltZXN0YW1wJyB8ICdydW5JZCcgfCAnYWdlbnRJZCc+KSB7XG4gICAgaWYgKHRoaXMuZXZlbnRDYWxsYmFjaykge1xuICAgICAgdGhpcy5ldmVudENhbGxiYWNrKHtcbiAgICAgICAgLi4uZXZlbnQsXG4gICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgICAgcnVuSWQ6ICcnLCAvLyBXaWxsIGJlIHNldCBieSBTY2VuYXJpb0VuZ2luZVxuICAgICAgICBhZ2VudElkOiB0aGlzLmNvbmZpZy5pZFxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEV4ZWN1dGUgYWN0aW9uIGJhc2VkIG9uIGJlaGF2aW9yIHByb2ZpbGVcbiAgICogVGhpcyBpcyB3aGVyZSBmYXVsdHkvYWR2ZXJzYXJpYWwgYmVoYXZpb3IgaXMgYXBwbGllZFxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBleGVjdXRlQWN0aW9uKFxuICAgIGFjdGlvbjogc3RyaW5nLCBcbiAgICBjb250ZXh0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPlxuICApOiBQcm9taXNlPFJlY29yZDxzdHJpbmcsIHVua25vd24+PiB7XG4gICAgLy8gRm9yIE1WUCwgYmVoYXZpb3IgcHJvZmlsZSBhZmZlY3RzIGhvdyBmYXVsdHMgYXJlIGFwcGxpZWRcbiAgICAvLyBUaGUgYWN0dWFsIGZhdWx0IGluamVjdGlvbiBoYXBwZW5zIGluIHRoZSBGYXVsdEluamVjdGlvbiBsYXllclxuICAgIHJldHVybiBjb250ZXh0O1xuICB9XG5cbiAgLyoqXG4gICAqIFByb2Nlc3Mgb2JzZXJ2YXRpb24gYmFzZWQgb24gYmVoYXZpb3IgcHJvZmlsZVxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBwcm9jZXNzT2JzZXJ2YXRpb24oXG4gICAgc3RhdGU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+XG4gICk6IFByb21pc2U8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+IHtcbiAgICByZXR1cm4gc3RhdGU7XG4gIH1cbn1cbiJdfQ==