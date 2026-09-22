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
import { MessageDirection, ExchangeStatus, } from '../../core/AgentTargetPort';
/**
 * Generate a unique ID
 */
function generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
/**
 * Parse the 'payment-required' header (Base64-encoded JSON) into PaymentRequired.
 * Falls back to parsing the response body if header is missing.
 */
function parsePaymentRequired(response) {
    // Try header first (lowercase key)
    const headerValue = response.headers['payment-required'];
    let rawBase64;
    let parsedBody;
    if (headerValue) {
        rawBase64 = headerValue;
        try {
            const decoded = Buffer.from(headerValue, 'base64').toString('utf-8');
            const maybeBody = JSON.parse(decoded);
            // Validate structure before accepting
            if (maybeBody.x402Version !== undefined &&
                Array.isArray(maybeBody.accepts) &&
                maybeBody.accepts.length > 0) {
                parsedBody = maybeBody;
            }
            else {
                // Header present but structurally invalid — fall through to body
                rawBase64 = undefined;
            }
        }
        catch {
            // Header present but not Base64/JSON — fall through to body
            rawBase64 = undefined;
        }
    }
    // Fallback: try response body
    if (!parsedBody && typeof response.data === 'object' && response.data !== null) {
        const body = response.data;
        if (body.x402Version && Array.isArray(body.accepts)) {
            parsedBody = body;
            // Encode body back to Base64 for raw field
            rawBase64 = Buffer.from(JSON.stringify(body)).toString('base64');
        }
    }
    if (!parsedBody || !rawBase64 || parsedBody.accepts.length === 0) {
        return null;
    }
    // Extract fields from the first accepted scheme
    const firstAccept = parsedBody.accepts[0];
    return {
        raw: rawBase64,
        parsed: parsedBody,
        scheme: firstAccept.scheme,
        network: firstAccept.network,
        amount: firstAccept.maxAmountRequired,
        asset: firstAccept.asset,
        payTo: firstAccept.payTo,
        maxTimeoutSeconds: firstAccept.maxTimeoutSeconds,
    };
}
export class X402AgentAdapter {
    id;
    targetType;
    connected = false;
    config;
    baseUrl;
    exchanges = [];
    evidences = [];
    constructor(targetType = 'x402-target') {
        this.id = generateId('x402-adapter');
        this.targetType = targetType;
    }
    getId() {
        return this.id;
    }
    getTargetType() {
        return this.targetType;
    }
    async connect(config) {
        if (config.transportType !== 'x402') {
            return {
                success: false,
                error: `Invalid transport type: expected 'x402', got '${config.transportType}'`,
            };
        }
        if (!config.endpoint) {
            return {
                success: false,
                error: 'x402 endpoint URL is required',
            };
        }
        try {
            // Validate URL format
            new URL(config.endpoint);
            this.config = config;
            this.baseUrl = config.endpoint;
            this.connected = true;
            return {
                success: true,
                connectionId: generateId('x402-conn'),
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
            id: generateId('x402-exch'),
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
            // Handle HTTP 402 Payment Required
            if (response.status === 402) {
                const paymentRequired = parsePaymentRequired(response);
                exchange.status = ExchangeStatus.PAYMENT_REQUIRED;
                exchange.payload = response.data;
                exchange.paymentRequired = paymentRequired ?? undefined;
                exchange.metadata = {
                    statusCode: response.status,
                    headers: response.headers,
                };
                // If we couldn't parse payment requirements, record as failure
                if (!paymentRequired) {
                    exchange.status = ExchangeStatus.FAILURE;
                    exchange.error = 'Received 402 but could not parse payment requirements';
                }
            }
            else if (response.status >= 200 && response.status < 300) {
                exchange.status = ExchangeStatus.SUCCESS;
                exchange.payload = response.data;
                exchange.metadata = {
                    statusCode: response.status,
                    headers: response.headers,
                };
            }
            else {
                exchange.status = ExchangeStatus.FAILURE;
                exchange.error = `HTTP ${response.status}: ${response.statusText || 'Unknown error'}`;
                exchange.metadata = {
                    statusCode: response.status,
                    headers: response.headers,
                };
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isTimeout = errorMessage.includes('timeout');
            exchange.status = isTimeout ? ExchangeStatus.TIMEOUT : ExchangeStatus.FAILURE;
            exchange.error = errorMessage;
            exchange.metadata = {
                errorType: error instanceof Error ? error.constructor.name : 'unknown',
            };
        }
        this.exchanges.push(exchange);
        return exchange;
    }
    async sendWithSignature(runId, type, payload, paymentSignature) {
        if (!this.isConnected()) {
            throw new Error('Not connected. Call connect() first.');
        }
        const exchange = {
            id: generateId('x402-exch'),
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
            // Add payment-signature header
            const extraHeaders = {
                'payment-signature': paymentSignature,
            };
            const response = await this.makeHttpRequest(this.baseUrl, payload, extraHeaders);
            // Capture payment-response header if present
            const paymentResponseHeader = response.headers['payment-response'];
            const metadata = {
                statusCode: response.status,
                headers: response.headers,
            };
            if (paymentResponseHeader) {
                metadata.paymentResponse = paymentResponseHeader;
            }
            // Handle HTTP 402 again (signature may have been rejected)
            if (response.status === 402) {
                const paymentRequired = parsePaymentRequired(response);
                exchange.status = ExchangeStatus.PAYMENT_REQUIRED;
                exchange.payload = response.data;
                exchange.paymentRequired = paymentRequired ?? undefined;
                exchange.metadata = metadata;
                if (!paymentRequired) {
                    exchange.status = ExchangeStatus.FAILURE;
                    exchange.error = 'Received 402 but could not parse payment requirements';
                }
            }
            else if (response.status >= 200 && response.status < 300) {
                exchange.status = ExchangeStatus.SUCCESS;
                exchange.payload = response.data;
                exchange.metadata = metadata;
            }
            else {
                exchange.status = ExchangeStatus.FAILURE;
                exchange.error = `HTTP ${response.status}: ${response.statusText || 'Unknown error'}`;
                exchange.metadata = metadata;
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isTimeout = errorMessage.includes('timeout');
            exchange.status = isTimeout ? ExchangeStatus.TIMEOUT : ExchangeStatus.FAILURE;
            exchange.error = errorMessage;
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
        const exchange = {
            id: generateId('x402-exch'),
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
            id: generateId('x402-evid'),
            runId,
            type,
            timestamp: Date.now(),
            data,
            description,
            metadata: {
                adapterType: 'x402',
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
     * Make an HTTP request with timeout and optional extra headers
     */
    async makeHttpRequest(url, body, extraHeaders) {
        const method = 'POST';
        const configHeaders = this.config?.options?.headers ?? {};
        const additionalHeaders = extraHeaders ?? {};
        const headers = {
            'Content-Type': 'application/json',
            ...configHeaders,
            ...additionalHeaders,
        };
        const fetchOptions = {
            method,
            headers,
            body: JSON.stringify(body),
        };
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
            return {
                status: response.status,
                statusText: response.statusText,
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
//# sourceMappingURL=X402AgentAdapter.js.map