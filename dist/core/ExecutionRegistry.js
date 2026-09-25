/**
 * ExecutionRegistry — maps participantId → AgentController.
 *
 * Minimal participant-aware execution routing.
 * ScenarioEngine uses this to resolve action.actor.
 */
export class ExecutionRegistry {
    controllers = new Map();
    register(actorId, controller) {
        this.controllers.set(actorId, controller);
    }
    get(actorId) {
        return this.controllers.get(actorId);
    }
    has(actorId) {
        return this.controllers.has(actorId);
    }
}
//# sourceMappingURL=ExecutionRegistry.js.map