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
import http from 'http';
/** Generate a unique ID */
function generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
/**
 * Structural validation of a Base64-encoded x402 V2 PAYMENT-SIGNATURE payload.
 * Expected shape:
 *   { x402Version, scheme, network, payload: { signature, authorization: {...} } }
 */
export function decodePaymentSignature(headerValue) {
    let json;
    try {
        json = Buffer.from(headerValue, 'base64').toString('utf-8');
    }
    catch {
        return { ok: false, reason: 'signature header is not valid base64' };
    }
    let parsed;
    try {
        parsed = JSON.parse(json);
    }
    catch {
        return { ok: false, reason: 'signature payload is not valid JSON' };
    }
    if (typeof parsed !== 'object' || parsed === null) {
        return { ok: false, reason: 'signature payload is not an object' };
    }
    const p = parsed;
    if (p.x402Version === undefined) {
        return { ok: false, reason: 'missing x402Version' };
    }
    if (typeof p.scheme !== 'string' || typeof p.network !== 'string') {
        return { ok: false, reason: 'missing scheme/network' };
    }
    const inner = p.payload;
    if (!inner || typeof inner !== 'object') {
        return { ok: false, reason: 'missing payload' };
    }
    if (typeof inner.signature !== 'string' || inner.signature.length === 0) {
        return { ok: false, reason: 'missing payload.signature' };
    }
    const auth = inner.authorization;
    if (!auth || typeof auth !== 'object') {
        return { ok: false, reason: 'missing payload.authorization' };
    }
    for (const field of ['from', 'to', 'value', 'validAfter', 'validBefore', 'nonce']) {
        if (typeof auth[field] !== 'string') {
            return { ok: false, reason: `missing payload.authorization.${field}` };
        }
    }
    return { ok: true, reason: 'ok', decoded: p };
}
export class X402AgentServer {
    config;
    server;
    actualPort = 0;
    requests = [];
    evidence = [];
    constructor(config) {
        this.config = {
            port: config.port ?? 0,
            host: config.host ?? '127.0.0.1',
            path: config.path ?? '/resource',
            ...config,
        };
    }
    /** Start listening. Resolves with the bound URL (use port 0 for ephemeral). */
    async start() {
        if (this.server) {
            throw new Error('X402AgentServer already started');
        }
        return new Promise((resolve, reject) => {
            const server = http.createServer((req, res) => {
                this.handle(req, res).catch((err) => {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: String(err) }));
                });
            });
            server.on('error', reject);
            server.listen(this.config.port, this.config.host, () => {
                const addr = server.address();
                this.actualPort = addr.port;
                resolve({
                    port: addr.port,
                    url: `http://${this.config.host}:${addr.port}${this.config.path}`,
                });
            });
            this.server = server;
        });
    }
    async stop() {
        if (!this.server)
            return;
        const server = this.server;
        this.server = undefined;
        await new Promise((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
        });
    }
    getUrl() {
        if (!this.actualPort) {
            throw new Error('X402AgentServer not started');
        }
        return `http://${this.config.host}:${this.actualPort}${this.config.path}`;
    }
    getRequests() {
        return this.requests;
    }
    getEvidence() {
        return this.evidence;
    }
    buildPaymentRequiredBody(url) {
        const pr = this.config.paymentRequirements;
        return {
            x402Version: 2,
            resource: { url },
            accepts: [
                {
                    scheme: pr.scheme,
                    network: pr.network,
                    // Canonical x402 V2 field name (x402/types). Kept for standard clients.
                    maxAmountRequired: pr.maxAmountRequired,
                    // Alias required by Secretariat's X402Parser (core/x402-parser.ts ->
                    // X402Accept.amount; acceptToRequirement maps amount -> requirement.amount).
                    // Without it the parser's filter (a.scheme && a.network && a.amount && a.payTo)
                    // drops our offer and Stage-A fails with "No payment requirement found".
                    // See reports/argus-secretariat-*.md (finding F-A3).
                    amount: pr.maxAmountRequired,
                    resource: url,
                    payTo: pr.payTo,
                    maxTimeoutSeconds: pr.maxTimeoutSeconds ?? 60,
                    asset: pr.asset,
                },
            ],
        };
    }
    record(type, data) {
        this.evidence.push({ source: 'x402-server', type, data, timestamp: Date.now() });
    }
    async handle(req, res) {
        const requestId = generateId('x402-req');
        let rawBody = '';
        for await (const chunk of req) {
            rawBody += chunk;
        }
        let body;
        try {
            body = rawBody ? JSON.parse(rawBody) : {};
        }
        catch {
            body = rawBody;
        }
        const headers = {};
        Object.entries(req.headers).forEach(([k, v]) => {
            if (v)
                headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
        });
        const url = this.getUrl();
        const signatureHeader = headers['payment-signature'];
        let responseStatus;
        let responseHeaders;
        let reason;
        let responseBody;
        if (!signatureHeader) {
            // No payment attached -> 402 + payment-required (header and body).
            const prBody = this.buildPaymentRequiredBody(url);
            const prBase64 = Buffer.from(JSON.stringify(prBody)).toString('base64');
            responseStatus = 402;
            responseHeaders = {
                'Content-Type': 'application/json',
                'payment-required': prBase64,
            };
            responseBody = prBody;
            reason = 'missing payment-signature';
            this.record('payment_required_issued', {
                requestId,
                method: req.method,
                url: req.url,
            });
        }
        else {
            const decoded = decodePaymentSignature(signatureHeader);
            if (decoded.ok) {
                // MVP: structural validation only. Full EIP-3009 signature recovery
                // is the responsibility of a verifier (e.g. Secretariat's
                // eip3009-verifier), not of this transport-level server.
                responseStatus = 200;
                const paymentResponse = Buffer.from(JSON.stringify({ success: true, network: this.config.paymentRequirements.network })).toString('base64');
                responseHeaders = {
                    'Content-Type': 'application/json',
                    'payment-response': paymentResponse,
                };
                responseBody = this.config.responseBody ?? { served: true };
                reason = 'payment-signature accepted';
                this.record('payment_signature_accepted', {
                    requestId,
                    scheme: decoded.decoded?.scheme,
                    network: decoded.decoded?.network,
                });
            }
            else {
                responseStatus = 402;
                const prBody = this.buildPaymentRequiredBody(url);
                responseHeaders = {
                    'Content-Type': 'application/json',
                    'payment-required': Buffer.from(JSON.stringify(prBody)).toString('base64'),
                };
                responseBody = prBody;
                reason = `invalid payment-signature: ${decoded.reason}`;
                this.record('payment_signature_rejected', {
                    requestId,
                    detail: decoded.reason,
                });
            }
        }
        this.requests.push({
            id: requestId,
            timestamp: Date.now(),
            method: req.method || 'GET',
            url: req.url || '/',
            headers,
            body,
            responseStatus,
            responseHeaders,
            reason,
        });
        this.record('request_received', {
            requestId,
            method: req.method,
            url: req.url,
            hasSignature: Boolean(signatureHeader),
            responseStatus,
        });
        res.writeHead(responseStatus, responseHeaders);
        res.end(JSON.stringify(responseBody));
    }
}
//# sourceMappingURL=X402AgentServer.js.map