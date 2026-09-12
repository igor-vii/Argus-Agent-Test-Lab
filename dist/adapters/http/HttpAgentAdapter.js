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
import { MessageDirection, ExchangeStatus, } from '../../core/AgentTargetPort';
/**
 * Generate a unique ID
 */
function generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
/**
 * HTTP Adapter implementation
 */
export class HttpAgentAdapter {
    id;
    targetType;
    connected = false;
    config;
    baseUrl;
    exchanges = [];
    evidences = [];
    constructor(targetType = 'http-target') {
        this.id = generateId('http-adapter');
        this.targetType = targetType;
    }
    getId() {
        return this.id;
    }
    getTargetType() {
        return this.targetType;
    }
    async connect(config) {
        if (config.transportType !== 'http') {
            return {
                success: false,
                error: `Invalid transport type: expected 'http', got '${config.transportType}'`,
            };
        }
        const httpConfig = config;
        if (!httpConfig.endpoint) {
            return {
                success: false,
                error: 'HTTP endpoint URL is required',
            };
        }
        try {
            // Validate URL format
            new URL(httpConfig.endpoint);
            this.config = httpConfig;
            this.baseUrl = httpConfig.endpoint;
            this.connected = true;
            return {
                success: true,
                connectionId: generateId('http-conn'),
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Invalid URL format: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
    isConnected() {
        return this.connected && !!this.baseUrl;
    }
    async send(runId, type, payload) {
        if (!this.isConnected()) {
            throw new Error('Not connected. Call connect() first.');
        }
        const exchange = {
            id: generateId('http-exch'),
            runId,
            direction: MessageDirection.OUTBOUND,
            type,
            timestamp: Date.now(),
            payload,
            status: ExchangeStatus.PENDING,
        };
        try {
            if (!this.baseUrl) {
                throw new Error('Base URL not configured');
            }
            const response = await this.makeHttpRequest(this.baseUrl, payload);
            exchange.status = ExchangeStatus.SUCCESS;
            exchange.payload = response.data;
            exchange.metadata = {
                statusCode: response.status,
                headers: response.headers,
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
        // For HTTP, receive typically means processing an incoming response
        // or polling for new data. Here we simulate receiving by making a GET request
        // or returning provided payload.
        const exchange = {
            id: generateId('http-exch'),
            runId,
            direction: MessageDirection.INBOUND,
            type,
            timestamp: Date.now(),
            payload,
            status: ExchangeStatus.SUCCESS,
        };
        this.exchanges.push(exchange);
        return exchange;
    }
    async captureEvidence(runId, type, data, description) {
        const evidence = {
            id: generateId('http-evid'),
            runId,
            type,
            timestamp: Date.now(),
            data,
            description,
            metadata: {
                adapterType: 'http',
                adapterId: this.id,
            },
        };
        this.evidences.push(evidence);
        return evidence;
    }
    async disconnect() {
        this.connected = false;
        this.baseUrl = undefined;
        this.config = undefined;
    }
    /**
     * Make an HTTP request with configured options
     */
    async makeHttpRequest(url, body) {
        const method = this.config?.options?.method ?? 'POST';
        const headers = {
            'Content-Type': this.config?.options?.contentType ?? 'application/json',
            ...this.config?.options?.headers,
        };
        const fetchOptions = {
            method,
            headers,
            body: method !== 'GET' ? JSON.stringify(body) : undefined,
        };
        if (this.config?.options?.withCredentials) {
            fetchOptions.credentials = 'include';
        }
        const timeoutMs = this.config?.timeoutMs ?? 30000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                ...fetchOptions,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            const responseHeaders = {};
            response.headers.forEach((value, key) => {
                responseHeaders[key] = value;
            });
            let data;
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                data = await response.json();
            }
            else {
                data = await response.text();
            }
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return {
                status: response.status,
                headers: responseHeaders,
                data,
            };
        }
        catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`Request timeout after ${timeoutMs}ms`);
            }
            throw error;
        }
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
        this.baseUrl = undefined;
        this.config = undefined;
        this.exchanges = [];
        this.evidences = [];
    }
}
//# sourceMappingURL=HttpAgentAdapter.js.map