/**
 * McpAgentAdapter - MCP (Model Context Protocol) Implementation of AgentTargetPort
 *
 * This adapter enables Argus to communicate with AI agents via MCP.
 * It is protocol-specific but target-agnostic - the same adapter works with
 * any MCP-based target agent through configuration.
 *
 * PRINCIPLES:
 * - Does NOT know about any specific target, payment, or business semantics
 * - Only handles MCP transport concerns (sessions, tools, resources)
 * - Returns raw response data; interpretation happens in Argus Core
 *
 * NOTE: This is a minimal stub implementation demonstrating the architecture.
 * Full MCP implementation would require the @modelcontextprotocol/sdk package
 * and actual MCP session management.
 */
import { AgentTargetPort, TargetConnectionConfig, ConnectionResult, Exchange, Evidence, RunId } from '../../core/AgentTargetPort';
/**
 * MCP-specific connection options
 */
export interface McpConnectionOptions {
    /** MCP server command to execute (for stdio transport) */
    command?: string;
    /** Command arguments */
    args?: string[];
    /** Environment variables for the MCP process */
    env?: Record<string, string>;
    /** MCP server URL (for SSE transport) */
    url?: string;
    /** Transport type: 'stdio' or 'sse' */
    transport?: 'stdio' | 'sse';
    /** Timeout for tool execution in ms */
    toolTimeoutMs?: number;
}
/**
 * MCP Adapter implementation (stub/skeleton)
 *
 * ARCHITECTURAL NOTE: This is a minimal implementation to demonstrate
 * the Port/Adapter pattern. A full implementation would:
 * - Use @modelcontextprotocol/sdk
 * - Manage actual MCP sessions
 * - Handle tool calls and resource access
 * - Process MCP notifications and events
 */
export declare class McpAgentAdapter implements AgentTargetPort {
    private id;
    private targetType;
    private connected;
    private config?;
    private session?;
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
//# sourceMappingURL=McpAgentAdapter.d.ts.map