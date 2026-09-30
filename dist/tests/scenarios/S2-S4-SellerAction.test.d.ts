/**
 * R3 — Seller-action (Decision 3, variant a) tests for S2 and S4.
 *
 * Proves ONLY:
 * 1. delayed_response (S2) and hang (S4) become reachable through the
 *    EXISTING L0-F2 action-fault dispatch: trigger 'action_deliver',
 *    participant target === actor ('resource-server-1'). No lifecycle dispatch.
 * 2. The faults produce their canonical evidence via FaultInjector's own
 *    emit path (delivery_started / delivery_completed from resource-server-1).
 * 3. Assertions of S2/S4 are NOT modified; their honest post-R3 status is
 *    asserted (both remain INCONCLUSIVE until Sut-reported success /
 *    terminal-state plumbing lands — see docs/evidence-source-map.md).
 * 4. S6 fault remains declared-only on a lifecycle trigger (not touched).
 */
export {};
//# sourceMappingURL=S2-S4-SellerAction.test.d.ts.map