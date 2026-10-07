/**
 * A1 — Mock BlockRun GATEWAY for ClawRouter/Franklin probes (x402 v2 header scheme).
 * Speaks the REAL wire format consumed by @x402/fetch (as vendored in ClawRouter):
 *   402 challenge : HTTP 402 + base64(JSON PaymentRequired) in `PAYMENT-REQUIRED` header
 *                   (@x402/core getPaymentRequiredResponse reads the header first; body is
 *                    only accepted when x402Version===1 → earlier body-only v2 402 was
 *                    correctly rejected by the client: "Invalid payment required response")
 *   payment       : request header `PAYMENT-SIGNATURE` = base64(JSON payload) (v2)
 *   settlement    : response header `PAYMENT-RESPONSE` = base64(JSON {success,...})
 * Modes (POST /__mode): A happy, B timeout-after-payment, C lost-response,
 *                       D 500-after-payment, F idempotent-by-PAYMENT-REQUEST-ID.
 * Ground truth: GET /__ledger ; POST /__reset
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_CLAW_PORT ?? 8766);
const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
const state = { mode: 'A', payments: [], executions: [], byKey: new Map(), reqSeq: 0, execSeq: 0 };

function requirements(requestId) {
  return {
    x402Version: 2,
    error: 'X-PAYMENT header is required',
    resource: { url: `http://127.0.0.1:${PORT}/v1/partner/echo`, description: 'A1 mock gate', mimeType: 'application/json' },
    accepts: [{
      scheme: 'exact', network: 'eip155:84532', amount: '10000',
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      payTo: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      maxTimeoutSeconds: 60, extra: { name: 'USDC', version: '2' },
    }],
    _requestId: requestId,
  };
}
function json(res, code, obj, headers = {}) {
  res.writeHead(code, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(obj));
}
async function readBody(req) {
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {}; try { return JSON.parse(raw); } catch { return { _raw: raw.slice(0, 200) }; }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === '/__mode' && req.method === 'POST') {
    const b = await readBody(req);
    if (!['A','B','C','D','F'].includes(b.mode)) return json(res, 400, { error: 'bad mode' });
    state.mode = b.mode; return json(res, 200, { mode: state.mode });
  }
  if (url.pathname === '/__reset' && req.method === 'POST') {
    state.payments.length = 0; state.executions.length = 0; state.byKey.clear();
    state.reqSeq = 0; state.execSeq = 0; return json(res, 200, { reset: true });
  }
  if (url.pathname === '/__ledger' && req.method === 'GET') {
    return json(res, 200, { mode: state.mode, payments: state.payments, executions: state.executions });
  }
  if (url.pathname.startsWith('/v1/models')) return json(res, 200, { object: 'list', data: [] });

  if (url.pathname.startsWith('/v1/partner/echo')) {
    const bodyObj = await readBody(req);
    const requestId = `req_${++state.reqSeq}_${Date.now()}`;
    const sigHeader = req.headers['payment-signature'] ?? req.headers['x-payment'] ?? null;
    const idem = req.headers['payment-request-id'] ?? req.headers['x-idempotency-key'] ?? null;

    // Stage 1: payment gate. v2 challenge travels in the PAYMENT-REQUIRED header.
    if (!sigHeader) {
      return json(res, 402, { x402Version: 2, error: 'X-PAYMENT header is required' },
        { 'PAYMENT-REQUIRED': b64(requirements(requestId)), 'Cache-Control': 'no-store' });
    }

    let decoded = null;
    try { decoded = JSON.parse(Buffer.from(String(sigHeader), 'base64').toString('utf8')); } catch {}
    if (!decoded || !decoded.payload?.signature) {
      return json(res, 402, { x402Version: 2, error: 'invalid payment payload', reason: 'decode_failed' });
    }
    const paymentId = `pay_${state.payments.length + 1}`;
    state.payments.push({ paymentId, requestId, idempotencyKey: idem, timestamp: Date.now(),
      payer: decoded.payload?.from ?? null, amount: decoded.payload?.amount ?? null,
      network: decoded.network ?? null, scheme: decoded.scheme ?? null });

    // Idempotency replay (mode F): same economic identity → no second execution
    if (state.mode === 'F' && idem && state.byKey.has(idem)) {
      const prev = state.byKey.get(idem);
      return json(res, 200, { artifact: 'replayed-data', executionId: prev.executionId,
        paymentId: prev.paymentId, replayed: true, requestId, idempotencyKey: idem },
        { 'PAYMENT-RESPONSE': b64({ success: true, network: decoded.network, transaction: `mocktx_replay_${prev.executionId}`, payer: decoded.payload?.from ?? null }) });
    }

    // Stage 2: execution
    const executionId = `exec_${++state.execSeq}`;
    const exec = { executionId, paymentId, idempotencyKey: idem, status: 'started', startedAt: Date.now(), completedAt: null };
    state.executions.push(exec);
    if (idem) state.byKey.set(idem, { paymentId, executionId });
    const settleHdr = { 'PAYMENT-RESPONSE': b64({ success: true, network: decoded.network, transaction: `mocktx_${executionId}`, payer: decoded.payload?.from ?? null }) };

    switch (state.mode) {
      case 'B': // payment recorded, execution started, never responds → client-side timeout
        return; // socket hangs
      case 'C': { // payment recorded, execution completes internally, response destroyed
        exec.status = 'completed'; exec.completedAt = Date.now();
        res.destroy(); return;
      }
      case 'D': { // payment recorded, execution fails, explicit 500 (+settlement proof!)
        exec.status = 'failed'; exec.completedAt = Date.now();
        return json(res, 500, { error: { message: 'upstream execution failed (mock)', type: 'server_error' }, executionId, paymentId }, settleHdr);
      }
      default: { // A and F-first-attempt: full success
        exec.status = 'completed'; exec.completedAt = Date.now();
        return json(res, 200, { object: 'chat.completion', model: bodyObj.model ?? 'mock',
          choices: [{ message: { role: 'assistant', content: 'mock-completion' } }],
          artifact: 'first-execution-data', executionId, paymentId, requestId, idempotencyKey: idem }, settleHdr);
      }
    }
  }
  return json(res, 404, { error: 'not found' });
});
server.listen(PORT, '127.0.0.1', () => console.log(`[mock-gateway-claw] http://127.0.0.1:${PORT} (mode ${state.mode}, x402v2 header scheme)`));
