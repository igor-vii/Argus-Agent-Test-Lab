import { ScenarioDefinition } from '../core/ScenarioDefinition';
/**
 * S7 — Lost Delivery
 *
 * Цель: Проверить обработку потерянной доставки.
 * Invariant: Payment не повторяется при lost delivery.
 * Expected: DELIVERY_UNKNOWN + возможность retry без новой оплаты.
 */
export declare const S7_LostDelivery: ScenarioDefinition;
//# sourceMappingURL=S7_LostDelivery.d.ts.map