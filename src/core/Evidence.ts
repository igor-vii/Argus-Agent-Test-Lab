/**
 * Evidence — что реально произошло. Два класса источников.
 * 
 * Правила:
 * 1. Observation — от участника. source = participantId.
 * 2. EngineEvent — от инфраструктуры Argus. source = 'engine'.
 * 3. Evidence не делает hierarchy — не говорит, что один источник «правдивее» другого.
 * 4. Evidence не фильтрует по source — сохраняет все наблюдения.
 * 5. Assertion сам решает, какие observations ему нужны.
 */
export type Evidence = Observation | EngineEvent;

export interface Observation {
  source: string;                       // participantId
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export interface EngineEvent {
  source: 'engine';                     // специальное значение
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}
