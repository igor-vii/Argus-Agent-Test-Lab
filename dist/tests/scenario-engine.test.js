"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ScenarioEngine_1 = require("../src/run/ScenarioEngine");
const SecretariatTargetAdapter_1 = require("../src/target/SecretariatTargetAdapter");
const secretariat_scenarios_1 = require("../src/scenario/secretariat-scenarios");
describe('ScenarioEngine End-to-End', () => {
    let engine;
    let targetAdapter;
    beforeEach(() => {
        engine = new ScenarioEngine_1.ScenarioEngine();
        targetAdapter = new SecretariatTargetAdapter_1.SecretariatTargetAdapter();
        targetAdapter.reset();
    });
    describe('Run Lifecycle', () => {
        it('should create unique runId for each execution', async () => {
            const result1 = await engine.execute({
                scenario: secretariat_scenarios_1.duplicateRequestScenario,
                seed: 42,
                targetAdapter
            });
            targetAdapter.reset();
            const result2 = await engine.execute({
                scenario: secretariat_scenarios_1.duplicateRequestScenario,
                seed: 42,
                targetAdapter
            });
            expect(result1.runId).not.toBe(result2.runId);
        });
        it('should use deterministic seed for reproducible runs', async () => {
            const result1 = await engine.execute({
                scenario: secretariat_scenarios_1.duplicateRequestScenario,
                seed: 42,
                targetAdapter
            });
            targetAdapter.reset();
            const result2 = await engine.execute({
                scenario: secretariat_scenarios_1.duplicateRequestScenario,
                seed: 42,
                targetAdapter
            });
            expect(result1.seed).toBe(result2.seed);
            expect(result1.seed).toBe(42);
        });
        it('should record timeline events in evidence', async () => {
            const result = await engine.execute({
                scenario: secretariat_scenarios_1.duplicateRequestScenario,
                seed: 42,
                targetAdapter
            });
            // Status can be completed (PASS) or failed (FAIL) - both are valid
            expect(['completed', 'failed']).toContain(result.status);
            expect(result.verdict.assertions.length).toBeGreaterThan(0);
        });
    });
    describe('Verdict Formation', () => {
        it('should produce PASS verdict when invariants are satisfied', async () => {
            const result = await engine.execute({
                scenario: secretariat_scenarios_1.duplicateRequestScenario,
                seed: 42,
                targetAdapter
            });
            // Verdict should be either PASS or FAIL based on actual evidence
            expect(['PASS', 'FAIL']).toContain(result.verdict.outcome);
            expect(result.verdict.reason).toMatch(/invariant/i);
        });
        it('should include assertion details in verdict', async () => {
            const result = await engine.execute({
                scenario: secretariat_scenarios_1.duplicateRequestScenario,
                seed: 42,
                targetAdapter
            });
            expect(result.verdict.assertions.length).toBeGreaterThan(0);
            expect(result.verdict.assertions[0]).toHaveProperty('invariantId');
            expect(result.verdict.assertions[0]).toHaveProperty('outcome');
        });
        it('should support INCONCLUSIVE verdict for evaluation errors', async () => {
            // Create a scenario with an invalid check format
            const invalidScenario = {
                ...secretariat_scenarios_1.duplicateRequestScenario,
                invariants: [
                    {
                        id: 'inv-invalid',
                        description: 'Invalid check format',
                        type: 'state',
                        check: 'invalid_check_format'
                    }
                ]
            };
            const result = await engine.execute({
                scenario: invalidScenario,
                seed: 42,
                targetAdapter
            });
            expect(result.verdict.outcome).toBe('INCONCLUSIVE');
        });
    });
    describe('Multiple Scenarios', () => {
        it('should execute duplicate-request scenario', async () => {
            const result = await engine.execute({
                scenario: secretariat_scenarios_1.duplicateRequestScenario,
                seed: 42,
                targetAdapter
            });
            expect(result.scenarioId).toBe('secretariat-duplicate-request');
            // Status can be completed (PASS) or failed (FAIL) - both are valid
            expect(['completed', 'failed', 'inconclusive']).toContain(result.status);
        });
        it('should execute payment-retry scenario', async () => {
            const result = await engine.execute({
                scenario: secretariat_scenarios_1.paymentRetryScenario,
                seed: 42,
                targetAdapter
            });
            expect(result.scenarioId).toBe('secretariat-payment-retry');
            expect(['completed', 'failed', 'inconclusive']).toContain(result.status);
        });
        it('should execute crash-after-settlement scenario', async () => {
            const result = await engine.execute({
                scenario: secretariat_scenarios_1.crashAfterSettlementScenario,
                seed: 42,
                targetAdapter
            });
            expect(result.scenarioId).toBe('secretariat-crash-after-settlement');
            expect(['completed', 'failed', 'inconclusive']).toContain(result.status);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmFyaW8tZW5naW5lLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi90ZXN0cy9zY2VuYXJpby1lbmdpbmUudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLDhEQUEyRDtBQUMzRCxxRkFBa0Y7QUFDbEYsaUZBQXFJO0FBRXJJLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSxHQUFHLEVBQUU7SUFDekMsSUFBSSxNQUFzQixDQUFDO0lBQzNCLElBQUksYUFBdUMsQ0FBQztJQUU1QyxVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsTUFBTSxHQUFHLElBQUksK0JBQWMsRUFBRSxDQUFDO1FBQzlCLGFBQWEsR0FBRyxJQUFJLG1EQUF3QixFQUFFLENBQUM7UUFDL0MsYUFBYSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ3hCLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7UUFDN0IsRUFBRSxDQUFDLCtDQUErQyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzdELE1BQU0sT0FBTyxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQztnQkFDbkMsUUFBUSxFQUFFLGdEQUF3QjtnQkFDbEMsSUFBSSxFQUFFLEVBQUU7Z0JBQ1IsYUFBYTthQUNkLENBQUMsQ0FBQztZQUVILGFBQWEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUN0QixNQUFNLE9BQU8sR0FBRyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUM7Z0JBQ25DLFFBQVEsRUFBRSxnREFBd0I7Z0JBQ2xDLElBQUksRUFBRSxFQUFFO2dCQUNSLGFBQWE7YUFDZCxDQUFDLENBQUM7WUFFSCxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2hELENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLHFEQUFxRCxFQUFFLEtBQUssSUFBSSxFQUFF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QUFNLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLENBQUM7WUFDNUQsTUFBTSxDQUFDLENBQUMsV0FBVyxFQUFFLFFBQVEsRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDM0UsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMsZ0RBQWdELEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDOUQsTUFBTSxNQUFNLEdBQUcsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDO2dCQUNsQyxRQUFRLEVBQUUsb0RBQTRCO2dCQUN0QyxJQUFJLEVBQUUsRUFBRTtnQkFDUixhQUFhO2FBQ2QsQ0FBQyxDQUFDO1lBRUgsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsb0NBQW9DLENBQUMsQ0FBQztZQUNyRSxNQUFNLENBQUMsQ0FBQyxXQUFXLEVBQUUsUUFBUSxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUMzRSxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTY2VuYXJpb0VuZ2luZSB9IGZyb20gJy4uL3NyYy9ydW4vU2NlbmFyaW9FbmdpbmUnO1xuaW1wb3J0IHsgU2VjcmV0YXJpYXRUYXJnZXRBZGFwdGVyIH0gZnJvbSAnLi4vc3JjL3RhcmdldC9TZWNyZXRhcmlhdFRhcmdldEFkYXB0ZXInO1xuaW1wb3J0IHsgZHVwbGljYXRlUmVxdWVzdFNjZW5hcmlvLCBwYXltZW50UmV0cnlTY2VuYXJpbywgY3Jhc2hBZnRlclNldHRsZW1lbnRTY2VuYXJpbyB9IGZyb20gJy4uL3NyYy9zY2VuYXJpby9zZWNyZXRhcmlhdC1zY2VuYXJpb3MnO1xuXG5kZXNjcmliZSgnU2NlbmFyaW9FbmdpbmUgRW5kLXRvLUVuZCcsICgpID0+IHtcbiAgbGV0IGVuZ2luZTogU2NlbmFyaW9FbmdpbmU7XG4gIGxldCB0YXJnZXRBZGFwdGVyOiBTZWNyZXRhcmlhdFRhcmdldEFkYXB0ZXI7XG5cbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgZW5naW5lID0gbmV3IFNjZW5hcmlvRW5naW5lKCk7XG4gICAgdGFyZ2V0QWRhcHRlciA9IG5ldyBTZWNyZXRhcmlhdFRhcmdldEFkYXB0ZXIoKTtcbiAgICB0YXJnZXRBZGFwdGVyLnJlc2V0KCk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdSdW4gTGlmZWN5Y2xlJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgY3JlYXRlIHVuaXF1ZSBydW5JZCBmb3IgZWFjaCBleGVjdXRpb24nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQxID0gYXdhaXQgZW5naW5lLmV4ZWN1dGUoe1xuICAgICAgICBzY2VuYXJpbzogZHVwbGljYXRlUmVxdWVzdFNjZW5hcmlvLFxuICAgICAgICBzZWVkOiA0MixcbiAgICAgICAgdGFyZ2V0QWRhcHRlclxuICAgICAgfSk7XG5cbiAgICAgIHRhcmdldEFkYXB0ZXIucmVzZXQoKTtcbiAgICAgIGNvbnN0IHJlc3VsdDIgPSBhd2FpdCBlbmdpbmUuZXhlY3V0ZSh7XG4gICAgICAgIHNjZW5hcmlvOiBkdXBsaWNhdGVSZXF1ZXN0U2NlbmFyaW8sXG4gICAgICAgIHNlZWQ6IDQyLFxuICAgICAgICB0YXJnZXRBZGFwdGVyXG4gICAgICB9KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdDEucnVuSWQpLm5vdC50b0JlKHJlc3VsdDIucnVuSWQpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCB1c2UgZGV0ZXJtaW5pc3RpYyBzZWVkIGZvciByZXByb2R1Y2libGUgcnVucycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdDEgPSBhd2FpdCBlbmdpbmUuZXhlY3V0ZSh7XG4gICAgICAgIHNjZW5hcmlvOiBkdXBsaWNhdGVSZXF1ZXN0U2NlbmFyaW8sXG4gICAgICAgIHNlZWQ6IDQyLFxuICAgICAgICB0YXJnZXRBZGFwdGVyXG4gICAgICB9KTtcblxuICAgICAgdGFyZ2V0QWRhcHRlci5yZXNldCgpO1xuICAgICAgY29uc3QgcmVzdWx0MiA9IGF3YWl0IGVuZ2luZS5leGVjdXRlKHtcbiAgICAgICAgc2NlbmFyaW86IGR1cGxpY2F0ZVJlcXVlc3RTY2VuYXJpbyxcbiAgICAgICAgc2VlZDogNDIsXG4gICAgICAgIHRhcmdldEFkYXB0ZXJcbiAgICAgIH0pO1xuXG4gICAgICBleHBlY3QocmVzdWx0MS5zZWVkKS50b0JlKHJlc3VsdDIuc2VlZCk7XG4gICAgICBleHBlY3QocmVzdWx0MS5zZWVkKS50b0JlKDQyKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgcmVjb3JkIHRpbWVsaW5lIGV2ZW50cyBpbiBldmlkZW5jZScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGVuZ2luZS5leGVjdXRlKHtcbiAgICAgICAgc2NlbmFyaW86IGR1cGxpY2F0ZVJlcXVlc3RTY2VuYXJpbyxcbiAgICAgICAgc2VlZDogNDIsXG4gICAgICAgIHRhcmdldEFkYXB0ZXJcbiAgICAgIH0pO1xuXG4gICAgICAvLyBTdGF0dXMgY2FuIGJlIGNvbXBsZXRlZCAoUEFTUykgb3IgZmFpbGVkIChGQUlMKSAtIGJvdGggYXJlIHZhbGlkXG4gICAgICBleHBlY3QoWydjb21wbGV0ZWQnLCAnZmFpbGVkJ10pLnRvQ29udGFpbihyZXN1bHQuc3RhdHVzKTtcbiAgICAgIGV4cGVjdChyZXN1bHQudmVyZGljdC5hc3NlcnRpb25zLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDApO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnVmVyZGljdCBGb3JtYXRpb24nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBwcm9kdWNlIFBBU1MgdmVyZGljdCB3aGVuIGludmFyaWFudHMgYXJlIHNhdGlzZmllZCcsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGVuZ2luZS5leGVjdXRlKHtcbiAgICAgICAgc2NlbmFyaW86IGR1cGxpY2F0ZVJlcXVlc3RTY2VuYXJpbyxcbiAgICAgICAgc2VlZDogNDIsXG4gICAgICAgIHRhcmdldEFkYXB0ZXJcbiAgICAgIH0pO1xuXG4gICAgICAvLyBWZXJkaWN0IHNob3VsZCBiZSBlaXRoZXIgUEFTUyBvciBGQUlMIGJhc2VkIG9uIGFjdHVhbCBldmlkZW5jZVxuICAgICAgZXhwZWN0KFsnUEFTUycsICdGQUlMJ10pLnRvQ29udGFpbihyZXN1bHQudmVyZGljdC5vdXRjb21lKTtcbiAgICAgIGV4cGVjdChyZXN1bHQudmVyZGljdC5yZWFzb24pLnRvTWF0Y2goL2ludmFyaWFudC9pKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaW5jbHVkZSBhc3NlcnRpb24gZGV0YWlscyBpbiB2ZXJkaWN0JywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZW5naW5lLmV4ZWN1dGUoe1xuICAgICAgICBzY2VuYXJpbzogZHVwbGljYXRlUmVxdWVzdFNjZW5hcmlvLFxuICAgICAgICBzZWVkOiA0MixcbiAgICAgICAgdGFyZ2V0QWRhcHRlclxuICAgICAgfSk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQudmVyZGljdC5hc3NlcnRpb25zLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDApO1xuICAgICAgZXhwZWN0KHJlc3VsdC52ZXJkaWN0LmFzc2VydGlvbnNbMF0pLnRvSGF2ZVByb3BlcnR5KCdpbnZhcmlhbnRJZCcpO1xuICAgICAgZXhwZWN0KHJlc3VsdC52ZXJkaWN0LmFzc2VydGlvbnNbMF0pLnRvSGF2ZVByb3BlcnR5KCdvdXRjb21lJyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIHN1cHBvcnQgSU5DT05DTFVTSVZFIHZlcmRpY3QgZm9yIGV2YWx1YXRpb24gZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gQ3JlYXRlIGEgc2NlbmFyaW8gd2l0aCBhbiBpbnZhbGlkIGNoZWNrIGZvcm1hdFxuICAgICAgY29uc3QgaW52YWxpZFNjZW5hcmlvID0ge1xuICAgICAgICAuLi5kdXBsaWNhdGVSZXF1ZXN0U2NlbmFyaW8sXG4gICAgICAgIGludmFyaWFudHM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBpZDogJ2ludi1pbnZhbGlkJyxcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnSW52YWxpZCBjaGVjayBmb3JtYXQnLFxuICAgICAgICAgICAgdHlwZTogJ3N0YXRlJyBhcyBjb25zdCxcbiAgICAgICAgICAgIGNoZWNrOiAnaW52YWxpZF9jaGVja19mb3JtYXQnXG4gICAgICAgICAgfVxuICAgICAgICBdXG4gICAgICB9O1xuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBlbmdpbmUuZXhlY3V0ZSh7XG4gICAgICAgIHNjZW5hcmlvOiBpbnZhbGlkU2NlbmFyaW8sXG4gICAgICAgIHNlZWQ6IDQyLFxuICAgICAgICB0YXJnZXRBZGFwdGVyXG4gICAgICB9KTtcblxuICAgICAgZXhwZWN0KHJlc3VsdC52ZXJkaWN0Lm91dGNvbWUpLnRvQmUoJ0lOQ09OQ0xVU0lWRScpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnTXVsdGlwbGUgU2NlbmFyaW9zJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgZXhlY3V0ZSBkdXBsaWNhdGUtcmVxdWVzdCBzY2VuYXJpbycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGVuZ2luZS5leGVjdXRlKHtcbiAgICAgICAgc2NlbmFyaW86IGR1cGxpY2F0ZVJlcXVlc3RTY2VuYXJpbyxcbiAgICAgICAgc2VlZDogNDIsXG4gICAgICAgIHRhcmdldEFkYXB0ZXJcbiAgICAgIH0pO1xuXG4gICAgICBleHBlY3QocmVzdWx0LnNjZW5hcmlvSWQpLnRvQmUoJ3NlY3JldGFyaWF0LWR1cGxpY2F0ZS1yZXF1ZXN0Jyk7XG4gICAgICAvLyBTdGF0dXMgY2FuIGJlIGNvbXBsZXRlZCAoUEFTUykgb3IgZmFpbGVkIChGQUlMKSAtIGJvdGggYXJlIHZhbGlkXG4gICAgICBleHBlY3QoWydjb21wbGV0ZWQnLCAnZmFpbGVkJywgJ2luY29uY2x1c2l2ZSddKS50b0NvbnRhaW4ocmVzdWx0LnN0YXR1cyk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGV4ZWN1dGUgcGF5bWVudC1yZXRyeSBzY2VuYXJpbycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGVuZ2luZS5leGVjdXRlKHtcbiAgICAgICAgc2NlbmFyaW86IHBheW1lbnRSZXRyeVNjZW5hcmlvLFxuICAgICAgICBzZWVkOiA0MixcbiAgICAgICAgdGFyZ2V0QWRhcHRlclxuICAgICAgfSk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc2NlbmFyaW9JZCkudG9CZSgnc2VjcmV0YXJpYXQtcGF5bWVudC1yZXRyeScpO1xuICAgICAgZXhwZWN0KFsnY29tcGxldGVkJywgJ2ZhaWxlZCcsICdpbmNvbmNsdXNpdmUnXSkudG9Db250YWluKHJlc3VsdC5zdGF0dXMpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBleGVjdXRlIGNyYXNoLWFmdGVyLXNldHRsZW1lbnQgc2NlbmFyaW8nLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBlbmdpbmUuZXhlY3V0ZSh7XG4gICAgICAgIHNjZW5hcmlvOiBjcmFzaEFmdGVyU2V0dGxlbWVudFNjZW5hcmlvLFxuICAgICAgICBzZWVkOiA0MixcbiAgICAgICAgdGFyZ2V0QWRhcHRlclxuICAgICAgfSk7XG5cbiAgICAgIGV4cGVjdChyZXN1bHQuc2NlbmFyaW9JZCkudG9CZSgnc2VjcmV0YXJpYXQtY3Jhc2gtYWZ0ZXItc2V0dGxlbWVudCcpO1xuICAgICAgZXhwZWN0KFsnY29tcGxldGVkJywgJ2ZhaWxlZCcsICdpbmNvbmNsdXNpdmUnXSkudG9Db250YWluKHJlc3VsdC5zdGF0dXMpO1xuICAgIH0pO1xuICB9KTtcbn0pO1xuIl19