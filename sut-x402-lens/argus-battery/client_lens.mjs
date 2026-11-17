/**
 * Lab client for the x402-lens battery (Argus Agent Test Lab).
 *
 * BASE = sealed client_v5.ts race perimeter structure (client_gist.ts lineage,
 * argus-seal-0008/0012) adapted to a SERVER-side SUT: the candidate is the
 * resource-server middleware, so the lab client is a PLAIN honest buyer —
 *   - real @x402/fetch wrapFetchWithPayment over the instrumented viem account,
 *   - signer-call counting at the signer boundary (call_index + wall clock),
 *   - JSONL event ledger (probe_start / quote_offered / signer_call /
 *     http_request / slot_start / slot_result / slot_error / replay_capture),
 *   - PROBE_SUMMARY with signer_call_count + per_slot outcomes,
 *   - settlement mocked at the LAB facilitator; per-session throwaway unfunded
 *     keys; signatures NOT logged (replay capture stays in process memory).
 *
 * Differences vs client_gist.ts (the candidate is server-side now):
 *   1. NO pre-sign owner fence / sidecar — the SUT owns no client-side control.
 *   2. NO native spendControls — the buyer is deliberately unconfigured; the
 *      SUT is the variable under test, not the client.
 *   3. REPLAY mode (CLIENT_REPLAY=1): slot 1 performs a normal paid flow; the
 *      exact PAYMENT-SIGNATURE header it sent is captured in memory and slot 2
 *      resends it verbatim via raw fetch (zero new signer calls). The header
 *      value itself is never written to any log.
 *
 * Env:
 *   RESOURCE_SERVER_URL   SUT base URL
 *   CLIENT_EVENT_LOG      jsonl event log path
 *   ENDPOINT_PATH         default /weather
 *   CLIENT_METHOD         GET (default) | POST
 *   CLIENT_CONCURRENCY    N slots in one process (default 1)
 *   CLIENT_REPLAY         1 = two-slot replay mode (slot 2 resends slot 1 header)
 *   CLIENT_GRANT_HEADER   value for x-argus-grant (grant session), or empty
 *   EVM_PRIVATE_KEY       throwaway unfunded key
 */
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { appendFileSync, writeFileSync } from "node:fs";

const evmPrivateKey = process.env.EVM_PRIVATE_KEY;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://127.0.0.1:5030";
const endpointPath = process.env.ENDPOINT_PATH || "/weather";
const method = process.env.CLIENT_METHOD || "GET";
const concurrency = Math.max(1, Number.parseInt(process.env.CLIENT_CONCURRENCY || "1", 10));
const replayMode = process.env.CLIENT_REPLAY === "1";
const grantHeader = process.env.CLIENT_GRANT_HEADER || "";

if (!evmPrivateKey) {
  console.error("Missing required EVM_PRIVATE_KEY environment variable");
  process.exit(1);
}

const slots = replayMode ? 2 : concurrency;
const url = `${baseURL}${endpointPath}`;

/* ----------------------------- event ledger ----------------------------- */

let signerCallCount = 0;
const startedAt = new Date().toISOString();

function emit(event) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...event });
  console.log(`[sut-client-lens] ${line}`);
  if (process.env.CLIENT_EVENT_LOG) {
    try { appendFileSync(process.env.CLIENT_EVENT_LOG, `${line}\n`, { encoding: "utf-8" }); } catch { /* logging must never change SUT behaviour */ }
  }
}

const short = (v, keep = 10) => {
  const s = String(v ?? "");
  return s.length <= keep * 2 ? s : `${s.slice(0, keep)}…${s.slice(-4)}(len${s.length})`;
};

/* ------------------------------ main ------------------------------------- */

