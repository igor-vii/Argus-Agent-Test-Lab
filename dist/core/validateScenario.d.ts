import { ScenarioDefinition } from './ScenarioDefinition';
/**
 * Ошибка валидации сценария.
 */
export interface ValidationError {
    assertionId: string;
    rule: string;
    message: string;
}
/**
 * Результат валидации сценария.
 */
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}
/**
 * Валидация сценария. Проверяет Rule 1 для всех assertions.
 *
 * Легальные source'ы:
 * - testSubject
 * - 'engine'
 * - participantId любого участника с ownership === 'ARGUS'
 */
export declare function validateScenario(scenario: ScenarioDefinition): ValidationResult;
//# sourceMappingURL=validateScenario.d.ts.map