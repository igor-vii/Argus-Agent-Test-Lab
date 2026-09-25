import http from 'http';
/**
 * Mock HTTP server for testing x402 flows.
 * Simulates a target that returns 402 Payment Required with x402 V2 headers.
 */
export class MockX402Server {
    server;
    port = 0;
    behavior = { type: '200', body: {} };
    requests = [];
    setBehavior(behavior) {
        this.behavior = behavior;
    }
    getRequests() {
        return this.requests;
    }
    async start() {
        return new Promise((resolve) => {
            this.server = http.createServer((req, res) => {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', () => {
                    const headers = {};
                    Object.entries(req.headers).forEach(([k, v]) => {
                        if (v)
                            headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
                    });
                    this.requests.push({
                        method: req.method || 'GET',
                        url: req.url || '/',
                        headers,
                        body: body ? JSON.parse(body) : undefined,
                    });
                    const { type, paymentRequired, responseBody, delayMs } = this.behavior;
                    const sendResponse = () => {
                        // If request has payment-signature header, check behavior type
                        if (headers['payment-signature']) {
                            // If behavior is 402_reject_signature, return 402 even with signature
                            if (type === '402_reject_signature' && paymentRequired) {
                                const headerValue = Buffer.from(JSON.stringify(paymentRequired)).toString('base64');
                                res.writeHead(402, {
                                    'Content-Type': 'application/json',
                                    'payment-required': headerValue
                                });
                                res.end(JSON.stringify({ error: 'Signature rejected' }));
                                return;
                            }
                            // Otherwise treat as paid (return 200)
                            const paymentResponse = Buffer.from(JSON.stringify({
                                txHash: '0x1234...',
                                status: 'success',
                            })).toString('base64');
                            res.writeHead(200, {
                                'Content-Type': 'application/json',
                                'payment-response': paymentResponse,
                            });
                            res.end(JSON.stringify(responseBody || { paid: true, signatureReceived: true }));
                            return;
                        }
                        if (type === '402_with_header' && paymentRequired) {
                            const headerValue = Buffer.from(JSON.stringify(paymentRequired)).toString('base64');
                            res.writeHead(402, {
                                'Content-Type': 'application/json',
                                'payment-required': headerValue
                            });
                            res.end(JSON.stringify({ error: 'Payment Required' }));
                        }
                        else if (type === '402_with_body_only' && paymentRequired) {
                            res.writeHead(402, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify(paymentRequired));
                        }
                        else if (type === '402_invalid_header') {
                            res.writeHead(402, {
                                'Content-Type': 'application/json',
                                'payment-required': 'not-valid-base64!!!'
                            });
                            res.end(JSON.stringify(responseBody || { error: 'Invalid' }));
                        }
                        else if (type === '500') {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Internal Server Error' }));
                        }
                        else if (type === 'delay' && delayMs) {
                            setTimeout(() => {
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify(responseBody || { delayed: true }));
                            }, delayMs);
                            return;
                        }
                        else {
                            // Default 200
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify(responseBody || { success: true }));
                        }
                    };
                    if (delayMs && type !== 'delay') {
                        setTimeout(sendResponse, delayMs);
                    }
                    else {
                        sendResponse();
                    }
                });
            });
            this.server.listen(0, () => {
                const address = this.server.address();
                this.port = address.port;
                resolve({ port: this.port, url: `http://localhost:${this.port}` });
            });
        });
    }
    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => resolve());
            }
            else {
                resolve();
            }
        });
    }
}
//# sourceMappingURL=MockX402Server.js.map