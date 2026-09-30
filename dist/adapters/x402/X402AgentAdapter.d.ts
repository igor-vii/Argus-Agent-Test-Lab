/**
 * X402AgentAdapter - x402 V2 Protocol Implementation of PaymentCapablePort
 *
 * This adapter enables Argus to communicate with AI agents that implement
 * the x402 V2 payment protocol. It handles:
 * - Detecting HTTP 402 Payment Required responses
 * - Parsing payment requirements from the 'payment-required' header
 * - Retrying requests with a 'payment-signature' header
 * - Capturing payment responses from the 'payment-response' header
 *
 * PRINCIPLES:
 * - Does NOT know about payment semantics (amounts, assets, networks)
 * - Does NOT sign payments or interact with PaymentAdapter
 * - Only handles x402 transport concerns (headers, status codes, parsing)
 * - Semantic interpretation happens in Argus Core / Secretariat
 */
import { PaymentCapablePort, TargetConnectionConfig, ConnectionResult, Exchange, Evidence, RunId } from '../../core/AgentTargetPort';
export declare class X402AgentAdapter implements PaymentCapablePort {
    private id;
    private targetType;
    private connected;
    private config?;
    private baseUrl?;
    private exchanges;
    private evidences;
    constructor(targetType?: string);
    getId(): string;
    getTargetType(): string;
    connect(config: TargetConnectionConfig): Promise<ConnectionResult>;
    isConnected(): boolean;
    send(runId: RunId, type: string, payload?: unknown): Promise<Exchange>;
    sendWithSignature(runId: RunId, type: string, payload: unknown, paymentSignature: string): Promise<Exchange>;
    receive(runId: RunId, type: string, payload?: unknown): Promise<Exchange>;
    captureEvidence(runId: RunId, type: string, data: unknown, description?: string): Promise<Evidence>;
    disconnect(): Promise<void>;
    /**
     * Make an HTTP request with timeout and optional extra headers
     */
    private makeHttpRequest;
    /**
     * Get all recorded exchanges (for testing/inspection)
     */
    getExchanges(): Exchange[];
    /**
     * Get all recorded evidence (for testing/inspection)
     */
    getEvidences(): Evidence[];
    /**
     * Reset adapter state (for testing)
     */
    reset(): void;
}
//# sourceMappingURL=X402AgentAdapter.d.ts.map