async function main() {
  const client = new x402Client();
  const rawAccount = privateKeyToAccount(evmPrivateKey);

  const wrapSignTypedData =
    (label, orig) =>
    async (args) => {
      const message = (args.message ?? {});
      signerCallCount += 1;
      emit({
        type: "signer_call",
        call_index: signerCallCount,
        signer_entry: label,
        primary_type: String(args.primaryType ?? ""),
        domain: {
          name: args.domain?.name,
          version: args.domain?.version,
          chainId: args.domain?.chainId,
          verifyingContract: args.domain?.verifyingContract,
        },
        to: String(message.to ?? ""),
        value: message.value !== undefined ? BigInt(String(message.value)).toString() : undefined,
        from: String(message.from ?? ""),
        valid_after: message.validAfter !== undefined ? String(message.validAfter) : undefined,
        valid_before: message.validBefore !== undefined ? String(message.validBefore) : undefined,
        nonce: short(message.nonce),
        // NOTE: signature is deliberately NOT logged (usable authorization).
      });
      return orig(args);
    };

  const instrumentedAccount = {
    ...rawAccount,
    signTypedData: wrapSignTypedData("signTypedData", rawAccount.signTypedData.bind(rawAccount)),
    ...(rawAccount.signTypedDataAsync
      ? { signTypedDataAsync: wrapSignTypedData("signTypedDataAsync", rawAccount.signTypedDataAsync.bind(rawAccount)) }
      : {}),
  };
  client.register("eip155:*", new ExactEvmScheme(instrumentedAccount));

  // The exact PAYMENT-SIGNATURE header the paid retry carries — captured in
  // process memory ONLY (replay session); never written to the ledger.
  let capturedPaymentHeader = null;

  const loggingFetch = async (input, init) => {
    const headerFrom = (headers) => {
      if (!headers) return null;
      if (typeof headers.get === "function") return headers.get("payment-signature");
      if (Array.isArray(headers)) {
        const hit = headers.find(([k]) => String(k).toLowerCase() === "payment-signature");
        return hit ? hit[1] : null;
      }
      for (const [k, v] of Object.entries(headers)) {
        if (String(k).toLowerCase() === "payment-signature") return v;
      }
      return null;
    };
    const paymentHeader = headerFrom(init?.headers) ?? (typeof input === "object" && input?.headers ? headerFrom(input.headers) : null);
    if (paymentHeader && !capturedPaymentHeader) {
      capturedPaymentHeader = String(paymentHeader);
      let nonceHint = null;
      try {
        const decoded = JSON.parse(Buffer.from(capturedPaymentHeader, "base64").toString("utf-8"));
        const auth = decoded?.payload?.authorization ?? {};
        nonceHint = short(auth.nonce);
        emit({ type: "replay_capture", captured: true, nonce_short: nonceHint, value_logged: false });
      } catch {
        emit({ type: "replay_capture", captured: true, nonce_short: null, value_logged: false, note: "header not JSON-decodable in process" });
      }
    }
    const res = await fetch(input, init);
    emit({ type: "http_request", method: init?.method ?? (typeof input === "object" && input?.method) ?? "GET", status: res.status, payment_header_present: !!paymentHeader });
    if (res.status === 402) {
      try {
        const body = await res.clone().json();
        const accepts = Array.isArray(body?.accepts) ? body.accepts : null;
        emit({
          type: "quote_offered",
          x402_version: body?.x402Version ?? null,
          accepts_count: accepts ? accepts.length : null,
          first_accept: accepts && accepts[0]
            ? {
                scheme: accepts[0].scheme ?? null,
                network: accepts[0].network ?? null,
                amount: accepts[0].amount ?? null,
                payTo: accepts[0].payTo ?? null,
                asset: typeof accepts[0].asset === "string" ? short(accepts[0].asset, 12) : null,
              }
            : null,
        });
      } catch {
        emit({ type: "quote_offered_unparseable" });
      }
    }
    return res;
  };

  const fetchWithPayment = wrapFetchWithPayment(loggingFetch, client);

  emit({
    type: "probe_start",
    control_under_test: "x402-lens middleware (server-side SUT) — plain honest lab buyer, no client-side controls",
    url,
    method,
    slots,
    replay_mode: replayMode,
    grant_header: grantHeader ? "set" : "none",
    note: "the lab client adds observation only; every decision under test is the SUT's",
  });

  const perSlot = [];

  const decodeReceipt = (res) => {
    const prHeader = res.headers.get("payment-response");
    if (!prHeader) return null;
    try { return JSON.parse(Buffer.from(prHeader, "base64").toString("utf-8")); }
    catch { return { unparsable: short(prHeader, 24) }; }
  };

  const exposeHeaders = (res) => {
    const pick = (name) => res.headers.get(name);
    return {
      expose: pick("access-control-expose-headers"),
      allow_headers: pick("access-control-allow-headers"),
      allow_origin: pick("access-control-allow-origin"),
      payment_required_present: !!pick("payment-required"),
    };
  };

  const runSlot = async (slot) => {
    const t0 = new Date().toISOString();
    const init = {
      method: slot === 2 && replayMode ? "GET" : method,
      ...(grantHeader ? { headers: { "x-argus-grant": grantHeader } } : {}),
    };
    emit({ type: "slot_start", slot, url, mode: slot === 2 && replayMode ? "replay-resend" : "paid-flow" });
    try {
      let res;
      if (slot === 2 && replayMode) {
        if (!capturedPaymentHeader) throw new Error("replay slot 2: no captured payment header (slot 1 produced none)");
        res = await loggingFetch(url, { method: "GET", headers: { "PAYMENT-SIGNATURE": capturedPaymentHeader } });
      } else {
        res = await fetchWithPayment(url, init);
      }
      const finished = new Date().toISOString();
      const record = {
        slot,
        started_at: t0,
        finished_at: finished,
        http: res.status,
        receipt: decodeReceipt(res),
        cors: exposeHeaders(res),
      };
      emit({ type: "slot_result", slot, http: res.status, receipt_success: record.receipt?.success ?? null, receipt_error: record.receipt?.errorReason ?? null });
      perSlot.push(record);
    } catch (error) {
      const err = error;
      emit({ type: "slot_error", slot, error: err instanceof Error ? err.message : String(error), error_name: err?.name ?? "Error" });
      perSlot.push({ slot, started_at: t0, finished_at: new Date().toISOString(), error: err instanceof Error ? err.message : String(error), error_name: err?.name ?? "Error" });
    }
  };

  if (replayMode) {
    // Replay requires the slot-1 header FIRST: sequential, not racing.
    for (const s of [1, 2]) await runSlot(s);
  } else {
    await Promise.allSettled(Array.from({ length: slots }, (_, i) => runSlot(i + 1)));
  }

  const summary = {
    probe: "x402-lens server-side battery — honest lab buyer perimeter",
    url,
    method,
    slots,
    replay_mode: replayMode,
    signer_call_count: signerCallCount,
    per_slot: perSlot,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    distinction: "signed authorization captured by the SUT path; on-chain transfer NOT established (lab-facilitator settlement)",
  };
  console.log(`PROBE_SUMMARY: ${JSON.stringify(summary)}`);
  if (process.env.CLIENT_EVENT_LOG) {
    try { writeFileSync(`${process.env.CLIENT_EVENT_LOG}.summary`, JSON.stringify(summary, null, 2), { encoding: "utf-8" }); } catch { /* non-fatal */ }
  }
}

main().catch((error) => {
  console.error(`[sut-client-lens] fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
