/**
 * R2 — Minimal Lifecycle Observation Plumbing tests.
 *
 * Proves ONLY the implemented plumbing:
 * 1. A legitimate lifecycle observation reported by the simulated source
 *    (settlement layer of the Sut, via MockTargetAdapter config) enters the
 *    EXISTING evidence path (metadata.observations → ScenarioEngine →
 *    EvidenceCollector) and reaches existing scenario assertions.
 * 2. The evidence retains its exact lifecycle identity ('payment_settled',
 *    'settlement_unknown') — no renaming, no normalization.
 * 3. Lifecycle observations do NOT invoke FaultInjector dispatch
 *    (L0-F2 preserved: only action_* triggers enter active dispatch).
 * 4. UNKNOWN remains distinct from FAILURE / success / failed.
 * 5. S1/S5 action-fault behavior is not regressed.
 * 6. S8 x402 engine evidence is not reinterpreted as settlement.
 */
export {};
//# sourceMappingURL=LifecycleObservationPlumbing.test.d.ts.map