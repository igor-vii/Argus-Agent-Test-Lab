/**
 * A0 RE-AUDIT — Minimal disposable LOCAL mock BlockRun gateway.
 * NOT a "full BlockRun". Reproduces only the externally observable
 * x402/payment -> execution -> response boundary required for testing:
 *
 *   REQUEST -> 402 Payment Required -> payment supplied -> payment accepted
 *           -> execution behavior (per deterministic mode) -> response /
 *           timeout / lost response.
 *
 * Modes (POST /__mode {mode}, POST /__reset):
 *   A HAPPY_PATH                        pay ok, exec completes, response returned
 *   B PAYMENT_ACCEPTED_EXECUTION_TIMEOUT pay ok, exec starts, never responds
 *   C PAYMENT_ACCEPTED_RESPONSE_LOST    pay ok, exec completes internally, no delivery
 *   D PAYMENT_ACCEPTED_EXECUTION_FAILURE pay ok, exec fails, HTTP 500
 *   E PAYMENT_ACCEPTED_THEN_RETRY       attempt1 enters UNKNOWN (no response),
 *                                       attempt2 allowed; ledger shows whether
 *                                       payment/action duplicated
 *   F IDEMPOTENT_RETRY                  same idempotencyKey -> replayed=true,
 *                                       NO second economic execution
 *
 * Observability endpoints (ground truth for the harness ONLY; a real SUT
 * would not expose these — they exist so we can compare Argus's external
 * observations against what actually happened server-side):
 *   GET  /__ledger  -> payments[], executions[] with ids/timestamps/status
 *   POST /__reset   -> clears ledger and mode state
 *
 * No production logic is added to Argus to support this.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 8765);

// Mock accepts any structurally-valid x402 payment; records it as accepted.
// (Signature cryptographic verification is intentionally out of scope:
// the sandbox tests the observation/assertion chain, not x402 validity.)

const state = {
  mode: 'A',
  payments: [],   // { paymentId, requestId, idempotencyKey, timestamp }
  executions: [], // { executionId, paymentId, idempotencyKey, status, startedAt, completedAt }
  byKey: new Map(), // idempotencyKey -> { paymentId, executionId }
  reqSeq: 0,
  execSeq: 0,
};

function json(res, code, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json',
    ...headers,
  });
  res.end(body);
}

function paymentRequirements(requestId) {
  // Shape must satisfy canonical X402AgentAdapter.parsePaymentRequired():
  // body fallback requires { x402Version: 2, resource: { url }, accepts: [] }.
  const body = {
    x402Version: 2,
    error: 'X-PAYMENT header is required',
    resource: {
      url: `http://127.0.0.1:${PORT}/resource?resourceId=res-1`,
      description: 'A0 sandbox mock gate',
      mimeType: 'application/json',
    },
    accepts: [
      {
        scheme: 'exact',
        network: 'base-sepolia',
        amount: '10000',
        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        payTo: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        maxTimeoutSeconds: 60,
        extra: { name: 'USDC', version: '2' },
      },
    ],
    _requestId: requestId,
  };
  return body;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { _raw: raw }; }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname === '/__mode' && req.method === 'POST') {
    const b = await readBody(req);
    if (!['A','B','C','D','E','F'].includes(b.mode)) return json(res, 400, { error: 'bad mode' });
    state.mode = b.mode;
    return json(res, 200, { mode: state.mode });
  }
  if (url.pathname === '/__reset' && req.method === 'POST') {
    state.payments.length = 0;
    state.executions.length = 0;
    state.byKey.clear();
    state.reqSeq = 0;
    state.execSeq = 0;
    return json(res, 200, { reset: true });
  }
  if (url.pathname === '/__ledger' && req.method === 'GET') {
    return json(res, 200, {
      mode: state.mode,
      payments: state.payments,
      executions: state.executions,
    });
  }

  if (url.pathname === '/resource') { // any method (canonical adapter default is POST)
    let idem = req.headers['idempotency-key'] ?? null;
    // Canonical X402AgentAdapter sends the action payload as a JSON body and
    // does NOT map resourceId/idempotencyKey to headers/query. Read them from
    // the body so the harness stays pure-canonical (no adapter modifications).
    let bodyObj = {};
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      try { bodyObj = await readBody(req); } catch { bodyObj = {}; }
      if (!idem && typeof bodyObj.idempotencyKey === 'string') idem = bodyObj.idempotencyKey;
    }
    const requestId = `req_${++state.reqSeq}_${Date.now()}`;
    const paymentHeader = req.headers['payment-signature'] ?? req.headers['x-payment'];

    // ---- Stage 1: payment gate -------------------------------------------
    if (!paymentHeader) {
      return json(res, 402, paymentRequirements(requestId));
    }
    // Payment supplied: record acceptance (structural check only).
    const paymentId = `pay_${state.payments.length + 1}`;
    state.payments.push({
      paymentId, requestId, idempotencyKey: idem, timestamp: Date.now(),
    });

    // ---- Stage 2: execution boundary per mode ----------------------------
    const runExecution = (status, completionMs) => {
      const executionId = `exec_${++state.execSeq}`;
      const ex = {
        executionId, paymentId, idempotencyKey: idem,
        status: 'started', startedAt: Date.now(), completedAt: null,
      };
      state.executions.push(ex);
      setTimeout(() => {
        ex.status = status;
        ex.completedAt = Date.now();
      }, completionMs).unref?.();
      return ex;
    };

    switch (state.mode) {
      case 'A': { // HAPPY_PATH
        // Mode A is also used (extra.mts probe [3]) as a NON-idempotent
        // seller: a duplicate idempotency key still creates a NEW
        // payment+execution here. That is intentional — it reproduces a
        // seller WITHOUT idempotency protection so the assertion gap
        // (PASS despite duplicate economics) becomes observable.
        const ex = runExecution('completed', 10);
        if (idem) state.byKey.set(idem, { paymentId, executionId: ex.executionId });
        // X-PAYMENT-RESPONSE style header (opaque receipt; base64 JSON).
        const receipt = Buffer.from(JSON.stringify({
          paymentId, transactionHash: `0xmock${paymentId}`, network: 'base-sepolia',
          payer: '0xMOCK', payTo: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          success: true,
        })).toString('base64');
        return json(res, 200, {
          artifact: `data-for-${url.searchParams.get('resourceId') ?? 'res-1'}`,
          executionId: ex.executionId, paymentId, requestId, idempotencyKey: idem,
        }, { 'x-payment-response': receipt });
      }

      case 'B': { // PAYMENT_ACCEPTED_EXECUTION_TIMEOUT
        runExecution('started', 60_000); // stays 'started' far beyond client timeout
        // Never respond. Client times out; server holds the socket open.
        return; // no res.end -> hangs until client timeout
      }

      case 'C': { // PAYMENT_ACCEPTED_RESPONSE_LOST
        const ex = runExecution('completed', 10); // execution DOES complete
        setTimeout(() => { /* deliberately never deliver response */ }, 20).unref?.();
        return; // response intentionally dropped after internal completion
      }

      case 'D': { // PAYMENT_ACCEPTED_EXECUTION_FAILURE
        const ex = runExecution('failed', 10);
        return json(res, 500, {
          error: 'execution_failed',
          executionId: ex.executionId, paymentId, requestId,
        });
      }

      case 'E': { // PAYMENT_ACCEPTED_THEN_RETRY
        // Attempt 1: UNKNOWN — payment accepted, execution started, response
        // never delivered (hang -> client timeout).
        // Attempt 2 onward: allowed, executes again; the ledger then shows
        // whether payment/action were duplicated by the retry.
        const priorExecsForThisMode = state.executions.filter((e) => e.idempotencyKey === idem);
        if (priorExecsForThisMode.length === 0) {
          runExecution('started', 60_000);
          return; // hang -> client timeout -> UNKNOWN
        }
        const ex = runExecution('completed', 10);
        return json(res, 200, {
          artifact: 'retry-delivered-data',
          executionId: ex.executionId, paymentId, requestId, attempt: 2,
        });
      }

      case 'F': { // IDEMPOTENT_RETRY
        if (idem && state.byKey.has(idem)) {
          const prev = state.byKey.get(idem);
          // Replay: do NOT create a second execution. Ledger shows
          // payments=2 (client paid twice at HTTP layer) but executions=1
          // (economic action performed once) — the idempotent-seller shape.
          return json(res, 200, {
            artifact: 'replayed-data',
            executionId: prev.executionId, paymentId: prev.paymentId,
            replayed: true, requestId, idempotencyKey: idem,
          });
        }
        const ex = runExecution('completed', 10);
        if (idem) state.byKey.set(idem, { paymentId, executionId: ex.executionId });
        return json(res, 200, {
          artifact: 'first-execution-data',
          executionId: ex.executionId, paymentId, requestId, idempotencyKey: idem,
        });
      }
    }
  }

  json(res, 404, { error: 'not_found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-gateway] listening on http://127.0.0.1:${PORT} (mode ${state.mode})`);
});
