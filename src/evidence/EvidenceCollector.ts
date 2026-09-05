import { EvidenceEvent, Evidence, EvidenceReference } from './types';

/**
 * Evidence Collector - collects and manages evidence during a test run
 */
export class EvidenceCollector {
  private events: EvidenceEvent[] = [];
  private eventCounter = 0;

  constructor(public readonly runId: string) {}

  /**
   * Record an evidence event
   */
  record(event: Omit<EvidenceEvent, 'eventId' | 'runId'>): EvidenceEvent {
    const evidenceEvent: EvidenceEvent = {
      ...event,
      eventId: `evt-${this.runId}-${++this.eventCounter}`,
      runId: this.runId
    };
    
    this.events.push(evidenceEvent);
    return evidenceEvent;
  }

  /**
   * Get all recorded events
   */
  getEvents(): EvidenceEvent[] {
    return [...this.events];
  }

  /**
   * Get events by type
   */
  getEventsByType(eventType: string): EvidenceEvent[] {
    return this.events.filter(e => e.eventType === eventType);
  }

  /**
   * Get events by actor
   */
  getEventsByActor(actor: string): EvidenceEvent[] {
    return this.events.filter(e => e.actor === actor);
  }

  /**
   * Create evidence reference
   */
  createReference(eventId: string, description: string): EvidenceReference {
    return { eventId, description };
  }

  /**
   * Build final evidence report
   */
  buildEvidence(): Evidence {
    const actors = new Set(this.events.map(e => e.actor));
    const operations = new Set(
      this.events
        .filter(e => e.operationId)
        .map(e => e.operationId!)
    );

    const timestamps = this.events.map(e => e.timestamp);
    const startTime = timestamps.length > 0 ? Math.min(...timestamps) : 0;
    const endTime = timestamps.length > 0 ? Math.max(...timestamps) : 0;

    return {
      runId: this.runId,
      events: [...this.events],
      summary: {
        totalEvents: this.events.length,
        startTime,
        endTime,
        actorsInvolved: Array.from(actors),
        operationsPerformed: Array.from(operations)
      }
    };
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.events = [];
    this.eventCounter = 0;
  }
}
