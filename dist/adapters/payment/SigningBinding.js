/**
 * Минимальная структурная валидация SigningBinding на Argus-side boundary.
 * Не интерпретирует экономику — только проверяет форму.
 */
export function validateSigningBinding(b) {
    const require = (cond, msg) => {
        if (!cond)
            throw new Error(`Invalid SigningBinding: ${msg}`);
    };
    require(/^0x[0-9a-fA-F]{40}$/.test(b.from), '`from` must be a 0x address');
    require(/^0x[0-9a-fA-F]{40}$/.test(b.to), '`to` must be a 0x address');
    require(/^\d+$/.test(b.value), '`value` must be a non-negative decimal string');
    require(/^0x[0-9a-fA-F]{64}$/.test(b.nonce), '`nonce` must be 0x + 32 bytes hex');
    require(/^\d+$/.test(b.validAfter), '`validAfter` must be a decimal string');
    require(/^\d+$/.test(b.validBefore), '`validBefore` must be a decimal string');
    require(BigInt(b.validBefore) > BigInt(b.validAfter), '`validBefore` must be greater than `validAfter`');
    require(typeof b.network === 'string' && b.network.length > 0, '`network` is required');
    require(/^0x[0-9a-fA-F]{40}$/.test(b.asset), '`asset` must be a 0x address');
    require(typeof b.scheme === 'string' && b.scheme.length > 0, '`scheme` is required');
}
/**
 * Детерминированный TEST-ONLY placeholder источника intent.
 *
 * Используется RunOrchestrator, когда внешний bindingSource не передан.
 * Это НЕ имитация Secretariat: значения формируются вне PaymentAdapter,
 * поэтому контракт "adapter подписывает exact binding" сохраняется.
 * Nonce детерминирован (не randomBytes), чтобы unit-тесты были
 * воспроизводимыми.
 */
export const defaultSigningIntentSource = (paymentRequired) => {
    const nowSec = Math.floor(Date.now() / 1000);
    const window = paymentRequired.maxTimeoutSeconds > 0 ? paymentRequired.maxTimeoutSeconds : 60;
    return {
        nonce: `0x${'0'.repeat(64)}`,
        validAfter: String(nowSec),
        validBefore: String(nowSec + window),
    };
};
/**
 * Derive SigningBinding из PaymentRequired (402 от Target) плюс
 * durable intent-поля (nonce / validAfter / validBefore), которые
 * принадлежат ВНЕШНЕМУ buyer-side economic layer.
 *
 * ГДЕ ЖИВЁТ ЭТОТ ФУНКЦИОНАЛ (design reasoning, см. §4.3 задания):
 * - PaymentResolver (callback в ScenarioEngine) НЕ меняется:
 *   он по-прежнему получает PaymentRequired и возвращает строку.
 * - Единственное место, где PaymentRequired превращается в
 *   SigningBinding — RunOrchestrator (композиционный корень),
 *   который строит resolver поверх PaymentAdapter.
 * - Когда wire boundary с Secretariat будет зафиксирован
 *   (cross-system этап), bindingSource подменится на реальный
 *   источник intent-полей. Сам PaymentAdapter менять не придётся.
 *
 * Поля 402 (scheme/network/asset/value/to) переходят как есть;
 * intent-поля (nonce/window) приходят ИЗВНЕ — adapter никогда не
 * генерирует их локально.
 */
export function deriveSigningBinding(pr, from, intent) {
    return {
        from,
        to: pr.payTo,
        value: pr.amount,
        nonce: intent.nonce,
        validAfter: intent.validAfter,
        validBefore: intent.validBefore,
        network: pr.network,
        asset: pr.asset,
        scheme: pr.scheme,
    };
}
//# sourceMappingURL=SigningBinding.js.map