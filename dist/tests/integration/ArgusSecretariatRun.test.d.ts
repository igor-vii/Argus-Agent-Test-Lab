/**
 * Argus <-> Secretariat marriage run — live integration suite.
 *
 * Roles (per product design):
 *  - Secretariat = intermediary between buyer and seller; it records every
 *    evaluated action into the Zeus database (payment_intents, evidence).
 *  - Argus = test agent that plays BOTH sides in different scenarios:
 *      Scenario A ("Argus as seller"): Secretariat's Stage-A client performs
 *        x402 discovery against an Argus X402AgentServer; Argus then signs a
 *        payment with its own PaymentAdapter and submits it to Secretariat.
 *      Scenario B ("Argus as buyer"): Argus' X402AgentAdapter calls paid
 *        routes on Secretariat directly (402 -> sign -> retry).
 *
 * ENV-driven only (SECRETARIAT_URL etc.); nothing here modifies S1-S8,
 * X402AgentAdapter, PaymentAdapter, ExecutionRegistry, RunOrchestrator or
 * ScenarioEngine. The Zeus repo is NOT modified either — findings about its
 * config are reported, not patched around silently.
 *
 * Each step is recorded into reports/argus-secretariat-run-<ts>.json as a
 * matrix row: action -> HTTP verdict -> expected DB effect.
 */
export {};
//# sourceMappingURL=ArgusSecretariatRun.test.d.ts.map