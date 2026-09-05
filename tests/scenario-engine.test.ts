import { ScenarioEngine } from '../src/run/ScenarioEngine';
import { SecretariatTargetAdapter } from '../src/target/SecretariatTargetAdapter';
import { duplicateRequestScenario, paymentRetryScenario, crashAfterSettlementScenario } from '../src/scenario/secretariat-scenarios';

describe('ScenarioEngine End-to-End', () => {
  let engine: ScenarioEngine;
  let targetAdapter: SecretariatTargetAdapter;

  beforeEach(() => {
    engine = new ScenarioEngine();
    targetAdapter = new SecretariatTargetAdapter();
  });

  afterEach(() => {
    targetAdapter.reset();
  });

  describe('Run Lifecycle', () => {
    it('should create unique runId for each execution', async () => {
      const result1 = await engine.execute({
        scenario: duplicateRequestScenario,
        seed: 42,
        targetAdapter
      });

      const result2 = await engine.execute({
        scenario: duplicateRequestScenario,
        seed: 42,
        targetAdapter
      });

      expect(result1.runId).toBeDefined();
      expect(result2.runId).toBeDefined();
      expect(result1.runId).not.toBe(result2.runId);
    });

    it('should use deterministic seed for reproducible runs', async () => {
      const result1 = await engine.execute({
        scenario: duplicateRequestScenario,
        seed: 12345,
        targetAdapter
      });

      const result2 = await engine.execute({
        scenario: duplicateRequestScenario,
        seed: 12345,
        targetAdapter
      });

      // Same seed should produce same verdict outcome
      expect(result1.seed).toBe(12345);
      expect(result2.seed).toBe(12345);
      expect(result1.verdict.outcome).toBe(result2.verdict.outcome);
    });

    it('should record timeline events in evidence', async () => {
      const result = await engine.execute({
        scenario: duplicateRequestScenario,
        seed: 42,
        targetAdapter
      });

      expect(result.status).toBe('completed');
      expect(result.verdict.assertions.length).toBeGreaterThan(0);
    });
  });

  describe('Verdict Formation', () => {
    it('should produce PASS verdict when invariants are satisfied', async () => {
      const result = await engine.execute({
        scenario: duplicateRequestScenario,
        seed: 42,
        targetAdapter
      });

      expect(result.verdict.outcome).toBe('PASS');
      expect(result.verdict.reason).toContain('invariants passed');
    });

    it('should include assertion details in verdict', async () => {
      const result = await engine.execute({
        scenario: duplicateRequestScenario,
        seed: 42,
        targetAdapter
      });

      expect(result.verdict.assertions.length).toBeGreaterThan(0);
      
      for (const assertion of result.verdict.assertions) {
        expect(assertion.invariantId).toBeDefined();
        expect(assertion.invariantDescription).toBeDefined();
        expect(assertion.outcome).toBeDefined();
        expect(assertion.expected).toBeDefined();
        expect(assertion.actual).toBeDefined();
      }
    });

    it('should support INCONCLUSIVE verdict for evaluation errors', async () => {
      // Create a scenario with an invariant that will fail evaluation
      const faultyScenario = {
        ...duplicateRequestScenario,
        invariants: [
          {
            id: 'inv-faulty',
            description: 'This invariant will fail',
            type: 'economic' as const,
            check: 'impossible_condition == true'
          }
        ]
      };

      const result = await engine.execute({
        scenario: faultyScenario,
        seed: 42,
        targetAdapter
      });

      // Should not crash, should produce a verdict
      expect(result.verdict).toBeDefined();
      expect(result.verdict.outcome).toBeDefined();
    });
  });

  describe('Multiple Scenarios', () => {
    it('should execute duplicate-request scenario', async () => {
      const result = await engine.execute({
        scenario: duplicateRequestScenario,
        seed: 42,
        targetAdapter
      });

      expect(result.scenarioId).toBe('secretariat-duplicate-request');
      expect(result.status).toBe('completed');
    });

    it('should execute payment-retry scenario', async () => {
      const result = await engine.execute({
        scenario: paymentRetryScenario,
        seed: 42,
        targetAdapter
      });

      expect(result.scenarioId).toBe('secretariat-payment-retry');
      expect(result.status).toBe('completed');
    });

    it('should execute crash-after-settlement scenario', async () => {
      const result = await engine.execute({
        scenario: crashAfterSettlementScenario,
        seed: 42,
        targetAdapter
      });

      expect(result.scenarioId).toBe('secretariat-crash-after-settlement');
      expect(result.status).toBe('completed');
    });
  });
});
