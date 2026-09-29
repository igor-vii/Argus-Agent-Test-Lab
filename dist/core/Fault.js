/**
 * Lifecycle/event triggers are evidence declarations in L0-F2.
 * They are intentionally not recursive fault-dispatch inputs.
 */
export const L0F2_LIFECYCLE_TRIGGERS = new Set([
    'delivery_started',
    'payment_settled',
    'settlement_unknown',
    'delivery_sent',
]);
export const isActionTrigger = (trigger) => trigger.startsWith('action_');
/**
 * respond is baseline participant behavior, not a fault primitive.
 * It remains on the legacy Fault shape only as a compatibility bridge
 * for S7 and is dispatched through getRespondersForEvent(), not through
 * the active fault-dispatch path.
 */
export const isBaselineResponder = (fault) => fault.type === 'respond';
//# sourceMappingURL=Fault.js.map