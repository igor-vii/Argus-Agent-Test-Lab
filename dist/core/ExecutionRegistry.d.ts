import { AgentController } from './AgentController';
/**
 * ExecutionRegistry — maps participantId → AgentController.
 *
 * Minimal participant-aware execution routing.
 * ScenarioEngine uses this to resolve action.actor.
 */
export declare class ExecutionRegistry {
    private controllers;
    register(actorId: string, controller: AgentController): void;
    get(actorId: string): AgentController | undefined;
    has(actorId: string): boolean;
}
//# sourceMappingURL=ExecutionRegistry.d.ts.map