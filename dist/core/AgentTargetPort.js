/**
 * AgentTargetPort - Universal Port for Connecting Argus to Any AI-Agent
 *
 * This is a target-agnostic, transport-agnostic contract that allows Argus
 * to connect to any target agent and exchange observable data.
 *
 * PRINCIPLES:
 * - ATA does NOT know about any specific target (payment processors, oracles, escrow services, etc.)
 * - ATA does NOT interpret economic semantics
 * - ATA is purely a connectivity/observation port
 * - Semantic interpretation happens above ATA in Argus Core
 */
/**
 * Direction of communication
 */
export var MessageDirection;
(function (MessageDirection) {
    /** From Argus/Test Harness to Target Agent */
    MessageDirection["OUTBOUND"] = "outbound";
    /** From Target Agent to Argus/Test Harness */
    MessageDirection["INBOUND"] = "inbound";
})(MessageDirection || (MessageDirection = {}));
/**
 * Status of an operation/exchange
 */
export var ExchangeStatus;
(function (ExchangeStatus) {
    ExchangeStatus["PENDING"] = "pending";
    ExchangeStatus["SUCCESS"] = "success";
    ExchangeStatus["FAILURE"] = "failure";
    ExchangeStatus["TIMEOUT"] = "timeout";
    ExchangeStatus["UNKNOWN"] = "unknown";
    /**
     * Target returned HTTP 402 Payment Required (or protocol equivalent).
     * The adapter has parsed the payment requirements but did NOT pay.
     * Upper layers decide whether to sign and retry.
     */
    ExchangeStatus["PAYMENT_REQUIRED"] = "payment_required";
})(ExchangeStatus || (ExchangeStatus = {}));
//# sourceMappingURL=AgentTargetPort.js.map