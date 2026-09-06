import { EvidenceEvent, Evidence, EvidenceReference } from './types';
/**
 * Evidence Collector - collects and manages evidence during a test run
 */
export declare class EvidenceCollector {
    readonly runId: string;
    private events;
    private eventCounter;
    constructor(runId: string);
    /**
     * Record an evidence event
     */
    record(event: Omit<EvidenceEvent, 'eventId' | 'runId'>): EvidenceEvent;
    /**
     * Get all recorded events
     */
    getEvents(): EvidenceEvent[];
    /**
     * Get events by type
     */
    getEventsByType(eventType: string): EvidenceEvent[];
    /**
     * Get events by actor
     */
    getEventsByActor(actor: string): EvidenceEvent[];
    /**
     * Create evidence reference
     */
    createReference(eventId: string, description: string): EvidenceReference;
    /**
     * Build final evidence report
     */
    buildEvidence(): Evidence;
    /**
     * Clear all events
     */
    clear(): void;
}
