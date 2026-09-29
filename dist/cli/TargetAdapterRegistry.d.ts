/**
 * TargetAdapterRegistry — selection mechanism for TargetAdapters (Block B2).
 *
 * Terminology:
 * - SUT (System Under Test) — the agent Argus connects to via AgentTargetPort.
 * - TargetAdapter — an implementation of AgentTargetPort (Mock / HTTP / X402).
 *
 * PRINCIPLES:
 * - Depends ONLY on core/AgentTargetPort and the three existing adapters.
 * - Knows NOTHING about payments: no imports from src/adapters/payment/*,
 *   no PaymentAdapter, no SigningBinding, no EIP-3009.
 * - Uses the existing AdapterFactory type from core/AgentTargetPort as the
 *   registration shape. No new factory type is introduced.
 * - MockTargetAdapter remains a test SUT simulator; this registry simply
 *   makes it one selectable option among others instead of the only one.
 */
import { AgentTargetPort, AdapterFactory, TargetConnectionConfig } from '../core/AgentTargetPort';
export type TargetKind = 'mock' | 'http' | 'x402';
export interface TargetAdapterSpec {
    kind: TargetKind;
    /** SUT URL. Required for kind='http' | 'x402'. */
    endpoint?: string;
    options?: Record<string, unknown>;
}
/**
 * Resolve env-driven target configuration.
 *
 *   ARGUS_TARGET_KIND     = mock | http | x402   (default: mock)
 *   ARGUS_TARGET_ENDPOINT = <url>                (required if kind != mock)
 *
 * Throws on unknown kind or missing endpoint for http/x402.
 * The CLI turns these errors into process.exit(1) with a readable message.
 */
export declare function readTargetSpecFromEnv(env?: NodeJS.ProcessEnv): TargetAdapterSpec;
/**
 * Build a connection config compatible with the selected adapter's connect().
 * transportType matches the kind ('mock' | 'http' | 'x402'); endpoint is
 * carried through for HTTP/X402 adapters (ignored by Mock).
 */
export declare function buildConnectionConfig(spec: TargetAdapterSpec): TargetConnectionConfig;
export declare class TargetAdapterRegistry {
    private factories;
    /**
     * Register a factory under a kind. Existing AdapterFactory signature from
     * core/AgentTargetPort is reused: (targetType: string) => AgentTargetPort.
     */
    register(kind: TargetKind, factory: AdapterFactory): this;
    /**
     * Create the TargetAdapter for the given spec.
     * Throws for unknown kinds and for http/x402 without endpoint.
     */
    create(spec: TargetAdapterSpec): AgentTargetPort;
    /** Registry with the three built-in adapters pre-registered. */
    static default(): TargetAdapterRegistry;
}
//# sourceMappingURL=TargetAdapterRegistry.d.ts.map