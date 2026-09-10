/**
 * HttpAgentAdapter - HTTP Protocol Implementation of AgentTargetPort
 *
 * This adapter enables Argus to communicate with any AI agent via HTTP API.
 * It is protocol-specific but target-agnostic - the same adapter works with
 * any HTTP-based target agent through configuration.
 *
 * PRINCIPLES:
 * - Does NOT know about Secretariat, payment, or business semantics
 * - Only handles HTTP transport concerns (URL, method, headers, status codes)
 * - Returns raw response data; interpretation happens in Argus Core
 */
import { AgentTargetPort, TargetConnectionConfig, ConnectionResult, Exchange, Evidence, RunId } from '../../core/AgentTargetPort';
/**
 * HTTP-specific connection options
 */
export interface HttpConnectionOptions {
    /** HTTP method (default: POST) */
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    /** HTTP headers to include in requests */
    headers?: Record<string, string>;
    /** Whether to include credentials (cookies, auth headers) */
    withCredentials?: boolean;
    /** Expected content type (default: 'application/json') */
    contentType?: string;
    /** Custom request transformer function (serialized as config) */
    transformRequest?: string;
    /** Custom response transformer function (serialized as config) */
    transformResponse?: string;
}
/**
 * HTTP Adapter implementation
 */
export declare class HttpAgentAdapter implements AgentTargetPort {
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
    receive(runId: RunId, type: string, payload?: unknown): Promise<Exchange>;
    captureEvidence(runId: RunId, type: string, data: unknown, description?: string): Promise<Evidence>;
    disconnect(): Promise<void>;
    /**
     * Make an HTTP request with configured options
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
//# sourceMappingURL=HttpAgentAdapter.d.ts.map