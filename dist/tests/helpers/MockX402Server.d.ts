export interface MockServerBehavior {
    type: '402_with_header' | '402_with_body_only' | '402_invalid_header' | '402_reject_signature' | '200' | '500' | 'delay';
    paymentRequired?: Record<string, unknown>;
    body?: Record<string, unknown>;
    responseBody?: Record<string, unknown>;
    delayMs?: number;
}
export interface ReceivedRequest {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: unknown;
}
/**
 * Mock HTTP server for testing x402 flows.
 * Simulates a target that returns 402 Payment Required with x402 V2 headers.
 */
export declare class MockX402Server {
    private server?;
    private port;
    private behavior;
    private requests;
    setBehavior(behavior: MockServerBehavior): void;
    getRequests(): ReceivedRequest[];
    start(): Promise<{
        port: number;
        url: string;
    }>;
    stop(): Promise<void>;
}
//# sourceMappingURL=MockX402Server.d.ts.map