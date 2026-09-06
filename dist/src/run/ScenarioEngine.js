"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScenarioEngine = void 0;
const agent_1 = require("../agent");
const fault_1 = require("../fault");
const evidence_1 = require("../evidence");
const assertion_1 = require("../assertion");
/**
 * Scenario Engine - orchestrates scenario execution
 *
 * Lifecycle:
 * 1. Create runId
 * 2. Accept Scenario Definition
 * 3. Use deterministic seed
 * 4. Run scenario
 * 5. Record events
 * 6. Execute assertions
 * 7. Form verdict
 */
class ScenarioEngine {
    constructor() {
        this.runCounter = 0;
    }
    /**
     * Execute a scenario and return the result
     */
    async execute(config) {
        const runId = this.generateRunId();
        const seed = config.seed ?? Math.floor(Math.random() * 1000000);
        // Initialize seeded random for determinism
        this.seedRandom(seed);
        // Create evidence collector
        const evidenceCollector = new evidence_1.EvidenceCollector(runId);
        // Create assertion engine
        const assertionEngine = new assertion_1.AssertionEngine(evidenceCollector);
        // Create fault injector
        const faultInjector = new fault_1.FaultInjector();
        // Register faults from scenario
        for (const fault of config.scenario.faults) {
            faultInjector.registerFault(fault);
        }
        // Create agents
        const agents = new Map();
        for (const agentConfig of config.scenario.agents) {
            const agent = new agent_1.Agent(agentConfig, (event) => {
                event.runId = runId;
                evidenceCollector.record({
                    timestamp: event.timestamp,
                    actor: event.agentId,
                    eventType: event.eventType,
                    data: event.data
                });
            });
            agents.set(agentConfig.id, agent);
        }
        // Record run start
        evidenceCollector.record({
            timestamp: Date.now(),
            actor: 'system',
            eventType: 'run.started',
            data: { scenarioId: config.scenario.id, seed }
        });
        try {
            // Execute timeline steps
            for (const step of config.scenario.timeline) {
                await this.executeStep(step, agents, config.targetAdapter, evidenceCollector, faultInjector);
            }
            // Record run completion
            evidenceCollector.record({
                timestamp: Date.now(),
                actor: 'system',
                eventType: 'run.completed',
                data: { scenarioId: config.scenario.id }
            });
            // Evaluate invariants using real evidence-based checks
            const evaluationFns = this.createEvaluationFunctions(assertionEngine, config.scenario.invariants);
            const verdict = assertionEngine.evaluateAll(runId, config.scenario.id, config.scenario.invariants, evaluationFns);
            return {
                runId,
                scenarioId: config.scenario.id,
                seed,
                startTime: evidenceCollector.buildEvidence().summary.startTime,
                endTime: evidenceCollector.buildEvidence().summary.endTime,
                verdict,
                status: verdict.outcome === 'PASS' ? 'completed' : verdict.outcome === 'FAIL' ? 'failed' : 'inconclusive'
            };
        }
        catch (error) {
            // Record run failure
            evidenceCollector.record({
                timestamp: Date.now(),
                actor: 'system',
                eventType: 'run.failed',
                data: { error: String(error) }
            });
            return {
                runId,
                scenarioId: config.scenario.id,
                seed,
                startTime: Date.now(),
                endTime: Date.now(),
                verdict: {
                    runId,
                    scenarioId: config.scenario.id,
                    outcome: 'INCONCLUSIVE',
                    assertions: [],
                    reason: `Run failed: ${String(error)}`,
                    timestamp: Date.now()
                },
                status: 'inconclusive'
            };
        }
    }
    /**
     * Generate unique run ID
     */
    generateRunId() {
        return `run-${Date.now()}-${++this.runCounter}`;
    }
    /**
     * Seed random number generator for deterministic runs
     */
    seedRandom(seed) {
        // Simple LCG for seeded randomness
        let state = seed;
        Math.random = () => {
            state = (state * 1103515245 + 12345) & 0x7fffffff;
            return state / 0x7fffffff;
        };
    }
    /**
     * Execute a single timeline step
     */
    async executeStep(step, agents, targetAdapter, evidenceCollector, faultInjector) {
        // Parse actors (may be comma-separated for concurrent actions)
        const actorIds = step.actor.split(',').map(a => a.trim());
        for (const actorId of actorIds) {
            const agent = agents.get(actorId);
            if (agent) {
                // Check for applicable faults
                const faults = agent.getFaults();
                for (const fault of faults) {
                    if (fault.trigger?.event) {
                        await faultInjector.emitEvent({
                            type: fault.trigger.event,
                            data: { action: step.action, stepId: step.stepId },
                            timestamp: Date.now()
                        });
                    }
                }
                // Execute action through agent
                const result = await agent.act(step.action, { stepId: step.stepId });
                // Record evidence
                evidenceCollector.record({
                    timestamp: Date.now(),
                    actor: actorId,
                    eventType: `action.${step.action}`,
                    data: { result, description: step.description }
                });
                // Also execute on target adapter
                if (targetAdapter) {
                    const targetResult = await targetAdapter.execute(step.action, {
                        action: step.action
                    });
                    evidenceCollector.record({
                        timestamp: Date.now(),
                        actor: 'target',
                        eventType: `target.${step.action}`,
                        data: { result: targetResult }
                    });
                }
            }
            else {
                // System or unknown actor
                evidenceCollector.record({
                    timestamp: Date.now(),
                    actor: actorId,
                    eventType: `system.${step.action}`,
                    data: { description: step.description }
                });
            }
        }
    }
    /**
     * Create evaluation functions for invariants based on actual evidence
     */
    createEvaluationFunctions(assertionEngine, invariants) {
        const fns = new Map();
        for (const invariant of invariants) {
            fns.set(invariant.id, () => this.evaluateInvariantCheck(assertionEngine, invariant));
        }
        return fns;
    }
    /**
     * Evaluate a single invariant check string
     * Supports:
     * - countEventsByType('eventType') == N
     * - countEventsByType('eventType') <= N
     * - countEventsByType('eventType') >= N
     */
    evaluateInvariantCheck(assertionEngine, invariant) {
        const check = invariant.check;
        // Parse countEventsByType checks
        const countMatch = check.match(/countEventsByType\(['"]([^'"]+)['"]\)\s*(==|<=|>=)\s*(\d+)/);
        if (countMatch) {
            const [, eventType, operator, countStr] = countMatch;
            const expectedCount = parseInt(countStr, 10);
            const result = assertionEngine.countEventsByType(eventType);
            let passed = false;
            switch (operator) {
                case '==':
                    passed = result.count === expectedCount;
                    break;
                case '<=':
                    passed = result.count <= expectedCount;
                    break;
                case '>=':
                    passed = result.count >= expectedCount;
                    break;
            }
            // INCONCLUSIVE if we expect an event but it's missing (could be timeout/lost)
            if (!passed && expectedCount > 0 && result.count === 0) {
                return {
                    passed: false,
                    expected: check,
                    actual: `count=${result.count}`,
                    inconclusive: true,
                    evidenceRefs: []
                };
            }
            return {
                passed,
                expected: check,
                actual: `count=${result.count}`,
                evidenceRefs: result.eventIds
            };
        }
        // Parse isUnique checks
        const uniqueMatch = check.match(/isUnique\(['"]([^'"]+)['"]\)/);
        if (uniqueMatch) {
            const [, fieldName] = uniqueMatch;
            const result = assertionEngine.isUnique(fieldName);
            return {
                passed: result.unique,
                expected: check,
                actual: result.unique ? 'unique' : `duplicate values: ${result.values.join(', ')}`,
                evidenceRefs: result.eventIds
            };
        }
        // Parse hasSequence checks
        const seqMatch = check.match(/hasSequence\(\[([^\]]+)\]\)/);
        if (seqMatch) {
            const [, seqStr] = seqMatch;
            const eventTypes = seqStr.split(',').map(s => s.trim().replace(/['"]/g, ''));
            const result = assertionEngine.hasSequence(eventTypes);
            return {
                passed: result.found,
                expected: check,
                actual: result.found ? 'sequence found' : 'sequence not found',
                evidenceRefs: result.eventIds
            };
        }
        // Unknown check format - return INCONCLUSIVE
        return {
            passed: false,
            expected: check,
            actual: 'Unknown check format',
            inconclusive: true,
            evidenceRefs: []
        };
    }
}
exports.ScenarioEngine = ScenarioEngine;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2NlbmFyaW9FbmdpbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvcnVuL1NjZW5hcmlvRW5naW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLG9DQUE4QztBQUM5QyxvQ0FBMEQ7QUFDMUQsMENBQWdEO0FBQ2hELDRDQUF3RDtBQXlCeEQ7Ozs7Ozs7Ozs7O0dBV0c7QUFDSCxNQUFhLGNBQWM7SUFBM0I7UUFDVSxlQUFVLEdBQUcsQ0FBQyxDQUFDO0lBOFN6QixDQUFDO0lBNVNDOztPQUVHO0lBQ0gsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFpQjtRQUM3QixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDbkMsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxPQUFPLENBQUMsQ0FBQztRQUVoRSwyQ0FBMkM7UUFDM0MsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUV0Qiw0QkFBNEI7UUFDNUIsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLDRCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRXZELDBCQUEwQjtRQUMxQixNQUFNLGVBQWUsR0FBRyxJQUFJLDJCQUFlLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUUvRCx3QkFBd0I7UUFDeEIsTUFBTSxhQUFhLEdBQUcsSUFBSSxxQkFBYSxFQUFFLENBQUM7UUFFMUMsZ0NBQWdDO1FBQ2hDLEtBQUssTUFBTSxLQUFLLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUMzQyxhQUFhLENBQUMsYUFBYSxDQUFDLEtBQXdCLENBQUMsQ0FBQztRQUN4RCxDQUFDO1FBRUQsZ0JBQWdCO1FBQ2hCLE1BQU0sTUFBTSxHQUFHLElBQUksR0FBRyxFQUFpQixDQUFDO1FBQ3hDLEtBQUssTUFBTSxXQUFXLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNqRCxNQUFNLEtBQUssR0FBRyxJQUFJLGFBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRTtnQkFDN0MsS0FBSyxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7Z0JBQ3BCLGlCQUFpQixDQUFDLE1BQU0sQ0FBQztvQkFDdkIsU0FBUyxFQUFFLEtBQUssQ0FBQyxTQUFTO29CQUMxQixLQUFLLEVBQUUsS0FBSyxDQUFDLE9BQU87b0JBQ3BCLFNBQVMsRUFBRSxLQUFLLENBQUMsU0FBUztvQkFDMUIsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJO2lCQUNqQixDQUFDLENBQUM7WUFDTCxDQUFDLENBQUMsQ0FBQztZQUNILE1BQU0sQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNwQyxDQUFDO1FBRUQsbUJBQW1CO1FBQ25CLGlCQUFpQixDQUFDLE1BQU0sQ0FBQztZQUN2QixTQUFTLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRTtZQUNyQixLQUFLLEVBQUUsUUFBUTtZQUNmLFNBQVMsRUFBRSxhQUFhO1lBQ3hCLElBQUksRUFBRSxFQUFFLFVBQVUsRUFBRSxNQUFNLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxJQUFJLEVBQUU7U0FDL0MsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDO1lBQ0gseUJBQXlCO1lBQ3pCLEtBQUssTUFBTSxJQUFJLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDNUMsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDLGFBQWEsRUFBRSxpQkFBaUIsRUFBRSxhQUFhLENBQUMsQ0FBQztZQUMvRixDQUFDO1lBRUQsd0JBQXdCO1lBQ3hCLGlCQUFpQixDQUFDLE1BQU0sQ0FBQztnQkFDdkIsU0FBUyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUU7Z0JBQ3JCLEtBQUssRUFBRSxRQUFRO2dCQUNmLFNBQVMsRUFBRSxlQUFlO2dCQUMxQixJQUFJLEVBQUUsRUFBRSxVQUFVLEVBQUUsTUFBTSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUU7YUFDekMsQ0FBQyxDQUFDO1lBRUgsdURBQXVEO1lBQ3ZELE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyx5QkFBeUIsQ0FDbEQsZUFBZSxFQUNmLE1BQU0sQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUMzQixDQUFDO1lBRUYsTUFBTSxPQUFPLEdBQUcsZUFBZSxDQUFDLFdBQVcsQ0FDekMsS0FBSyxFQUNMLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUNsQixNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFDMUIsYUFBYSxDQUNkLENBQUM7WUFFRixPQUFPO2dCQUNMLEtBQUs7Z0JBQ0wsVUFBVSxFQUFFLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRTtnQkFDOUIsSUFBSTtnQkFDSixTQUFTLEVBQUUsaUJBQWlCLENBQUMsYUFBYSxFQUFFLENBQUMsT0FBTyxDQUFDLFNBQVM7Z0JBQzlELE9BQU8sRUFBRSxpQkFBaUIsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxPQUFPLENBQUMsT0FBTztnQkFDMUQsT0FBTztnQkFDUCxNQUFNLEVBQUUsT0FBTyxDQUFDLE9BQU8sS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLE9BQU8sS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsY0FBYzthQUMxRyxDQUFDO1FBQ0osQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixxQkFBcUI7WUFDckIsaUJBQWlCLENBQUMsTUFBTSxDQUFDO2dCQUN2QixTQUFTLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRTtnQkFDckIsS0FBSyxFQUFFLFFBQVE7Z0JBQ2YsU0FBUyxFQUFFLFlBQVk7Z0JBQ3ZCLElBQUksRUFBRSxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUU7YUFDL0IsQ0FBQyxDQUFDO1lBRUgsT0FBTztnQkFDTCxLQUFLO2dCQUNMLFVBQVUsRUFBRSxNQUFNLENBQUMsUUFBUSxDQUFDLEVBQUU7Z0JBQzlCLElBQUk7Z0JBQ0osU0FBUyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUU7Z0JBQ3JCLE9BQU8sRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFO2dCQUNuQixPQUFPLEVBQUU7b0JBQ1AsS0FBSztvQkFDTCxVQUFVLEVBQUUsTUFBTSxDQUFDLFFBQVEsQ0FBQyxFQUFFO29CQUM5QixPQUFPLEVBQUUsY0FBYztvQkFDdkIsVUFBVSxFQUFFLEVBQUU7b0JBQ2QsTUFBTSxFQUFFLGVBQWUsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFO29CQUN0QyxTQUFTLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRTtpQkFDdEI7Z0JBQ0QsTUFBTSxFQUFFLGNBQWM7YUFDdkIsQ0FBQztRQUNKLENBQUM7SUFDSCxDQUFDO0lBRUQ7O09BRUc7SUFDSyxhQUFhO1FBQ25CLE9BQU8sT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7SUFDbEQsQ0FBQztJQUVEOztPQUVHO0lBQ0ssVUFBVSxDQUFDLElBQVk7UUFDN0IsbUNBQW1DO1FBQ25DLElBQUksS0FBSyxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsTUFBTSxHQUFHLEdBQUcsRUFBRTtZQUNqQixLQUFLLEdBQUcsQ0FBQyxLQUFLLEdBQUcsVUFBVSxHQUFHLEtBQUssQ0FBQyxHQUFHLFVBQVUsQ0FBQztZQUNsRCxPQUFPLEtBQUssR0FBRyxVQUFVLENBQUM7UUFDNUIsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVEOztPQUVHO0lBQ0ssS0FBSyxDQUFDLFdBQVcsQ0FDdkIsSUFBNkUsRUFDN0UsTUFBMEIsRUFDMUIsYUFBNEIsRUFDNUIsaUJBQW9DLEVBQ3BDLGFBQTRCO1FBRTVCLCtEQUErRDtRQUMvRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUUxRCxLQUFLLE1BQU0sT0FBTyxJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQy9CLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7WUFFbEMsSUFBSSxLQUFLLEVBQUUsQ0FBQztnQkFDViw4QkFBOEI7Z0JBQzlCLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDakMsS0FBSyxNQUFNLEtBQUssSUFBSSxNQUFNLEVBQUUsQ0FBQztvQkFDM0IsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLEtBQUssRUFBRSxDQUFDO3dCQUN6QixNQUFNLGFBQWEsQ0FBQyxTQUFTLENBQUM7NEJBQzVCLElBQUksRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUs7NEJBQ3pCLElBQUksRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFOzRCQUNsRCxTQUFTLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRTt5QkFDdEIsQ0FBQyxDQUFDO29CQUNMLENBQUM7Z0JBQ0gsQ0FBQztnQkFFRCwrQkFBK0I7Z0JBQy9CLE1BQU0sTUFBTSxHQUFHLE1BQU0sS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO2dCQUVyRSxrQkFBa0I7Z0JBQ2xCLGlCQUFpQixDQUFDLE1BQU0sQ0FBQztvQkFDdkIsU0FBUyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUU7b0JBQ3JCLEtBQUssRUFBRSxPQUFPO29CQUNkLFNBQVMsRUFBRSxVQUFVLElBQUksQ0FBQyxNQUFNLEVBQUU7b0JBQ2xDLElBQUksRUFBRSxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVcsRUFBRTtpQkFDaEQsQ0FBQyxDQUFDO2dCQUVILGlDQUFpQztnQkFDakMsSUFBSSxhQUFhLEVBQUUsQ0FBQztvQkFDbEIsTUFBTSxZQUFZLEdBQUcsTUFBTSxhQUFhLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUU7d0JBQzVELE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBYTtxQkFDM0IsQ0FBQyxDQUFDO29CQUVILGlCQUFpQixDQUFDLE1BQU0sQ0FBQzt3QkFDdkIsU0FBUyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUU7d0JBQ3JCLEtBQUssRUFBRSxRQUFRO3dCQUNmLFNBQVMsRUFBRSxVQUFVLElBQUksQ0FBQyxNQUFNLEVBQUU7d0JBQ2xDLElBQUksRUFBRSxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUU7cUJBQy9CLENBQUMsQ0FBQztnQkFDTCxDQUFDO1lBQ0gsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLDBCQUEwQjtnQkFDMUIsaUJBQWlCLENBQUMsTUFBTSxDQUFDO29CQUN2QixTQUFTLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRTtvQkFDckIsS0FBSyxFQUFFLE9BQU87b0JBQ2QsU0FBUyxFQUFFLFVBQVUsSUFBSSxDQUFDLE1BQU0sRUFBRTtvQkFDbEMsSUFBSSxFQUFFLEVBQUUsV0FBVyxFQUFFLElBQUksQ0FBQyxXQUFXLEVBQUU7aUJBQ3hDLENBQUMsQ0FBQztZQUNMLENBQUM7UUFDSCxDQUFDO0lBQ0gsQ0FBQztJQUVEOztPQUVHO0lBQ0sseUJBQXlCLENBQy9CLGVBQWdDLEVBQ2hDLFVBQStCO1FBRS9CLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxFQUFpSSxDQUFDO1FBRXJKLEtBQUssTUFBTSxTQUFTLElBQUksVUFBVSxFQUFFLENBQUM7WUFDbkMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxlQUFlLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUN2RixDQUFDO1FBRUQsT0FBTyxHQUFHLENBQUM7SUFDYixDQUFDO0lBRUQ7Ozs7OztPQU1HO0lBQ0ssc0JBQXNCLENBQzVCLGVBQWdDLEVBQ2hDLFNBQTRCO1FBRTVCLE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUM7UUFFOUIsaUNBQWlDO1FBQ2pDLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsNERBQTRELENBQUMsQ0FBQztRQUU3RixJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ2YsTUFBTSxDQUFDLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxRQUFRLENBQUMsR0FBRyxVQUFVLENBQUM7WUFDckQsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUM3QyxNQUFNLE1BQU0sR0FBRyxlQUFlLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFNUQsSUFBSSxNQUFNLEdBQUcsS0FBSyxDQUFDO1lBQ25CLFFBQVEsUUFBUSxFQUFFLENBQUM7Z0JBQ2pCLEtBQUssSUFBSTtvQkFDUCxNQUFNLEdBQUcsTUFBTSxDQUFDLEtBQUssS0FBSyxhQUFhLENBQUM7b0JBQ3hDLE1BQU07Z0JBQ1IsS0FBSyxJQUFJO29CQUNQLE1BQU0sR0FBRyxNQUFNLENBQUMsS0FBSyxJQUFJLGFBQWEsQ0FBQztvQkFDdkMsTUFBTTtnQkFDUixLQUFLLElBQUk7b0JBQ1AsTUFBTSxHQUFHLE1BQU0sQ0FBQyxLQUFLLElBQUksYUFBYSxDQUFDO29CQUN2QyxNQUFNO1lBQ1YsQ0FBQztZQUVELDhFQUE4RTtZQUM5RSxJQUFJLENBQUMsTUFBTSxJQUFJLGFBQWEsR0FBRyxDQUFDLElBQUksTUFBTSxDQUFDLEtBQUssS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDdkQsT0FBTztvQkFDTCxNQUFNLEVBQUUsS0FBSztvQkFDYixRQUFRLEVBQUUsS0FBSztvQkFDZixNQUFNLEVBQUUsU0FBUyxNQUFNLENBQUMsS0FBSyxFQUFFO29CQUMvQixZQUFZLEVBQUUsSUFBSTtvQkFDbEIsWUFBWSxFQUFFLEVBQUU7aUJBQ2pCLENBQUM7WUFDSixDQUFDO1lBRUQsT0FBTztnQkFDTCxNQUFNO2dCQUNOLFFBQVEsRUFBRSxLQUFLO2dCQUNmLE1BQU0sRUFBRSxTQUFTLE1BQU0sQ0FBQyxLQUFLLEVBQUU7Z0JBQy9CLFlBQVksRUFBRSxNQUFNLENBQUMsUUFBUTthQUM5QixDQUFDO1FBQ0osQ0FBQztRQUVELHdCQUF3QjtRQUN4QixNQUFNLFdBQVcsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLDhCQUE4QixDQUFDLENBQUM7UUFDaEUsSUFBSSxXQUFXLEVBQUUsQ0FBQztZQUNoQixNQUFNLENBQUMsRUFBRSxTQUFTLENBQUMsR0FBRyxXQUFXLENBQUM7WUFDbEMsTUFBTSxNQUFNLEdBQUcsZUFBZSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNuRCxPQUFPO2dCQUNMLE1BQU0sRUFBRSxNQUFNLENBQUMsTUFBTTtnQkFDckIsUUFBUSxFQUFFLEtBQUs7Z0JBQ2YsTUFBTSxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMscUJBQXFCLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFO2dCQUNsRixZQUFZLEVBQUUsTUFBTSxDQUFDLFFBQVE7YUFDOUIsQ0FBQztRQUNKLENBQUM7UUFFRCwyQkFBMkI7UUFDM0IsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1FBQzVELElBQUksUUFBUSxFQUFFLENBQUM7WUFDYixNQUFNLENBQUMsRUFBRSxNQUFNLENBQUMsR0FBRyxRQUFRLENBQUM7WUFDNUIsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzdFLE1BQU0sTUFBTSxHQUFHLGVBQWUsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDdkQsT0FBTztnQkFDTCxNQUFNLEVBQUUsTUFBTSxDQUFDLEtBQUs7Z0JBQ3BCLFFBQVEsRUFBRSxLQUFLO2dCQUNmLE1BQU0sRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsb0JBQW9CO2dCQUM5RCxZQUFZLEVBQUUsTUFBTSxDQUFDLFFBQVE7YUFDOUIsQ0FBQztRQUNKLENBQUM7UUFFRCw2Q0FBNkM7UUFDN0MsT0FBTztZQUNMLE1BQU0sRUFBRSxLQUFLO1lBQ2IsUUFBUSxFQUFFLEtBQUs7WUFDZixNQUFNLEVBQUUsc0JBQXNCO1lBQzlCLFlBQVksRUFBRSxJQUFJO1lBQ2xCLFlBQVksRUFBRSxFQUFFO1NBQ2pCLENBQUM7SUFDSixDQUFDO0NBQ0Y7QUEvU0Qsd0NBK1NDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgU2NlbmFyaW9EZWZpbml0aW9uLCBTY2VuYXJpb0ludmFyaWFudCB9IGZyb20gJy4uL3NjZW5hcmlvJztcbmltcG9ydCB7IEFnZW50LCBBZ2VudENvbmZpZyB9IGZyb20gJy4uL2FnZW50JztcbmltcG9ydCB7IEZhdWx0SW5qZWN0b3IsIEZhdWx0RGVmaW5pdGlvbiB9IGZyb20gJy4uL2ZhdWx0JztcbmltcG9ydCB7IEV2aWRlbmNlQ29sbGVjdG9yIH0gZnJvbSAnLi4vZXZpZGVuY2UnO1xuaW1wb3J0IHsgQXNzZXJ0aW9uRW5naW5lLCBWZXJkaWN0IH0gZnJvbSAnLi4vYXNzZXJ0aW9uJztcbmltcG9ydCB7IFRhcmdldEFkYXB0ZXIgfSBmcm9tICcuLi90YXJnZXQnO1xuXG4vKipcbiAqIFJ1biBDb25maWd1cmF0aW9uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgUnVuQ29uZmlnIHtcbiAgc2NlbmFyaW86IFNjZW5hcmlvRGVmaW5pdGlvbjtcbiAgc2VlZD86IG51bWJlcjtcbiAgdGFyZ2V0QWRhcHRlcjogVGFyZ2V0QWRhcHRlcjtcbn1cblxuLyoqXG4gKiBSdW4gUmVzdWx0IC0gY29tcGxldGUgcmVzdWx0IG9mIGEgc2NlbmFyaW8gZXhlY3V0aW9uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgUnVuUmVzdWx0IHtcbiAgcnVuSWQ6IHN0cmluZztcbiAgc2NlbmFyaW9JZDogc3RyaW5nO1xuICBzZWVkOiBudW1iZXI7XG4gIHN0YXJ0VGltZTogbnVtYmVyO1xuICBlbmRUaW1lOiBudW1iZXI7XG4gIHZlcmRpY3Q6IFZlcmRpY3Q7XG4gIHN0YXR1czogJ2NvbXBsZXRlZCcgfCAnZmFpbGVkJyB8ICdpbmNvbmNsdXNpdmUnO1xufVxuXG4vKipcbiAqIFNjZW5hcmlvIEVuZ2luZSAtIG9yY2hlc3RyYXRlcyBzY2VuYXJpbyBleGVjdXRpb25cbiAqIFxuICogTGlmZWN5Y2xlOlxuICogMS4gQ3JlYXRlIHJ1bklkXG4gKiAyLiBBY2NlcHQgU2NlbmFyaW8gRGVmaW5pdGlvblxuICogMy4gVXNlIGRldGVybWluaXN0aWMgc2VlZFxuICogNC4gUnVuIHNjZW5hcmlvXG4gKiA1LiBSZWNvcmQgZXZlbnRzXG4gKiA2LiBFeGVjdXRlIGFzc2VydGlvbnNcbiAqIDcuIEZvcm0gdmVyZGljdFxuICovXG5leHBvcnQgY2xhc3MgU2NlbmFyaW9FbmdpbmUge1xuICBwcml2YXRlIHJ1bkNvdW50ZXIgPSAwO1xuXG4gIC8qKlxuICAgKiBFeGVjdXRlIGEgc2NlbmFyaW8gYW5kIHJldHVybiB0aGUgcmVzdWx0XG4gICAqL1xuICBhc3luYyBleGVjdXRlKGNvbmZpZzogUnVuQ29uZmlnKTogUHJvbWlzZTxSdW5SZXN1bHQ+IHtcbiAgICBjb25zdCBydW5JZCA9IHRoaXMuZ2VuZXJhdGVSdW5JZCgpO1xuICAgIGNvbnN0IHNlZWQgPSBjb25maWcuc2VlZCA/PyBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMDAwMDAwKTtcbiAgICBcbiAgICAvLyBJbml0aWFsaXplIHNlZWRlZCByYW5kb20gZm9yIGRldGVybWluaXNtXG4gICAgdGhpcy5zZWVkUmFuZG9tKHNlZWQpO1xuXG4gICAgLy8gQ3JlYXRlIGV2aWRlbmNlIGNvbGxlY3RvclxuICAgIGNvbnN0IGV2aWRlbmNlQ29sbGVjdG9yID0gbmV3IEV2aWRlbmNlQ29sbGVjdG9yKHJ1bklkKTtcbiAgICBcbiAgICAvLyBDcmVhdGUgYXNzZXJ0aW9uIGVuZ2luZVxuICAgIGNvbnN0IGFzc2VydGlvbkVuZ2luZSA9IG5ldyBBc3NlcnRpb25FbmdpbmUoZXZpZGVuY2VDb2xsZWN0b3IpO1xuXG4gICAgLy8gQ3JlYXRlIGZhdWx0IGluamVjdG9yXG4gICAgY29uc3QgZmF1bHRJbmplY3RvciA9IG5ldyBGYXVsdEluamVjdG9yKCk7XG4gICAgXG4gICAgLy8gUmVnaXN0ZXIgZmF1bHRzIGZyb20gc2NlbmFyaW9cbiAgICBmb3IgKGNvbnN0IGZhdWx0IG9mIGNvbmZpZy5zY2VuYXJpby5mYXVsdHMpIHtcbiAgICAgIGZhdWx0SW5qZWN0b3IucmVnaXN0ZXJGYXVsdChmYXVsdCBhcyBGYXVsdERlZmluaXRpb24pO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSBhZ2VudHNcbiAgICBjb25zdCBhZ2VudHMgPSBuZXcgTWFwPHN0cmluZywgQWdlbnQ+KCk7XG4gICAgZm9yIChjb25zdCBhZ2VudENvbmZpZyBvZiBjb25maWcuc2NlbmFyaW8uYWdlbnRzKSB7XG4gICAgICBjb25zdCBhZ2VudCA9IG5ldyBBZ2VudChhZ2VudENvbmZpZywgKGV2ZW50KSA9PiB7XG4gICAgICAgIGV2ZW50LnJ1bklkID0gcnVuSWQ7XG4gICAgICAgIGV2aWRlbmNlQ29sbGVjdG9yLnJlY29yZCh7XG4gICAgICAgICAgdGltZXN0YW1wOiBldmVudC50aW1lc3RhbXAsXG4gICAgICAgICAgYWN0b3I6IGV2ZW50LmFnZW50SWQsXG4gICAgICAgICAgZXZlbnRUeXBlOiBldmVudC5ldmVudFR5cGUsXG4gICAgICAgICAgZGF0YTogZXZlbnQuZGF0YVxuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgICAgYWdlbnRzLnNldChhZ2VudENvbmZpZy5pZCwgYWdlbnQpO1xuICAgIH1cblxuICAgIC8vIFJlY29yZCBydW4gc3RhcnRcbiAgICBldmlkZW5jZUNvbGxlY3Rvci5yZWNvcmQoe1xuICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgYWN0b3I6ICdzeXN0ZW0nLFxuICAgICAgZXZlbnRUeXBlOiAncnVuLnN0YXJ0ZWQnLFxuICAgICAgZGF0YTogeyBzY2VuYXJpb0lkOiBjb25maWcuc2NlbmFyaW8uaWQsIHNlZWQgfVxuICAgIH0pO1xuXG4gICAgdHJ5IHtcbiAgICAgIC8vIEV4ZWN1dGUgdGltZWxpbmUgc3RlcHNcbiAgICAgIGZvciAoY29uc3Qgc3RlcCBvZiBjb25maWcuc2NlbmFyaW8udGltZWxpbmUpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5leGVjdXRlU3RlcChzdGVwLCBhZ2VudHMsIGNvbmZpZy50YXJnZXRBZGFwdGVyLCBldmlkZW5jZUNvbGxlY3RvciwgZmF1bHRJbmplY3Rvcik7XG4gICAgICB9XG5cbiAgICAgIC8vIFJlY29yZCBydW4gY29tcGxldGlvblxuICAgICAgZXZpZGVuY2VDb2xsZWN0b3IucmVjb3JkKHtcbiAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgICBhY3RvcjogJ3N5c3RlbScsXG4gICAgICAgIGV2ZW50VHlwZTogJ3J1bi5jb21wbGV0ZWQnLFxuICAgICAgICBkYXRhOiB7IHNjZW5hcmlvSWQ6IGNvbmZpZy5zY2VuYXJpby5pZCB9XG4gICAgICB9KTtcblxuICAgICAgLy8gRXZhbHVhdGUgaW52YXJpYW50cyB1c2luZyByZWFsIGV2aWRlbmNlLWJhc2VkIGNoZWNrc1xuICAgICAgY29uc3QgZXZhbHVhdGlvbkZucyA9IHRoaXMuY3JlYXRlRXZhbHVhdGlvbkZ1bmN0aW9ucyhcbiAgICAgICAgYXNzZXJ0aW9uRW5naW5lLFxuICAgICAgICBjb25maWcuc2NlbmFyaW8uaW52YXJpYW50c1xuICAgICAgKTtcblxuICAgICAgY29uc3QgdmVyZGljdCA9IGFzc2VydGlvbkVuZ2luZS5ldmFsdWF0ZUFsbChcbiAgICAgICAgcnVuSWQsXG4gICAgICAgIGNvbmZpZy5zY2VuYXJpby5pZCxcbiAgICAgICAgY29uZmlnLnNjZW5hcmlvLmludmFyaWFudHMsXG4gICAgICAgIGV2YWx1YXRpb25GbnNcbiAgICAgICk7XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJ1bklkLFxuICAgICAgICBzY2VuYXJpb0lkOiBjb25maWcuc2NlbmFyaW8uaWQsXG4gICAgICAgIHNlZWQsXG4gICAgICAgIHN0YXJ0VGltZTogZXZpZGVuY2VDb2xsZWN0b3IuYnVpbGRFdmlkZW5jZSgpLnN1bW1hcnkuc3RhcnRUaW1lLFxuICAgICAgICBlbmRUaW1lOiBldmlkZW5jZUNvbGxlY3Rvci5idWlsZEV2aWRlbmNlKCkuc3VtbWFyeS5lbmRUaW1lLFxuICAgICAgICB2ZXJkaWN0LFxuICAgICAgICBzdGF0dXM6IHZlcmRpY3Qub3V0Y29tZSA9PT0gJ1BBU1MnID8gJ2NvbXBsZXRlZCcgOiB2ZXJkaWN0Lm91dGNvbWUgPT09ICdGQUlMJyA/ICdmYWlsZWQnIDogJ2luY29uY2x1c2l2ZSdcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIC8vIFJlY29yZCBydW4gZmFpbHVyZVxuICAgICAgZXZpZGVuY2VDb2xsZWN0b3IucmVjb3JkKHtcbiAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgICBhY3RvcjogJ3N5c3RlbScsXG4gICAgICAgIGV2ZW50VHlwZTogJ3J1bi5mYWlsZWQnLFxuICAgICAgICBkYXRhOiB7IGVycm9yOiBTdHJpbmcoZXJyb3IpIH1cbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBydW5JZCxcbiAgICAgICAgc2NlbmFyaW9JZDogY29uZmlnLnNjZW5hcmlvLmlkLFxuICAgICAgICBzZWVkLFxuICAgICAgICBzdGFydFRpbWU6IERhdGUubm93KCksXG4gICAgICAgIGVuZFRpbWU6IERhdGUubm93KCksXG4gICAgICAgIHZlcmRpY3Q6IHtcbiAgICAgICAgICBydW5JZCxcbiAgICAgICAgICBzY2VuYXJpb0lkOiBjb25maWcuc2NlbmFyaW8uaWQsXG4gICAgICAgICAgb3V0Y29tZTogJ0lOQ09OQ0xVU0lWRScsXG4gICAgICAgICAgYXNzZXJ0aW9uczogW10sXG4gICAgICAgICAgcmVhc29uOiBgUnVuIGZhaWxlZDogJHtTdHJpbmcoZXJyb3IpfWAsXG4gICAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpXG4gICAgICAgIH0sXG4gICAgICAgIHN0YXR1czogJ2luY29uY2x1c2l2ZSdcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEdlbmVyYXRlIHVuaXF1ZSBydW4gSURcbiAgICovXG4gIHByaXZhdGUgZ2VuZXJhdGVSdW5JZCgpOiBzdHJpbmcge1xuICAgIHJldHVybiBgcnVuLSR7RGF0ZS5ub3coKX0tJHsrK3RoaXMucnVuQ291bnRlcn1gO1xuICB9XG5cbiAgLyoqXG4gICAqIFNlZWQgcmFuZG9tIG51bWJlciBnZW5lcmF0b3IgZm9yIGRldGVybWluaXN0aWMgcnVuc1xuICAgKi9cbiAgcHJpdmF0ZSBzZWVkUmFuZG9tKHNlZWQ6IG51bWJlcik6IHZvaWQge1xuICAgIC8vIFNpbXBsZSBMQ0cgZm9yIHNlZWRlZCByYW5kb21uZXNzXG4gICAgbGV0IHN0YXRlID0gc2VlZDtcbiAgICBNYXRoLnJhbmRvbSA9ICgpID0+IHtcbiAgICAgIHN0YXRlID0gKHN0YXRlICogMTEwMzUxNTI0NSArIDEyMzQ1KSAmIDB4N2ZmZmZmZmY7XG4gICAgICByZXR1cm4gc3RhdGUgLyAweDdmZmZmZmZmO1xuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogRXhlY3V0ZSBhIHNpbmdsZSB0aW1lbGluZSBzdGVwXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVTdGVwKFxuICAgIHN0ZXA6IHsgc3RlcElkOiBzdHJpbmc7IGFjdGlvbjogc3RyaW5nOyBhY3Rvcjogc3RyaW5nOyBkZXNjcmlwdGlvbj86IHN0cmluZyB9LFxuICAgIGFnZW50czogTWFwPHN0cmluZywgQWdlbnQ+LFxuICAgIHRhcmdldEFkYXB0ZXI6IFRhcmdldEFkYXB0ZXIsXG4gICAgZXZpZGVuY2VDb2xsZWN0b3I6IEV2aWRlbmNlQ29sbGVjdG9yLFxuICAgIGZhdWx0SW5qZWN0b3I6IEZhdWx0SW5qZWN0b3JcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgLy8gUGFyc2UgYWN0b3JzIChtYXkgYmUgY29tbWEtc2VwYXJhdGVkIGZvciBjb25jdXJyZW50IGFjdGlvbnMpXG4gICAgY29uc3QgYWN0b3JJZHMgPSBzdGVwLmFjdG9yLnNwbGl0KCcsJykubWFwKGEgPT4gYS50cmltKCkpO1xuICAgIFxuICAgIGZvciAoY29uc3QgYWN0b3JJZCBvZiBhY3Rvcklkcykge1xuICAgICAgY29uc3QgYWdlbnQgPSBhZ2VudHMuZ2V0KGFjdG9ySWQpO1xuICAgICAgXG4gICAgICBpZiAoYWdlbnQpIHtcbiAgICAgICAgLy8gQ2hlY2sgZm9yIGFwcGxpY2FibGUgZmF1bHRzXG4gICAgICAgIGNvbnN0IGZhdWx0cyA9IGFnZW50LmdldEZhdWx0cygpO1xuICAgICAgICBmb3IgKGNvbnN0IGZhdWx0IG9mIGZhdWx0cykge1xuICAgICAgICAgIGlmIChmYXVsdC50cmlnZ2VyPy5ldmVudCkge1xuICAgICAgICAgICAgYXdhaXQgZmF1bHRJbmplY3Rvci5lbWl0RXZlbnQoe1xuICAgICAgICAgICAgICB0eXBlOiBmYXVsdC50cmlnZ2VyLmV2ZW50LFxuICAgICAgICAgICAgICBkYXRhOiB7IGFjdGlvbjogc3RlcC5hY3Rpb24sIHN0ZXBJZDogc3RlcC5zdGVwSWQgfSxcbiAgICAgICAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBFeGVjdXRlIGFjdGlvbiB0aHJvdWdoIGFnZW50XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFnZW50LmFjdChzdGVwLmFjdGlvbiwgeyBzdGVwSWQ6IHN0ZXAuc3RlcElkIH0pO1xuICAgICAgICBcbiAgICAgICAgLy8gUmVjb3JkIGV2aWRlbmNlXG4gICAgICAgIGV2aWRlbmNlQ29sbGVjdG9yLnJlY29yZCh7XG4gICAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgICAgIGFjdG9yOiBhY3RvcklkLFxuICAgICAgICAgIGV2ZW50VHlwZTogYGFjdGlvbi4ke3N0ZXAuYWN0aW9ufWAsXG4gICAgICAgICAgZGF0YTogeyByZXN1bHQsIGRlc2NyaXB0aW9uOiBzdGVwLmRlc2NyaXB0aW9uIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQWxzbyBleGVjdXRlIG9uIHRhcmdldCBhZGFwdGVyXG4gICAgICAgIGlmICh0YXJnZXRBZGFwdGVyKSB7XG4gICAgICAgICAgY29uc3QgdGFyZ2V0UmVzdWx0ID0gYXdhaXQgdGFyZ2V0QWRhcHRlci5leGVjdXRlKHN0ZXAuYWN0aW9uLCB7XG4gICAgICAgICAgICBhY3Rpb246IHN0ZXAuYWN0aW9uIGFzIGFueVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIFxuICAgICAgICAgIGV2aWRlbmNlQ29sbGVjdG9yLnJlY29yZCh7XG4gICAgICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgICAgICAgICBhY3RvcjogJ3RhcmdldCcsXG4gICAgICAgICAgICBldmVudFR5cGU6IGB0YXJnZXQuJHtzdGVwLmFjdGlvbn1gLFxuICAgICAgICAgICAgZGF0YTogeyByZXN1bHQ6IHRhcmdldFJlc3VsdCB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFN5c3RlbSBvciB1bmtub3duIGFjdG9yXG4gICAgICAgIGV2aWRlbmNlQ29sbGVjdG9yLnJlY29yZCh7XG4gICAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgICAgIGFjdG9yOiBhY3RvcklkLFxuICAgICAgICAgIGV2ZW50VHlwZTogYHN5c3RlbS4ke3N0ZXAuYWN0aW9ufWAsXG4gICAgICAgICAgZGF0YTogeyBkZXNjcmlwdGlvbjogc3RlcC5kZXNjcmlwdGlvbiB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgZXZhbHVhdGlvbiBmdW5jdGlvbnMgZm9yIGludmFyaWFudHMgYmFzZWQgb24gYWN0dWFsIGV2aWRlbmNlXG4gICAqL1xuICBwcml2YXRlIGNyZWF0ZUV2YWx1YXRpb25GdW5jdGlvbnMoXG4gICAgYXNzZXJ0aW9uRW5naW5lOiBBc3NlcnRpb25FbmdpbmUsXG4gICAgaW52YXJpYW50czogU2NlbmFyaW9JbnZhcmlhbnRbXVxuICApOiBNYXA8c3RyaW5nLCAoKSA9PiB7IHBhc3NlZDogYm9vbGVhbjsgZXhwZWN0ZWQ6IHN0cmluZzsgYWN0dWFsOiBzdHJpbmcgfCBudW1iZXI7IGluY29uY2x1c2l2ZT86IGJvb2xlYW47IGV2aWRlbmNlUmVmcz86IHN0cmluZ1tdIH0+IHtcbiAgICBjb25zdCBmbnMgPSBuZXcgTWFwPHN0cmluZywgKCkgPT4geyBwYXNzZWQ6IGJvb2xlYW47IGV4cGVjdGVkOiBzdHJpbmc7IGFjdHVhbDogc3RyaW5nIHwgbnVtYmVyOyBpbmNvbmNsdXNpdmU/OiBib29sZWFuOyBldmlkZW5jZVJlZnM/OiBzdHJpbmdbXSB9PigpO1xuXG4gICAgZm9yIChjb25zdCBpbnZhcmlhbnQgb2YgaW52YXJpYW50cykge1xuICAgICAgZm5zLnNldChpbnZhcmlhbnQuaWQsICgpID0+IHRoaXMuZXZhbHVhdGVJbnZhcmlhbnRDaGVjayhhc3NlcnRpb25FbmdpbmUsIGludmFyaWFudCkpO1xuICAgIH1cblxuICAgIHJldHVybiBmbnM7XG4gIH1cblxuICAvKipcbiAgICogRXZhbHVhdGUgYSBzaW5nbGUgaW52YXJpYW50IGNoZWNrIHN0cmluZ1xuICAgKiBTdXBwb3J0czpcbiAgICogLSBjb3VudEV2ZW50c0J5VHlwZSgnZXZlbnRUeXBlJykgPT0gTlxuICAgKiAtIGNvdW50RXZlbnRzQnlUeXBlKCdldmVudFR5cGUnKSA8PSBOXG4gICAqIC0gY291bnRFdmVudHNCeVR5cGUoJ2V2ZW50VHlwZScpID49IE5cbiAgICovXG4gIHByaXZhdGUgZXZhbHVhdGVJbnZhcmlhbnRDaGVjayhcbiAgICBhc3NlcnRpb25FbmdpbmU6IEFzc2VydGlvbkVuZ2luZSxcbiAgICBpbnZhcmlhbnQ6IFNjZW5hcmlvSW52YXJpYW50XG4gICk6IHsgcGFzc2VkOiBib29sZWFuOyBleHBlY3RlZDogc3RyaW5nOyBhY3R1YWw6IHN0cmluZyB8IG51bWJlcjsgaW5jb25jbHVzaXZlPzogYm9vbGVhbjsgZXZpZGVuY2VSZWZzPzogc3RyaW5nW10gfSB7XG4gICAgY29uc3QgY2hlY2sgPSBpbnZhcmlhbnQuY2hlY2s7XG5cbiAgICAvLyBQYXJzZSBjb3VudEV2ZW50c0J5VHlwZSBjaGVja3NcbiAgICBjb25zdCBjb3VudE1hdGNoID0gY2hlY2subWF0Y2goL2NvdW50RXZlbnRzQnlUeXBlXFwoWydcIl0oW14nXCJdKylbJ1wiXVxcKVxccyooPT18PD18Pj0pXFxzKihcXGQrKS8pO1xuICAgIFxuICAgIGlmIChjb3VudE1hdGNoKSB7XG4gICAgICBjb25zdCBbLCBldmVudFR5cGUsIG9wZXJhdG9yLCBjb3VudFN0cl0gPSBjb3VudE1hdGNoO1xuICAgICAgY29uc3QgZXhwZWN0ZWRDb3VudCA9IHBhcnNlSW50KGNvdW50U3RyLCAxMCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhc3NlcnRpb25FbmdpbmUuY291bnRFdmVudHNCeVR5cGUoZXZlbnRUeXBlKTtcbiAgICAgIFxuICAgICAgbGV0IHBhc3NlZCA9IGZhbHNlO1xuICAgICAgc3dpdGNoIChvcGVyYXRvcikge1xuICAgICAgICBjYXNlICc9PSc6XG4gICAgICAgICAgcGFzc2VkID0gcmVzdWx0LmNvdW50ID09PSBleHBlY3RlZENvdW50O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICc8PSc6XG4gICAgICAgICAgcGFzc2VkID0gcmVzdWx0LmNvdW50IDw9IGV4cGVjdGVkQ291bnQ7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJz49JzpcbiAgICAgICAgICBwYXNzZWQgPSByZXN1bHQuY291bnQgPj0gZXhwZWN0ZWRDb3VudDtcbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgLy8gSU5DT05DTFVTSVZFIGlmIHdlIGV4cGVjdCBhbiBldmVudCBidXQgaXQncyBtaXNzaW5nIChjb3VsZCBiZSB0aW1lb3V0L2xvc3QpXG4gICAgICBpZiAoIXBhc3NlZCAmJiBleHBlY3RlZENvdW50ID4gMCAmJiByZXN1bHQuY291bnQgPT09IDApIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBwYXNzZWQ6IGZhbHNlLFxuICAgICAgICAgIGV4cGVjdGVkOiBjaGVjayxcbiAgICAgICAgICBhY3R1YWw6IGBjb3VudD0ke3Jlc3VsdC5jb3VudH1gLFxuICAgICAgICAgIGluY29uY2x1c2l2ZTogdHJ1ZSxcbiAgICAgICAgICBldmlkZW5jZVJlZnM6IFtdXG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHBhc3NlZCxcbiAgICAgICAgZXhwZWN0ZWQ6IGNoZWNrLFxuICAgICAgICBhY3R1YWw6IGBjb3VudD0ke3Jlc3VsdC5jb3VudH1gLFxuICAgICAgICBldmlkZW5jZVJlZnM6IHJlc3VsdC5ldmVudElkc1xuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBQYXJzZSBpc1VuaXF1ZSBjaGVja3NcbiAgICBjb25zdCB1bmlxdWVNYXRjaCA9IGNoZWNrLm1hdGNoKC9pc1VuaXF1ZVxcKFsnXCJdKFteJ1wiXSspWydcIl1cXCkvKTtcbiAgICBpZiAodW5pcXVlTWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGZpZWxkTmFtZV0gPSB1bmlxdWVNYXRjaDtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGFzc2VydGlvbkVuZ2luZS5pc1VuaXF1ZShmaWVsZE5hbWUpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgcGFzc2VkOiByZXN1bHQudW5pcXVlLFxuICAgICAgICBleHBlY3RlZDogY2hlY2ssXG4gICAgICAgIGFjdHVhbDogcmVzdWx0LnVuaXF1ZSA/ICd1bmlxdWUnIDogYGR1cGxpY2F0ZSB2YWx1ZXM6ICR7cmVzdWx0LnZhbHVlcy5qb2luKCcsICcpfWAsXG4gICAgICAgIGV2aWRlbmNlUmVmczogcmVzdWx0LmV2ZW50SWRzXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIFBhcnNlIGhhc1NlcXVlbmNlIGNoZWNrc1xuICAgIGNvbnN0IHNlcU1hdGNoID0gY2hlY2subWF0Y2goL2hhc1NlcXVlbmNlXFwoXFxbKFteXFxdXSspXFxdXFwpLyk7XG4gICAgaWYgKHNlcU1hdGNoKSB7XG4gICAgICBjb25zdCBbLCBzZXFTdHJdID0gc2VxTWF0Y2g7XG4gICAgICBjb25zdCBldmVudFR5cGVzID0gc2VxU3RyLnNwbGl0KCcsJykubWFwKHMgPT4gcy50cmltKCkucmVwbGFjZSgvWydcIl0vZywgJycpKTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGFzc2VydGlvbkVuZ2luZS5oYXNTZXF1ZW5jZShldmVudFR5cGVzKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHBhc3NlZDogcmVzdWx0LmZvdW5kLFxuICAgICAgICBleHBlY3RlZDogY2hlY2ssXG4gICAgICAgIGFjdHVhbDogcmVzdWx0LmZvdW5kID8gJ3NlcXVlbmNlIGZvdW5kJyA6ICdzZXF1ZW5jZSBub3QgZm91bmQnLFxuICAgICAgICBldmlkZW5jZVJlZnM6IHJlc3VsdC5ldmVudElkc1xuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBVbmtub3duIGNoZWNrIGZvcm1hdCAtIHJldHVybiBJTkNPTkNMVVNJVkVcbiAgICByZXR1cm4ge1xuICAgICAgcGFzc2VkOiBmYWxzZSxcbiAgICAgIGV4cGVjdGVkOiBjaGVjayxcbiAgICAgIGFjdHVhbDogJ1Vua25vd24gY2hlY2sgZm9ybWF0JyxcbiAgICAgIGluY29uY2x1c2l2ZTogdHJ1ZSxcbiAgICAgIGV2aWRlbmNlUmVmczogW11cbiAgICB9O1xuICB9XG59XG4iXX0=