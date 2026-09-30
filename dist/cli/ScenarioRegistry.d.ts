import { ScenarioDefinition } from '../core/ScenarioDefinition';
/**
 * Реестр сценариев
 */
export declare const ScenarioRegistry: Map<string, ScenarioDefinition>;
/**
 * Получить все ID сценариев
 */
export declare function getScenarioIds(): string[];
/**
 * Получить сценарий по ID
 */
export declare function getScenario(id: string): ScenarioDefinition | undefined;
//# sourceMappingURL=ScenarioRegistry.d.ts.map