import { ScenarioDefinition } from '../core/ScenarioDefinition';
/**
 * S1 — Duplicate Request
 *
 * Цель: Проверить, что один logical request не создает несколько payment operations.
 * Invariant: Один запрос с одинаковым idempotency key → ровно 1 payment operation.
 */
export declare const S1_DuplicateRequest: ScenarioDefinition;
//# sourceMappingURL=S1_DuplicateRequest.d.ts.map