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
import { MessageDirection, ExchangeStatus, } from '../../core/AgentTargetPort';
/**
 * Generate a unique ID
 */
function generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
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
export class McpAgentAdapter {
    id;
    targetType;
    connected = false;
    config;
    session;
    exchanges = [];
    evidences = [];
    constructor(targetType = 'mcp-target') {
        this.id = generateId('mcp-adapter');
        this.targetType = targetType;
    }
    getId() {
        return this.id;
    }
    getTargetType() {
        return this.targetType;
    }
    async connect(config) {
        if (config.transportType !== 'mcp') {
            return {
                success: false,
                error: `Invalid transport type: expected 'mcp', got '${config.transportType}'`,
            };
        }
        const mcpConfig = config;
        // Validate configuration
        const options = mcpConfig.options ?? {};
        const transport = options.transport ?? 'stdio';
        if (transport === 'stdio' && !options.command) {
            return {
                success: false,
                error: 'MCP command is required for stdio transport',
            };
        }
        if (transport === 'sse' && !options.url) {
            return {
                success: false,
                error: 'MCP URL is required for SSE transport',
            };
        }
        try {
            // STUB: In a real implementation, this would:
            // 1. Spawn MCP process or connect to SSE endpoint
            // 2. Initialize MCP session
            // 3. Negotiate capabilities
            // 4. List available tools/resources
            this.config = mcpConfig;
            this.session = {
                sessionId: generateId('mcp-session'),
                connected: true,
                capabilities: ['tools', 'resources'], // Stub capabilities
            };
            this.connected = true;
            return {
                success: true,
                connectionId: this.session.sessionId,
            };
        }
        catch (error) {
            return {
                success: false,
                error: `MCP connection failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
    isConnected() {
        return this.connected && !!this.session?.connected;
    }
    async send(runId, type, payload) {
        if (!this.isConnected()) {
            throw new Error('Not connected. Call connect() first.');
        }
        const exchange = {
            id: generateId('mcp-exch'),
            runId,
            direction: MessageDirection.OUTBOUND,
            type,
            timestamp: Date.now(),
            payload,
            status: ExchangeStatus.PENDING,
        };
        try {
            // STUB: In a real implementation, this would:
            // 1. Convert payload to MCP tool call or message
            // 2. Send via MCP session
            // 3. Wait for response
            // 4. Parse MCP response
            // Simulate MCP tool call behavior
            const mcpMessage = {
                jsonrpc: '2.0',
                method: type,
                params: payload,
                id: exchange.id,
            };
            // Simulate successful MCP response
            exchange.status = ExchangeStatus.SUCCESS;
            exchange.payload = {
                result: 'MCP operation completed',
                messageId: exchange.id,
            };
            exchange.metadata = {
                mcpMessageType: 'tool_call',
                mcpMessage: JSON.stringify(mcpMessage),
            };
        }
        catch (error) {
            exchange.status = ExchangeStatus.FAILURE;
            exchange.error = error instanceof Error ? error.message : String(error);
            exchange.metadata = {
                errorType: error instanceof Error ? error.constructor.name : 'unknown',
            };
        }
        this.exchanges.push(exchange);
        return exchange;
    }
    async receive(runId, type, payload) {
        if (!this.isConnected()) {
            throw new Error('Not connected. Call connect() first.');
        }
        // For MCP, receive typically means processing notifications or events
        // from the MCP server
        const exchange = {
            id: generateId('mcp-exch'),
            runId,
            direction: MessageDirection.INBOUND,
            type,
            timestamp: Date.now(),
            payload,
            status: ExchangeStatus.SUCCESS,
        };
        // STUB: In a real implementation, this would:
        // 1. Read from MCP session event stream
        // 2. Parse MCP notifications/events
        // 3. Convert to Exchange format
        this.exchanges.push(exchange);
        return exchange;
    }
    async captureEvidence(runId, type, data, description) {
        const evidence = {
            id: generateId('mcp-evid'),
            runId,
            type,
            timestamp: Date.now(),
            data,
            description,
            metadata: {
                adapterType: 'mcp',
                adapterId: this.id,
                sessionId: this.session?.sessionId,
            },
        };
        this.evidences.push(evidence);
        return evidence;
    }
    async disconnect() {
        // STUB: In a real implementation, this would:
        // 1. Close MCP session gracefully
        // 2. Terminate MCP process if spawned
        // 3. Clean up resources
        this.connected = false;
        this.session = undefined;
        this.config = undefined;
    }
    /**
     * Get all recorded exchanges (for testing/inspection)
     */
    getExchanges() {
        return [...this.exchanges];
    }
    /**
     * Get all recorded evidence (for testing/inspection)
     */
    getEvidences() {
        return [...this.evidences];
    }
    /**
     * Reset adapter state (for testing)
     */
    reset() {
        this.connected = false;
        this.session = undefined;
        this.config = undefined;
        this.exchanges = [];
        this.evidences = [];
    }
}
//# sourceMappingURL=McpAgentAdapter.js.map