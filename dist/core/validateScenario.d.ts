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
/**
 * L0-F2 fault-dispatch contract validation.
 *
 * This is intentionally separate from assertion-source validation so legacy
 * scenarios may retain declared-only lifecycle faults without becoming
 * runtime-invalid. Callers that want an executable L0-F2 scenario should
 * require this result to be valid.
 */
export declare function validateFaultDispatch(scenario: ScenarioDefinition): ValidationResult;
//# sourceMappingURL=validateScenario.d.ts.map