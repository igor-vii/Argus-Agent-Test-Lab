"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssertionEngine = void 0;
/**
 * Minimal Assertion Engine
 *
 * Evaluates invariants against collected evidence and produces verdicts.
 * Supports PASS, FAIL, and INCONCLUSIVE outcomes.
 *
 * Supported checks:
 * - countEventsByType('eventType') == N
 * - countEventsByType('eventType') <= N
 * - countEventsByType('eventType') >= N
 * - isUnique('fieldName') - checks uniqueness of field across events
 * - hasSequence(['event1', 'event2']) - checks event order
 */
class AssertionEngine {
    constructor(evidenceCollector) {
        this.evidenceCollector = evidenceCollector;
    }
    /**
     * Evaluate a single invariant
     */
    evaluateInvariant(invariant, evaluationFn) {
        try {
            const result = evaluationFn();
            if (result.inconclusive) {
                return {
                    invariantId: invariant.id,
                    invariantDescription: invariant.description,
                    outcome: 'INCONCLUSIVE',
                    expected: result.expected,
                    actual: String(result.actual),
                    evidenceReferences: result.evidenceRefs ? result.evidenceRefs.map(id => ({ eventId: id, description: '' })) : [],
                    reason: 'Evidence insufficient to prove invariant'
                };
            }
            if (result.passed) {
                return {
                    invariantId: invariant.id,
                    invariantDescription: invariant.description,
                    outcome: 'PASS',
                    expected: result.expected,
                    actual: String(result.actual),
                    evidenceReferences: result.evidenceRefs ? result.evidenceRefs.map(id => ({ eventId: id, description: '' })) : [],
                    reason: 'Invariant condition satisfied'
                };
            }
            else {
                return {
                    invariantId: invariant.id,
                    invariantDescription: invariant.description,
                    outcome: 'FAIL',
                    expected: result.expected,
                    actual: String(result.actual),
                    evidenceReferences: result.evidenceRefs ? result.evidenceRefs.map(id => ({ eventId: id, description: '' })) : [],
                    reason: 'Invariant condition violated'
                };
            }
        }
        catch (error) {
            return {
                invariantId: invariant.id,
                invariantDescription: invariant.description,
                outcome: 'INCONCLUSIVE',
                expected: invariant.check,
                actual: `Error: ${String(error)}`,
                evidenceReferences: [],
                reason: 'Evaluation failed due to error'
            };
        }
    }
    /**
     * Count events by type
     */
    countEventsByType(eventType) {
        const events = this.evidenceCollector.getEvents();
        const matching = events.filter(e => e.eventType === eventType);
        return {
            count: matching.length,
            eventIds: matching.map(e => e.eventId)
        };
    }
    /**
     * Check if events exist in sequence
     */
    hasSequence(eventTypes) {
        const events = this.evidenceCollector.getEvents();
        const eventIds = [];
        let currentIndex = 0;
        for (const eventType of eventTypes) {
            let found = false;
            for (let i = currentIndex; i < events.length; i++) {
                if (events[i].eventType === eventType) {
                    eventIds.push(events[i].eventId);
                    currentIndex = i + 1;
                    found = true;
                    break;
                }
            }
            if (!found) {
                return { found: false, eventIds: [] };
            }
        }
        return { found: true, eventIds };
    }
    /**
     * Check uniqueness of a field across events
     */
    isUnique(fieldName, eventType) {
        const events = this.evidenceCollector.getEvents();
        const filtered = eventType ? events.filter(e => e.eventType === eventType) : events;
        const values = [];
        const eventIds = [];
        const seen = new Set();
        let isUnique = true;
        for (const event of filtered) {
            const value = event.data?.[fieldName];
            if (value !== undefined) {
                values.push(value);
                eventIds.push(event.eventId);
                if (seen.has(value)) {
                    isUnique = false;
                }
                seen.add(value);
            }
        }
        return { unique: isUnique, values, eventIds };
    }
    /**
     * Get all events of a specific type
     */
    getEventsByType(eventType) {
        return this.evidenceCollector.getEvents().filter(e => e.eventType === eventType);
    }
    /**
     * Evaluate all invariants and produce overall verdict
     */
    evaluateAll(runId, scenarioId, invariants, evaluationFns) {
        const assertions = [];
        for (const invariant of invariants) {
            const evalFn = evaluationFns.get(invariant.id) || (() => ({
                passed: false,
                expected: invariant.check,
                actual: 'No evaluation function provided',
                inconclusive: true
            }));
            const assertion = this.evaluateInvariant(invariant, evalFn);
            assertions.push(assertion);
        }
        // Determine overall verdict
        const overallOutcome = this.determineOverallVerdict(assertions);
        const reason = this.buildVerdictReason(assertions, overallOutcome);
        return {
            runId,
            scenarioId,
            outcome: overallOutcome,
            assertions,
            reason,
            timestamp: Date.now()
        };
    }
    /**
     * Collect relevant evidence for an invariant
     */
    collectRelevantEvidence(invariant) {
        const events = this.evidenceCollector.getEvents();
        const references = [];
        // Simple heuristic: reference last 10 events
        for (const event of events.slice(-10)) {
            references.push({
                eventId: event.eventId,
                description: `${event.eventType} by ${event.actor}`
            });
        }
        return references;
    }
    /**
     * Determine overall verdict from individual assertions
     */
    determineOverallVerdict(assertions) {
        const hasFail = assertions.some(a => a.outcome === 'FAIL');
        const hasInconclusive = assertions.some(a => a.outcome === 'INCONCLUSIVE');
        const allPass = assertions.every(a => a.outcome === 'PASS');
        if (hasFail) {
            return 'FAIL';
        }
        if (hasInconclusive) {
            return 'INCONCLUSIVE';
        }
        if (allPass) {
            return 'PASS';
        }
        return 'INCONCLUSIVE';
    }
    /**
     * Build human-readable reason for overall verdict
     */
    buildVerdictReason(assertions, outcome) {
        const passCount = assertions.filter(a => a.outcome === 'PASS').length;
        const failCount = assertions.filter(a => a.outcome === 'FAIL').length;
        const inconclusiveCount = assertions.filter(a => a.outcome === 'INCONCLUSIVE').length;
        switch (outcome) {
            case 'PASS':
                return `All ${passCount} invariants passed`;
            case 'FAIL':
                return `${failCount} invariant(s) failed out of ${assertions.length}`;
            case 'INCONCLUSIVE':
                return `${inconclusiveCount} invariant(s) could not be evaluated definitively`;
            default:
                return 'Unknown verdict state';
        }
    }
}
exports.AssertionEngine = AssertionEngine;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXNzZXJ0aW9uRW5naW5lLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2Fzc2VydGlvbi9Bc3NlcnRpb25FbmdpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBSUE7Ozs7Ozs7Ozs7OztHQVlHO0FBQ0gsTUFBYSxlQUFlO0lBQzFCLFlBQW9CLGlCQUFvQztRQUFwQyxzQkFBaUIsR0FBakIsaUJBQWlCLENBQW1CO0lBQUcsQ0FBQztJQUU1RDs7T0FFRztJQUNILGlCQUFpQixDQUNmLFNBQTRCLEVBQzVCLFlBQW1JO1FBRW5JLElBQUksQ0FBQztZQUNILE1BQU0sTUFBTSxHQUFHLFlBQVksRUFBRSxDQUFDO1lBRTlCLElBQUksTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUN4QixPQUFPO29CQUNMLFdBQVcsRUFBRSxTQUFTLENBQUMsRUFBRTtvQkFDekIsb0JBQW9CLEVBQUUsU0FBUyxDQUFDLFdBQVc7b0JBQzNDLE9BQU8sRUFBRSxjQUFjO29CQUN2QixRQUFRLEVBQUUsTUFBTSxDQUFDLFFBQVE7b0JBQ3pCLE1BQU0sRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQztvQkFDN0Isa0JBQWtCLEVBQUUsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxXQUFXLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO29CQUNoSCxNQUFNLEVBQUUsMENBQTBDO2lCQUNuRCxDQUFDO1lBQ0osQ0FBQztZQUVELElBQUksTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUNsQixPQUFPO29CQUNMLFdBQVcsRUFBRSxTQUFTLENBQUMsRUFBRTtvQkFDekIsb0JBQW9CLEVBQUUsU0FBUyxDQUFDLFdBQVc7b0JBQzNDLE9BQU8sRUFB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LE9BQU8sTUFBTSxDQUFDO1FBQ2hCLENBQUM7UUFFRCxJQUFJLGVBQWUsRUFBRSxDQUFDO1lBQ3BCLE9BQU8sY0FBYyxDQUFDO1FBQ3hCLENBQUM7UUFFRCxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ1osT0FBTyxNQUFNLENBQUM7UUFDaEIsQ0FBQztRQUVELE9BQU8sY0FBYyxDQUFDO0lBQ3hCLENBQUM7SUFFRDs7T0FFRztJQUNLLGtCQUFrQixDQUFDLFVBQTZCLEVBQUUsT0FBdUI7UUFDL0UsTUFBTSxTQUFTLEdBQUcsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLEtBQUssTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFDO1FBQ3RFLE1BQU0sU0FBUyxHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxLQUFLLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUN0RSxNQUFNLGlCQUFpQixHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxLQUFLLGNBQWMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUV0RixRQUFRLE9BQU8sRUFBRSxDQUFDO1lBQ2hCLEtBQUssTUFBTTtnQkFDVCxPQUFPLE9BQU8sU0FBUyxvQkFBb0IsQ0FBQztZQUM5QyxLQUFLLE1BQU07Z0JBQ1QsT0FBTyxHQUFHLFNBQVMsK0JBQStCLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUN4RSxLQUFLLGNBQWM7Z0JBQ2pCLE9BQU8sR0FBRyxpQkFBaUIsbURBQW1ELENBQUM7WUFDakY7Z0JBQ0UsT0FBTyx1QkFBdUIsQ0FBQztRQUNuQyxDQUFDO0lBQ0gsQ0FBQztDQUNGO0FBcE9ELDBDQW9PQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFzc2VydGlvblJlc3VsdCwgVmVyZGljdCwgVmVyZGljdE91dGNvbWUgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7IEV2aWRlbmNlQ29sbGVjdG9yLCBFdmlkZW5jZUV2ZW50IH0gZnJvbSAnLi4vZXZpZGVuY2UnO1xuaW1wb3J0IHsgU2NlbmFyaW9JbnZhcmlhbnQgfSBmcm9tICcuLi9zY2VuYXJpbyc7XG5cbi8qKlxuICogTWluaW1hbCBBc3NlcnRpb24gRW5naW5lXG4gKiBcbiAqIEV2YWx1YXRlcyBpbnZhcmlhbnRzIGFnYWluc3QgY29sbGVjdGVkIGV2aWRlbmNlIGFuZCBwcm9kdWNlcyB2ZXJkaWN0cy5cbiAqIFN1cHBvcnRzIFBBU1MsIEZBSUwsIGFuZCBJTkNPTkNMVVNJVkUgb3V0Y29tZXMuXG4gKiBcbiAqIFN1cHBvcnRlZCBjaGVja3M6XG4gKiAtIGNvdW50RXZlbnRzQnlUeXBlKCdldmVudFR5cGUnKSA9PSBOXG4gKiAtIGNvdW50RXZlbnRzQnlUeXBlKCdldmVudFR5cGUnKSA8PSBOXG4gKiAtIGNvdW50RXZlbnRzQnlUeXBlKCdldmVudFR5cGUnKSA+PSBOXG4gKiAtIGlzVW5pcXVlKCdmaWVsZE5hbWUnKSAtIGNoZWNrcyB1bmlxdWVuZXNzIG9mIGZpZWxkIGFjcm9zcyBldmVudHNcbiAqIC0gaGFzU2VxdWVuY2UoWydldmVudDEnLCAnZXZlbnQyJ10pIC0gY2hlY2tzIGV2ZW50IG9yZGVyXG4gKi9cbmV4cG9ydCBjbGFzcyBBc3NlcnRpb25FbmdpbmUge1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIGV2aWRlbmNlQ29sbGVjdG9yOiBFdmlkZW5jZUNvbGxlY3Rvcikge31cbiAgXG4gIC8qKlxuICAgKiBFdmFsdWF0ZSBhIHNpbmdsZSBpbnZhcmlhbnRcbiAgICovXG4gIGV2YWx1YXRlSW52YXJpYW50KFxuICAgIGludmFyaWFudDogU2NlbmFyaW9JbnZhcmlhbnQsXG4gICAgZXZhbHVhdGlvbkZuOiAoKSA9PiB7IHBhc3NlZDogYm9vbGVhbjsgZXhwZWN0ZWQ6IHN0cmluZzsgYWN0dWFsOiBzdHJpbmcgfCBudW1iZXI7IGluY29uY2x1c2l2ZT86IGJvb2xlYW47IGV2aWRlbmNlUmVmcz86IHN0cmluZ1tdIH1cbiAgKTogQXNzZXJ0aW9uUmVzdWx0IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gZXZhbHVhdGlvbkZuKCk7XG4gICAgICBcbiAgICAgIGlmIChyZXN1bHQuaW5jb25jbHVzaXZlKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgaW52YXJpYW50SWQ6IGludmFyaWFudC5pZCxcbiAgICAgICAgICBpbnZhcmlhbnREZXNjcmlwdGlvbjogaW52YXJpYW50LmRlc2NyaXB0aW9uLFxuICAgICAgICAgIG91dGNvbWU6ICdJTkNPTkNMVVNJVkUnLFxuICAgICAgICAgIGV4cGVjdGVkOiByZXN1bHQuZXhwZWN0ZWQsXG4gICAgICAgICAgYWN0dWFsOiBTdHJpbmcocmVzdWx0LmFjdHVhbCksXG4gICAgICAgICAgZXZpZGVuY2VSZWZlcmVuY2VzOiByZXN1bHQuZXZpZGVuY2VSZWZzID8gcmVzdWx0LmV2aWRlbmNlUmVmcy5tYXAoaWQgPT4gKHsgZXZlbnRJZDogaWQsIGRlc2NyaXB0aW9uOiAnJyB9KSkgOiBbXSxcbiAgICAgICAgICByZWFzb246ICdFdmlkZW5jZSBpbnN1ZmZpY2llbnQgdG8gcHJvdmUgaW52YXJpYW50J1xuICAgICAgICB9O1xuICAgICAgfVxuXG4gICAgICBpZiAocmVzdWx0LnBhc3NlZCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGludmFyaWFudElkOiBpbnZhcmlhbnQuaWQsXG4gICAgICAgICAgaW52YXJpYW50RGVzY3JpcHRpb246IGludmFyaWFudC5kZXNjcmlwdGlvbixcbiAgICAgICAgICBvdXRjb21lOiAnUEFTUycsXG4gICAgICAgICAgZXhwZWN0ZWQ6IHJlc3VsdC5leHBlY3RlZCxcbiAgICAgICAgICBhY3R1YWw6IFN0cmluZyhyZXN1bHQuYWN0dWFsKSxcbiAgICAgICAgICBldmlkZW5jZVJlZmVyZW5jZXM6IHJlc3VsdC5ldmlkZW5jZVJlZnMgPyByZXN1bHQuZXZpZGVuY2VSZWZzLm1hcChpZCA9PiAoeyBldmVudElkOiBpZCwgZGVzY3JpcHRpb246ICcnIH0pKSA6IFtdLFxuICAgICAgICAgIHJlYXNvbjogJ0ludmFyaWFudCBjb25kaXRpb24gc2F0aXNmaWVkJ1xuICAgICAgICB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBpbnZhcmlhbnRJZDogaW52YXJpYW50LmlkLFxuICAgICAgICAgIGludmFyaWFudERlc2NyaXB0aW9uOiBpbnZhcmlhbnQuZGVzY3JpcHRpb24sXG4gICAgICAgICAgb3V0Y29tZTogJ0ZBSUwnLFxuICAgICAgICAgIGV4cGVjdGVkOiByZXN1bHQuZXhwZWN0ZWQsXG4gICAgICAgICAgYWN0dWFsOiBTdHJpbmcocmVzdWx0LmFjdHVhbCksXG4gICAgICAgICAgZXZpZGVuY2VSZWZlcmVuY2VzOiByZXN1bHQuZXZpZGVuY2VSZWZzID8gcmVzdWx0LmV2aWRlbmNlUmVmcy5tYXAoaWQgPT4gKHsgZXZlbnRJZDogaWQsIGRlc2NyaXB0aW9uOiAnJyB9KSkgOiBbXSxcbiAgICAgICAgICByZWFzb246ICdJbnZhcmlhbnQgY29uZGl0aW9uIHZpb2xhdGVkJ1xuICAgICAgICB9O1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBpbnZhcmlhbnRJZDogaW52YXJpYW50LmlkLFxuICAgICAgICBpbnZhcmlhbnREZXNjcmlwdGlvbjogaW52YXJpYW50LmRlc2NyaXB0aW9uLFxuICAgICAgICBvdXRjb21lOiAnSU5DT05DTFVTSVZFJyxcbiAgICAgICAgZXhwZWN0ZWQ6IGludmFyaWFudC5jaGVjayxcbiAgICAgICAgYWN0dWFsOiBgRXJyb3I6ICR7U3RyaW5nKGVycm9yKX1gLFxuICAgICAgICBldmlkZW5jZVJlZmVyZW5jZXM6IFtdLFxuICAgICAgICByZWFzb246ICdFdmFsdWF0aW9uIGZhaWxlZCBkdWUgdG8gZXJyb3InXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDb3VudCBldmVudHMgYnkgdHlwZVxuICAgKi9cbiAgY291bnRFdmVudHNCeVR5cGUoZXZlbnRUeXBlOiBzdHJpbmcpOiB7IGNvdW50OiBudW1iZXI7IGV2ZW50SWRzOiBzdHJpbmdbXSB9IHtcbiAgICBjb25zdCBldmVudHMgPSB0aGlzLmV2aWRlbmNlQ29sbGVjdG9yLmdldEV2ZW50cygpO1xuICAgIGNvbnN0IG1hdGNoaW5nID0gZXZlbnRzLmZpbHRlcihlID0+IGUuZXZlbnRUeXBlID09PSBldmVudFR5cGUpO1xuICAgIHJldHVybiB7XG4gICAgICBjb3VudDogbWF0Y2hpbmcubGVuZ3RoLFxuICAgICAgZXZlbnRJZHM6IG1hdGNoaW5nLm1hcChlID0+IGUuZXZlbnRJZClcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrIGlmIGV2ZW50cyBleGlzdCBpbiBzZXF1ZW5jZVxuICAgKi9cbiAgaGFzU2VxdWVuY2UoZXZlbnRUeXBlczogc3RyaW5nW10pOiB7IGZvdW5kOiBib29sZWFuOyBldmVudElkczogc3RyaW5nW10gfSB7XG4gICAgY29uc3QgZXZlbnRzID0gdGhpcy5ldmlkZW5jZUNvbGxlY3Rvci5nZXRFdmVudHMoKTtcbiAgICBjb25zdCBldmVudElkczogc3RyaW5nW10gPSBbXTtcbiAgICBcbiAgICBsZXQgY3VycmVudEluZGV4ID0gMDtcbiAgICBmb3IgKGNvbnN0IGV2ZW50VHlwZSBvZiBldmVudFR5cGVzKSB7XG4gICAgICBsZXQgZm91bmQgPSBmYWxzZTtcbiAgICAgIGZvciAobGV0IGkgPSBjdXJyZW50SW5kZXg7IGkgPCBldmVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGV2ZW50c1tpXS5ldmVudFR5cGUgPT09IGV2ZW50VHlwZSkge1xuICAgICAgICAgIGV2ZW50SWRzLnB1c2goZXZlbnRzW2ldLmV2ZW50SWQpO1xuICAgICAgICAgIGN1cnJlbnRJbmRleCA9IGkgKyAxO1xuICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKCFmb3VuZCkge1xuICAgICAgICByZXR1cm4geyBmb3VuZDogZmFsc2UsIGV2ZW50SWRzOiBbXSB9O1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICByZXR1cm4geyBmb3VuZDogdHJ1ZSwgZXZlbnRJZHMgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVjayB1bmlxdWVuZXNzIG9mIGEgZmllbGQgYWNyb3NzIGV2ZW50c1xuICAgKi9cbiAgaXNVbmlxdWUoZmllbGROYW1lOiBzdHJpbmcsIGV2ZW50VHlwZT86IHN0cmluZyk6IHsgdW5pcXVlOiBib29sZWFuOyB2YWx1ZXM6IGFueVtdOyBldmVudElkczogc3RyaW5nW10gfSB7XG4gICAgY29uc3QgZXZlbnRzID0gdGhpcy5ldmlkZW5jZUNvbGxlY3Rvci5nZXRFdmVudHMoKTtcbiAgICBjb25zdCBmaWx0ZXJlZCA9IGV2ZW50VHlwZSA/IGV2ZW50cy5maWx0ZXIoZSA9PiBlLmV2ZW50VHlwZSA9PT0gZXZlbnRUeXBlKSA6IGV2ZW50cztcbiAgICBcbiAgICBjb25zdCB2YWx1ZXM6IGFueVtdID0gW107XG4gICAgY29uc3QgZXZlbnRJZHM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3Qgc2VlbiA9IG5ldyBTZXQ8YW55PigpO1xuICAgIGxldCBpc1VuaXF1ZSA9IHRydWU7XG4gICAgXG4gICAgZm9yIChjb25zdCBldmVudCBvZiBmaWx0ZXJlZCkge1xuICAgICAgY29uc3QgdmFsdWUgPSAoZXZlbnQuZGF0YSBhcyBhbnkpPy5bZmllbGROYW1lXTtcbiAgICAgIGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHZhbHVlcy5wdXNoKHZhbHVlKTtcbiAgICAgICAgZXZlbnRJZHMucHVzaChldmVudC5ldmVudElkKTtcbiAgICAgICAgaWYgKHNlZW4uaGFzKHZhbHVlKSkge1xuICAgICAgICAgIGlzVW5pcXVlID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgc2Vlbi5hZGQodmFsdWUpO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICByZXR1cm4geyB1bmlxdWU6IGlzVW5pcXVlLCB2YWx1ZXMsIGV2ZW50SWRzIH07XG4gIH1cblxuICAvKipcbiAgICogR2V0IGFsbCBldmVudHMgb2YgYSBzcGVjaWZpYyB0eXBlXG4gICAqL1xuICBnZXRFdmVudHNCeVR5cGUoZXZlbnRUeXBlOiBzdHJpbmcpOiBFdmlkZW5jZUV2ZW50W10ge1xuICAgIHJldHVybiB0aGlzLmV2aWRlbmNlQ29sbGVjdG9yLmdldEV2ZW50cygpLmZpbHRlcihlID0+IGUuZXZlbnRUeXBlID09PSBldmVudFR5cGUpO1xuICB9XG5cbiAgLyoqXG4gICAqIEV2YWx1YXRlIGFsbCBpbnZhcmlhbnRzIGFuZCBwcm9kdWNlIG92ZXJhbGwgdmVyZGljdFxuICAgKi9cbiAgZXZhbHVhdGVBbGwoXG4gICAgcnVuSWQ6IHN0cmluZyxcbiAgICBzY2VuYXJpb0lkOiBzdHJpbmcsXG4gICAgaW52YXJpYW50czogU2NlbmFyaW9JbnZhcmlhbnRbXSxcbiAgICBldmFsdWF0aW9uRm5zOiBNYXA8c3RyaW5nLCAoKSA9PiB7IHBhc3NlZDogYm9vbGVhbjsgZXhwZWN0ZWQ6IHN0cmluZzsgYWN0dWFsOiBzdHJpbmcgfCBudW1iZXI7IGluY29uY2x1c2l2ZT86IGJvb2xlYW47IGV2aWRlbmNlUmVmcz86IHN0cmluZ1tdIH0+XG4gICk6IFZlcmRpY3Qge1xuICAgIGNvbnN0IGFzc2VydGlvbnM6IEFzc2VydGlvblJlc3VsdFtdID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGludmFyaWFudCBvZiBpbnZhcmlhbnRzKSB7XG4gICAgICBjb25zdCBldmFsRm4gPSBldmFsdWF0aW9uRm5zLmdldChpbnZhcmlhbnQuaWQpIHx8ICgoKSA9PiAoe1xuICAgICAgICBwYXNzZWQ6IGZhbHNlLFxuICAgICAgICBleHBlY3RlZDogaW52YXJpYW50LmNoZWNrLFxuICAgICAgICBhY3R1YWw6ICdObyBldmFsdWF0aW9uIGZ1bmN0aW9uIHByb3ZpZGVkJyxcbiAgICAgICAgaW5jb25jbHVzaXZlOiB0cnVlXG4gICAgICB9KSk7XG5cbiAgICAgIGNvbnN0IGFzc2VydGlvbiA9IHRoaXMuZXZhbHVhdGVJbnZhcmlhbnQoaW52YXJpYW50LCBldmFsRm4pO1xuICAgICAgYXNzZXJ0aW9ucy5wdXNoKGFzc2VydGlvbik7XG4gICAgfVxuXG4gICAgLy8gRGV0ZXJtaW5lIG92ZXJhbGwgdmVyZGljdFxuICAgIGNvbnN0IG92ZXJhbGxPdXRjb21lID0gdGhpcy5kZXRlcm1pbmVPdmVyYWxsVmVyZGljdChhc3NlcnRpb25zKTtcbiAgICBjb25zdCByZWFzb24gPSB0aGlzLmJ1aWxkVmVyZGljdFJlYXNvbihhc3NlcnRpb25zLCBvdmVyYWxsT3V0Y29tZSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgcnVuSWQsXG4gICAgICBzY2VuYXJpb0lkLFxuICAgICAgb3V0Y29tZTogb3ZlcmFsbE91dGNvbWUsXG4gICAgICBhc3NlcnRpb25zLFxuICAgICAgcmVhc29uLFxuICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDb2xsZWN0IHJlbGV2YW50IGV2aWRlbmNlIGZvciBhbiBpbnZhcmlhbnRcbiAgICovXG4gIHByaXZhdGUgY29sbGVjdFJlbGV2YW50RXZpZGVuY2UoaW52YXJpYW50OiBTY2VuYXJpb0ludmFyaWFudCk6IEFycmF5PHsgZXZlbnRJZDogc3RyaW5nOyBkZXNjcmlwdGlvbjogc3RyaW5nIH0+IHtcbiAgICBjb25zdCBldmVudHMgPSB0aGlzLmV2aWRlbmNlQ29sbGVjdG9yLmdldEV2ZW50cygpO1xuICAgIGNvbnN0IHJlZmVyZW5jZXM6IEFycmF5PHsgZXZlbnRJZDogc3RyaW5nOyBkZXNjcmlwdGlvbjogc3RyaW5nIH0+ID0gW107XG5cbiAgICAvLyBTaW1wbGUgaGV1cmlzdGljOiByZWZlcmVuY2UgbGFzdCAxMCBldmVudHNcbiAgICBmb3IgKGNvbnN0IGV2ZW50IG9mIGV2ZW50cy5zbGljZSgtMTApKSB7XG4gICAgICByZWZlcmVuY2VzLnB1c2goe1xuICAgICAgICBldmVudElkOiBldmVudC5ldmVudElkLFxuICAgICAgICBkZXNjcmlwdGlvbjogYCR7ZXZlbnQuZXZlbnRUeXBlfSBieSAke2V2ZW50LmFjdG9yfWBcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiByZWZlcmVuY2VzO1xuICB9XG5cbiAgLyoqXG4gICAqIERldGVybWluZSBvdmVyYWxsIHZlcmRpY3QgZnJvbSBpbmRpdmlkdWFsIGFzc2VydGlvbnNcbiAgICovXG4gIHByaXZhdGUgZGV0ZXJtaW5lT3ZlcmFsbFZlcmRpY3QoYXNzZXJ0aW9uczogQXNzZXJ0aW9uUmVzdWx0W10pOiBWZXJkaWN0T3V0Y29tZSB7XG4gICAgY29uc3QgaGFzRmFpbCA9IGFzc2VydGlvbnMuc29tZShhID0+IGEub3V0Y29tZSA9PT0gJ0ZBSUwnKTtcbiAgICBjb25zdCBoYXNJbmNvbmNsdXNpdmUgPSBhc3NlcnRpb25zLnNvbWUoYSA9PiBhLm91dGNvbWUgPT09ICdJTkNPTkNMVVNJVkUnKTtcbiAgICBjb25zdCBhbGxQYXNzID0gYXNzZXJ0aW9ucy5ldmVyeShhID0+IGEub3V0Y29tZSA9PT0gJ1BBU1MnKTtcblxuICAgIGlmIChoYXNGYWlsKSB7XG4gICAgICByZXR1cm4gJ0ZBSUwnO1xuICAgIH1cblxuICAgIGlmIChoYXNJbmNvbmNsdXNpdmUpIHtcbiAgICAgIHJldHVybiAnSU5DT05DTFVTSVZFJztcbiAgICB9XG5cbiAgICBpZiAoYWxsUGFzcykge1xuICAgICAgcmV0dXJuICdQQVNTJztcbiAgICB9XG5cbiAgICByZXR1cm4gJ0lOQ09OQ0xVU0lWRSc7XG4gIH1cblxuICAvKipcbiAgICogQnVpbGQgaHVtYW4tcmVhZGFibGUgcmVhc29uIGZvciBvdmVyYWxsIHZlcmRpY3RcbiAgICovXG4gIHByaXZhdGUgYnVpbGRWZXJkaWN0UmVhc29uKGFzc2VydGlvbnM6IEFzc2VydGlvblJlc3VsdFtdLCBvdXRjb21lOiBWZXJkaWN0T3V0Y29tZSk6IHN0cmluZyB7XG4gICAgY29uc3QgcGFzc0NvdW50ID0gYXNzZXJ0aW9ucy5maWx0ZXIoYSA9PiBhLm91dGNvbWUgPT09ICdQQVNTJykubGVuZ3RoO1xuICAgIGNvbnN0IGZhaWxDb3VudCA9IGFzc2VydGlvbnMuZmlsdGVyKGEgPT4gYS5vdXRjb21lID09PSAnRkFJTCcpLmxlbmd0aDtcbiAgICBjb25zdCBpbmNvbmNsdXNpdmVDb3VudCA9IGFzc2VydGlvbnMuZmlsdGVyKGEgPT4gYS5vdXRjb21lID09PSAnSU5DT05DTFVTSVZFJykubGVuZ3RoO1xuXG4gICAgc3dpdGNoIChvdXRjb21lKSB7XG4gICAgICBjYXNlICdQQVNTJzpcbiAgICAgICAgcmV0dXJuIGBBbGwgJHtwYXNzQ291bnR9IGludmFyaWFudHMgcGFzc2VkYDtcbiAgICAgIGNhc2UgJ0ZBSUwnOlxuICAgICAgICByZXR1cm4gYCR7ZmFpbENvdW50fSBpbnZhcmlhbnQocykgZmFpbGVkIG91dCBvZiAke2Fzc2VydGlvbnMubGVuZ3RofWA7XG4gICAgICBjYXNlICdJTkNPTkNMVVNJVkUnOlxuICAgICAgICByZXR1cm4gYCR7aW5jb25jbHVzaXZlQ291bnR9IGludmFyaWFudChzKSBjb3VsZCBub3QgYmUgZXZhbHVhdGVkIGRlZmluaXRpdmVseWA7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4gJ1Vua25vd24gdmVyZGljdCBzdGF0ZSc7XG4gICAgfVxuICB9XG59XG4iXX0=