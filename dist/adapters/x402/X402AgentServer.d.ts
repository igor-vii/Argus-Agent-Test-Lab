/**
 * X402AgentServer — x402 V2 resource server for Argus-as-seller scenarios.
 *
 * This is a NEW component (does not modify X402AgentAdapter, which only
 * handles the client/buyer side of the protocol).
 *
 * Responsibilities:
 * - Serve an HTTP endpoint that implements the seller half of x402 V2:
 *   - Request without `payment-signature` header  -> 402 + `payment-required`
 *     header (Base64-encoded x402 V2 payment requirements body).
 *   - Request with `payment-signature` header     -> verify the payload is a
 *     well-formed x402 V2 signature envelope (MVP: structural check; full
 *     EIP-3009 verification lives in Secretariat / PaymentAdapter land)
 *     -> 200 + resource body + `payment-response` header.
 * - Log every request/response exchange as evidence.
 *
 * Explicitly NOT doing:
 * - Signing payments (that is PaymentAdapter).
 * - Knowing anything about Secretariat.
 * - Interpreting payment economics (amounts are configured, not decided).
 */
export interface X402ServerPaymentRequirements {
    scheme: string;
    network: string;
    maxAmountRequired: string;
    payTo: string;
    asset: string;
    maxTimeoutSeconds?: number;
}
export interface X402AgentServerConfig {
    /** Port to listen on. 0 = ephemeral port assigned by the OS. */
    port?: number;
    /** Host/interface to bind. Default 127.0.0.1. */
    host?: string;
    /** URL path that is payment-guarded. Default '/resource'. */
    path?: string;
    /** Payment requirements advertised in the 402 response. */
    paymentRequirements: X402ServerPaymentRequirements;
    /** Body returned with 200 after a (structurally) valid payment signature. */
    responseBody?: Record<string, unknown>;
}
export interface X402ServerRequestLog {
    id: string;
    timestamp: number;
    method: string;
    url: string;
    headers: Record<string, string>;
    body: unknown;
    responseStatus: number;
    responseHeaders: Record<string, string>;
    reason: string;
}
/** One evidence record per processed request. */
export interface X402ServerEvidence {
    source: 'x402-server';
    type: 'request_received' | 'payment_required_issued' | 'payment_signature_accepted' | 'payment_signature_rejected';
    data: Record<string, unknown>;
    timestamp: number;
}
interface DecodedSignature {
    ok: boolean;
    reason: string;
    decoded?: Record<string, unknown>;
}
/**
 * Structural validation of a Base64-encoded x402 V2 PAYMENT-SIGNATURE payload.
 * Expected shape:
 *   { x402Version, scheme, network, payload: { signature, authorization: {...} } }
 */
export declare function decodePaymentSignature(headerValue: string): DecodedSignature;
export declare class X402AgentServer {
    private readonly config;
    private server?;
    private actualPort;
    private requests;
    private evidence;
    constructor(config: X402AgentServerConfig);
    /** Start listening. Resolves with the bound URL (use port 0 for ephemeral). */
    start(): Promise<{
        port: number;
        url: string;
    }>;
    stop(): Promise<void>;
    getUrl(): string;
    getRequests(): X402ServerRequestLog[];
    getEvidence(): X402ServerEvidence[];
    private buildPaymentRequiredBody;
    private record;
    private handle;
}
export {};
//# sourceMappingURL=X402AgentServer.d.ts.map