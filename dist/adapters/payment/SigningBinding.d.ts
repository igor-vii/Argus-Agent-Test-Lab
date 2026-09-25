/**
 * SigningBinding — инструкция на подпись платежа, выдаваемая ВНЕШНИМ
 * buyer-side economic layer (Secretariat).
 *
 * Ключевое отличие от PaymentRequired:
 * - PaymentRequired — то, что пришло от Target/Seller (402);
 * - SigningBinding   — durable payment intent из buyer-side economic layer:
 *   nonce, validAfter, validBefore принадлежат ему, а НЕ адаптеру.
 *
 * Цепочка:
 *   Target/Seller --402--> PaymentRequired
 *        --external source--> SigningBinding
 *        --> PaymentAdapter.signX402Payment(binding) --> PaymentPayload
 *        --> HTTP retry (PAYMENT-SIGNATURE header)
 *
 * ВАЖНО (межсистемный контракт):
 * Способ доставки SigningBinding из Secretariat в Argus (wire boundary)
 * здесь НЕ фиксируется — это решение cross-system этапа. На данном этапе
 * готовится только Argus-side интерфейс: signX402Payment принимает
 * готовый SigningBinding и обязуется НЕ генерировать локально
 * nonce / validAfter / validBefore.
 */
export interface SigningBinding {
    /** authorizer (адрес подписанта, buyer-side) */
    from: string;
    /** payTo (адрес получателя, seller-side) */
    to: string;
    /** amount в atomic units (string, как в x402) */
    value: string;
    /** nonce из durable payment intent (0x + 64 hex для EIP-3009) */
    nonce: string;
    /** начало окна действия (unix seconds, decimal string) */
    validAfter: string;
    /** конец окна действия (unix seconds, decimal string) */
    validBefore: string;
    /** сетевой идентификатор, e.g. 'eip155:84532' */
    network: string;
    /** адрес asset-контракта, e.g. USDC на Base Sepolia */
    asset: string;
    /** схема платежа, e.g. 'exact' */
    scheme: string;
}
/**
 * Минимальная структурная валидация SigningBinding на Argus-side boundary.
 * Не интерпретирует экономику — только проверяет форму.
 */
export declare function validateSigningBinding(b: SigningBinding): void;
/**
 * Источник durable payment intent (nonce / validAfter / validBefore).
 *
 * В целевой архитектуре этот источник — внешний buyer-side economic
 * layer (Secretariat). Механизм доставки (wire boundary) фиксируется
 * на cross-system этапе и ЗДЕСЬ НЕ проектируется.
 *
 * На текущем Argus-этапе в тестовой среде допускается детерминированный
 * placeholder (см. defaultSigningIntentSource), который передаёт эти
 * поля в PaymentAdapter как внешние — adapter по-прежнему ничего не
 * генерирует локально.
 */
export type SigningIntentSource = (paymentRequired: {
    maxTimeoutSeconds: number;
}) => {
    nonce: string;
    validAfter: string;
    validBefore: string;
};
/**
 * Детерминированный TEST-ONLY placeholder источника intent.
 *
 * Используется RunOrchestrator, когда внешний bindingSource не передан.
 * Это НЕ имитация Secretariat: значения формируются вне PaymentAdapter,
 * поэтому контракт "adapter подписывает exact binding" сохраняется.
 * Nonce детерминирован (не randomBytes), чтобы unit-тесты были
 * воспроизводимыми.
 */
export declare const defaultSigningIntentSource: SigningIntentSource;
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
export declare function deriveSigningBinding(pr: {
    scheme: string;
    network: string;
    amount: string;
    asset: string;
    payTo: string;
}, from: string, intent: {
    nonce: string;
    validAfter: string;
    validBefore: string;
}): SigningBinding;
//# sourceMappingURL=SigningBinding.d.ts.map