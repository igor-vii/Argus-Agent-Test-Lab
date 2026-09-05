/**
 * Evidence Event - represents a recorded event during a test run
 */
export interface EvidenceEvent {
  /** Unique event ID */
  eventId: string;
  
  /** Run ID this event belongs to */
  runId: string;
  
  /** Timestamp of the event */
  timestamp: number;
  
  /** Actor that caused this event (agent id, system, etc.) */
  actor: string;
  
  /** Type of event */
  eventType: string;
  
  /** Operation/request ID if applicable */
  operationId?: string;
  
  /** Payment ID if applicable */
  paymentId?: string;
  
  /** Expected context */
  expected?: Record<string, unknown>;
  
  /** Actual context/result */
  actual?: Record<string, unknown>;
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Evidence Reference - points to specific evidence events
 */
export interface EvidenceReference {
  eventId: string;
  description: string;
}

/**
 * Structured Evidence Model
 * 
 * Collects all evidence from a test run to support verdicts.
 */
export interface Evidence {
  /** Run ID */
  runId: string;
  
  /** All recorded events */
  events: EvidenceEvent[];
  
  /** Summary of what happened */
  summary: {
    totalEvents: number;
    startTime: number;
    endTime: number;
    actorsInvolved: string[];
    operationsPerformed: string[];
  };
}
