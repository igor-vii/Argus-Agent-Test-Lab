import { describe, it, expect } from 'vitest';
import { RunOrchestrator } from '../../core/RunOrchestrator';
import { MockTargetAdapter } from '../../adapters/MockTargetAdapter';
import { AgentController } from '../../core/AgentController';
import { validateScenario } from '../../core/validateScenario';
import { S1_DuplicateRequest } from '../../scenarios/S1_DuplicateRequest';
import { S2_PaymentBeforeExecution } from '../../scenarios/S2_PaymentBeforeExecution';
import { S3_CrashAfterSettlement } from '../../scenarios/S3_CrashAfterSettlement';
import { S4_SellerTimeout } from '../../scenarios/S4_SellerTimeout';
import { S5_ConcurrentDuplicate } from '../../scenarios/S5_ConcurrentDuplicate';
import { S6_PaymentRetry } from '../../scenarios/S6_PaymentRetry';
import { S7_LostDelivery } from '../../scenarios/S7_LostDelivery';
describe('Canonical Scenarios S1-S7', () => {
    const scenarios = [
        { id: 'S1', def: S1_DuplicateRequest },
        { id: 'S2', def: S2_PaymentBeforeExecution },
        { id: 'S3', def: S3_CrashAfterSettlement },
        { id: 'S4', def: S4_SellerTimeout },
        { id: 'S5', def: S5_ConcurrentDuplicate },
        { id: 'S6', def: S6_PaymentRetry },
        { id: 'S7', def: S7_LostDelivery },
    ];
    scenarios.forEach(({ id, def }) => {
        it(`${id} - should execute and produce evidence with verdict`, async () => {
            const targetAdapter = new MockTargetAdapter('mock');
            const controller = new AgentController(targetAdapter, {
                connectionConfig: { transportType: 'mock' },
                runId: `run_${Date.now()}`
            });
            const controllers = new Map();
            // For S1-S7, all participants are EXTERNAL except buyer-1 which is ARGUS in some scenarios
            // We'll register the controller for any ARGUS participant
            for (const p of def.participants) {
                if (p.ownership === 'ARGUS') {
                    controllers.set(p.participantId, controller);
                }
            }
            // If no ARGUS participants, just use a default key
            if (controllers.size === 0) {
                controllers.set('default', controller);
            }
            const assertions = def.assertions || [];
            const orchestrator = new RunOrchestrator(def, controllers, assertions);
            const result = await orchestrator.run();
            expect(result.scenarioId).toBe(id);
            expect(result.evidenceCount).toBeGreaterThan(0);
            expect(result.verdict).toBeDefined();
            if (result.verdict) {
                expect(['PASS', 'FAIL', 'INCONCLUSIVE']).toContain(result.verdict.status);
            }
        });
    });
    it('S1 - should detect idempotency (PASS expected)', async () => {
        const targetAdapter = new MockTargetAdapter('mock');
        const controller = new AgentController(targetAdapter, {
            connectionConfig: { transportType: 'mock' },
            runId: `run_${Date.now()}`
        });
        const controllers = new Map();
        for (const p of S1_DuplicateRequest.participants) {
            if (p.ownership === 'ARGUS') {
                controllers.set(p.participantId, controller);
            }
        }
        if (controllers.size === 0) {
            controllers.set('default', controller);
        }
        const assertions = S1_DuplicateRequest.assertions || [];
        const orchestrator = new RunOrchestrator(S1_DuplicateRequest, controllers, assertions);
        const result = await orchestrator.run();
        // S1 ожидает PASS, так как идемпотентность работает корректно
        if (result.verdict) {
            expect(result.verdict.status).toBe('PASS');
        }
    });
    it('S2 - should pass validation (ARGUS-owned participants are valid sources)', () => {
        const result = validateScenario(S2_PaymentBeforeExecution);
        expect(result.valid).toBe(true);
        expect(result.errors.length).toBe(0);
    });
    it('S6 - should be inconclusive (scaffolding)', async () => {
        const targetAdapter = new MockTargetAdapter('mock');
        const controller = new AgentController(targetAdapter, {
            connectionConfig: { transportType: 'mock' },
            runId: `run_${Date.now()}`
        });
        const controllers = new Map();
        for (const p of S6_PaymentRetry.participants) {
            if (p.ownership === 'ARGUS') {
                controllers.set(p.participantId, controller);
            }
        }
        if (controllers.size === 0) {
            controllers.set('default', controller);
        }
        const assertions = S6_PaymentRetry.assertions || [];
        const orchestrator = new RunOrchestrator(S6_PaymentRetry, controllers, assertions);
        const result = await orchestrator.run();
        // S6 сейчас INCONCLUSIVE (scaffolding, Variant A)
        if (result.verdict) {
            expect(result.verdict.status).toBe('INCONCLUSIVE');
        }
    });
});
//# sourceMappingURL=S1-S7.test.js.map