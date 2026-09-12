import { S1_DuplicateRequest } from '../scenarios/S1_DuplicateRequest';
import { S2_PaymentBeforeExecution } from '../scenarios/S2_PaymentBeforeExecution';
import { S3_CrashAfterSettlement } from '../scenarios/S3_CrashAfterSettlement';
import { S4_SellerTimeout } from '../scenarios/S4_SellerTimeout';
import { S5_ConcurrentDuplicate } from '../scenarios/S5_ConcurrentDuplicate';
import { S6_PaymentRetry } from '../scenarios/S6_PaymentRetry';
import { S7_LostDelivery } from '../scenarios/S7_LostDelivery';
/**
 * Реестр сценариев
 */
export const ScenarioRegistry = new Map([
    ['S1', S1_DuplicateRequest],
    ['S2', S2_PaymentBeforeExecution],
    ['S3', S3_CrashAfterSettlement],
    ['S4', S4_SellerTimeout],
    ['S5', S5_ConcurrentDuplicate],
    ['S6', S6_PaymentRetry],
    ['S7', S7_LostDelivery]
]);
/**
 * Получить все ID сценариев
 */
export function getScenarioIds() {
    return Array.from(ScenarioRegistry.keys());
}
/**
 * Получить сценарий по ID
 */
export function getScenario(id) {
    return ScenarioRegistry.get(id);
}
//# sourceMappingURL=ScenarioRegistry.js.map