/**
 * A1-S: Subject-reaction mock gateway for Secretariat-mediated trials.
 * SANDBOX HARNESS ONLY.
 *
 * Reproduces only the externally observable x402 boundary with deterministic
 * reaction profiles matching what Argus previously observed from each subject:
 *   - clawrouter profile: 402 (header scheme) -> paid retry -> 200; no idempotency
 *     support at all; timeout-after-payment = silence (client sees transport error).
 *   - franklin profile:   402 + X-Recovery-Capability headers (EXECUTION_IDEMPOTENT,
 *     RESULT_RETRIEVAL) — the recovery-capable seller semantics from its source.
 *   - blockrun profile:   canonical modes A-F ledger behavior (from A0 mock).
 *
 * Ground truth ledger per run is exposed via GET /__ledger?subject=...&scenario=...
 */
import http from 'node:http';

export interface GatewayFault {
  /** first-request behavior */
  firstPaymentOutcome?: 'accept' | 'reject' | 'unknown';
  /** after payment accepted: how the execution/response behaves */
  executionMode?: 'complete' | 'timeout' | 'lost_response' | 'fail';
  /** whether repeated economic actions create NEW executions (no idempotency) */
  honorIdempotency?: boolean;
  /** emit X-Recovery-Capability header on 402 */
  recoveryCapability?: string[];
  /** HTTP status used when executionMode='fail' */
  failStatus?: number;
}

interface LedgerEntry {
  subject: string; scenario: string; payments: number; executions: string[];
  executionStates: Record<string, string>; deliveredResponses: number;
  requests: Array<{ path: string; method: string; hasPaymentHeader: boolean; idempotencyKey?: string; at: number }>;
}

export function startSubjectGateway(opts: { port: number; subject: string; fault: GatewayFault }): Promise<{ server: http.Server; url: string }> {
  const ledger: LedgerEntry = {
    subject: opts.subject, scenario: '', payments: 0, executions: [],
    executionStates: {}, deliveredResponses: 0, requests: [],
  };
  let execSeq = 0;
  let paidOnce = false;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${opts.port}`);
    if (url.pathname === '/__ledger') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(ledger));
      return;
    }
    if (url.pathname === '/__reset') {
      ledger.payments = 0; ledger.executions = []; ledger.executionStates = {};
      ledger.deliveredResponses = 0; ledger.requests = []; paidOnce = false;
      res.writeHead(200); res.end('{}'); return;
    }

    const body = await new Promise<string>((resolve) => {
      let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => resolve(b));
    });
    const hasPayment = Boolean(req.headers['x-payment'] || req.headers['payment-signature'] || req.headers['x-payment-payload']);
    const idemKey = (req.headers['idempotency-key'] as string) ?? undefined;
    ledger.requests.push({ path: url.pathname, method: req.method ?? 'GET', hasPaymentHeader: hasPayment, idempotencyKey: idemKey, at: Date.now() });

    // Stage 1: unpriced request -> 402 Payment Required (x402v2 header scheme)
    if (!hasPayment) {
      const challenge = JSON.stringify({
        accepts: [{
          scheme: 'exact', network: 'base-sepolia', asset: '0x83358AFC21F91A7B8E0BEC6AC3BC3A7C0D33BD01',
          amount: '1000000', payTo: '0xSubjectSeller', maxTimeoutSeconds: opts.fault.challengeTimeoutSec ?? 300,
        }],
      });
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        // canonical Secretariat X402Parser expects base64(JSON) in PAYMENT-REQUIRED
        'PAYMENT-REQUIRED': Buffer.from(challenge).toString('base64'),
      };
      if (opts.fault.recoveryCapability) {
        headers['X-Recovery-Capability'] = opts.fault.recoveryCapability.join(',');
      }
      res.writeHead(402, headers);
      res.end(JSON.stringify({ error: 'X402_PAYMENT_REQUIRED', accepts: JSON.parse(challenge).accepts }));
      return;
    }

    // Stage 2: payment supplied
    if (opts.fault.firstPaymentOutcome === 'reject') {
      res.writeHead(402, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'PAYMENT_INVALID' }));
      return;
    }
    if (opts.fault.firstPaymentOutcome === 'unknown') {
      // simulate facilitator-side UNKNOWN: connection hangs then resets
      req.socket.destroy();
      return;
    }

    // payment accepted -> record economic fact
    const dupWithExisting = idemKey && ledger.executions.find((e) => ledger.executionStates[e + '|key'] === idemKey);
    if (opts.fault.honorIdempotency && idemKey && dupWithExisting) {
      // safe replay: same execution, response delivered again
      ledger.deliveredResponses += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, executionId: dupWithExisting, replayed: true, artifact: 'SUBJECT_ARTIFACT_V1' }));
      return;
    }
    ledger.payments += 1;
    const execId = `exec_${++execSeq}`;
    ledger.executions.push(execId);
    if (idemKey) ledger.executionStates[execId + '|key'] = idemKey;
    paidOnce = true;

    const mode = opts.fault.executionMode ?? 'complete';
    if (mode === 'timeout') {
      // execution starts, never responds within client timeout
      ledger.executionStates[execId] = 'started';
      // hang forever (until client timeout kills it)
      return;
    }
    if (mode === 'lost_response') {
      // execution completes internally, response intentionally not delivered
      ledger.executionStates[execId] = 'completed';
      req.socket.destroy();
      return;
    }
    if (mode === 'fail') {
      ledger.executionStates[execId] = 'failed';
      res.writeHead(opts.fault.failStatus ?? 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'EXECUTION_FAILED', executionId: execId }));
      return;
    }
    // complete
    ledger.executionStates[execId] = 'completed';
    ledger.deliveredResponses += 1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, executionId, artifact: 'SUBJECT_ARTIFACT_V1' }));
  });

  return new Promise((resolve) => {
    server.listen(opts.port, '127.0.0.1', () =>
      resolve({ server, url: `http://127.0.0.1:${opts.port}/resource` }));
  });
}
