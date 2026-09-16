import { ScenarioDefinition } from './ScenarioDefinition';
import { Assertion, AssertionKind } from './Assertions';

/**
 * Ошибка валидации сценария.
 */
export interface ValidationError {
  assertionId: string;
  rule: string;      // 'Rule 1: behavioral' | 'Rule 1: engine-behavior' | 'Rule 1: mixed'
  message: string;   // человекочитаемое описание
}

/**
 * Результат валидации сценария.
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Проверка Rule 1 для одного assertion.
 *
 * Возвращает массив ошибок (пустой, если assertion валиден).
 * Проверка запускается ТОЛЬКО если referencedSources присутствует
 * (переходный период 8a).
 */
function validateAssertion(
  assertion: Assertion,
  testSubject: string
): ValidationError[] {
  const errors: ValidationError[] = [];
  const sources = assertion.referencedSources;

  // Переходный период: если поле отсутствует — проверка не запускается.
  if (sources === undefined) {
    return errors;
  }

  const kind: AssertionKind = assertion.kind ?? 'behavioral';
  const hasTestSubject = sources.includes(testSubject);
  const hasEngine = sources.includes('engine');
  const hasOther = sources.some(
    (s) => s !== testSubject && s !== 'engine'
  );

  // В V0 с emission observations от ARGUS-owned participants,
  // разрешены источники: testSubject, 'engine', и любые participantId
  // из participants с ownership === 'ARGUS'.
  // Проверяем только что referencedSources содержит хотя бы testSubject или engine.
  
  if (kind === 'behavioral') {
    if (!hasTestSubject) {
      errors.push({
        assertionId: assertion.id,
        rule: 'Rule 1: behavioral',
        message: `behavioral assertion '${assertion.id}' missing reference to testSubject '${testSubject}'`,
      });
    }
  } else if (kind === 'engine-behavior') {
    if (hasTestSubject) {
      errors.push({
        assertionId: assertion.id,
        rule: 'Rule 1: engine-behavior',
        message: `engine-behavior assertion '${assertion.id}' must NOT reference testSubject '${testSubject}'`,
      });
    }
    if (!hasEngine) {
      errors.push({
        assertionId: assertion.id,
        rule: 'Rule 1: engine-behavior',
        message: `engine-behavior assertion '${assertion.id}' must reference 'engine'`,
      });
    }
  } else if (kind === 'mixed') {
    if (!hasTestSubject) {
      errors.push({
        assertionId: assertion.id,
        rule: 'Rule 1: mixed',
        message: `mixed assertion '${assertion.id}' missing reference to testSubject '${testSubject}'`,
      });
    }
    if (!hasEngine) {
      errors.push({
        assertionId: assertion.id,
        rule: 'Rule 1: mixed',
        message: `mixed assertion '${assertion.id}' missing reference to 'engine'`,
      });
    }
  }

  return errors;
}

/**
 * Валидация сценария. Проверяет Rule 1 для всех assertions.
 */
export function validateScenario(
  scenario: ScenarioDefinition
): ValidationResult {
  const errors: ValidationError[] = [];
  const testSubject = scenario.testSubject;

  for (const assertion of scenario.assertions) {
    errors.push(...validateAssertion(assertion, testSubject));
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
