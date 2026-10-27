/**
 * SUT client v5 — concurrency-capable cross-check client for PR #3920
 * verification cycle 2 (red-zone sessions A10a/A10b).
 *
 * The green-zone regression sessions keep client_v3.ts unchanged (same
 * methodology as the sealed argus-seal-0004 run). This client is identical
 * in instrumentation perimeter to client_v3.ts (signer-call counting at the
 * signer boundary, verbatim 402 requirement logs, verbatim cycle errors,
 * typed QuoteMismatchError field recovery from wrapped messages) and adds
 * exactly one capability:
 *
 *   CONCURRENCY=N  fires N fetchWithPayment calls SIMULTANEOUSLY inside this
 *                  ONE process (shared x402Client + shared quote ledger —
 *                  the first-contact window under test) via Promise.allSettled.
 *                  Each slot is logged with its index and wall-clock timing.
 *
 * Evidence discipline (unchanged): settlement is mocked by the stand;
 * captures establish that the client SIGNED (signer invocation) or was
 * REJECTED BEFORE the signer — never an on-chain transfer. Per-session
 * throwaway unfunded keys. Signatures are deliberately NOT logged.
 *
 * Env (superset of client_v3.ts):
 *   RESOURCE_SERVER_URL  stand base URL
 *   REQUEST_CYCLES       with CONCURRENCY=1 behaves exactly like v3
 *   CONCURRENCY          N>=2 -> N simultaneous slots (overrides cycle count)
 *   XC_EXPECTED          "$0.01" (explicit Money) | "first-accepted" | "false"
 *   XC_TOLERANCE         spendControls.expectedAmountTolerance (optional)
 *   CLIENT_EVENT_LOG     jsonl event log path
 *   ENDPOINT_PATH        default /weather
 */
import { config } from "dotenv";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { appendFileSync, writeFileSync } from "node:fs";

config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://127.0.0.1:4401";
const endpointPath = process.env.ENDPOINT_PATH || "/weather";
const xcExpected = process.env.XC_EXPECTED || "false"; // "$0.01" | "first-accepted" | "false"
const xcTolerance = process.env.XC_TOLERANCE || undefined;
const concurrency = Math.max(1, Number.parseInt(process.env.CONCURRENCY || "1", 10));

if (!evmPrivateKey) {
  console.error("Missing required EVM_PRIVATE_KEY environment variable");
  process.exit(1);
}

const slots = concurrency > 1 ? concurrency : Math.max(1, Number.parseInt(process.env.REQUEST_CYCLES || "1", 10));
const url = `${baseURL}${endpointPath}`;

/* ----------------------------- event ledger ----------------------------- */

let signerCallCount = 0;
const startedAt = new Date().toISOString();

function emit(event: Record<string, unknown>): void {
  const line = JSON.stringify({ at: new Date().toISOString(), ...event });
  console.log(`[sut-client-v5] ${line}`);
  if (process.env.CLIENT_EVENT_LOG) {
    try {
      appendFileSync(process.env.CLIENT_EVENT_LOG, `${line}\n`, { encoding: "utf-8" });
    } catch {
      /* logging must never change SUT behaviour */
    }
  }
}

const short = (v: unknown, keep = 10): string => {
  const s = String(v ?? "");
  return s.length <= keep * 2 ? s : `${s.slice(0, keep)}…${s.slice(-4)}(len${s.length})`;
};

/* ------------------------------ main ------------------------------------- */

async function main(): Promise<void> {
  const client = new x402Client();
  // The control under test — configured per the PR's public API:
  const controls: Record<string, unknown> = { maxAmountPerPayment: "$1" };
  if (xcExpected && xcExpected !== "false") {
    controls.expectedAmount = xcExpected === "first-accepted" ? "first-accepted" : xcExpected;
    if (xcTolerance) controls.expectedAmountTolerance = Number(xcTolerance);
  }
  client.setSpendControls(controls as never);

  const rawAccount = privateKeyToAccount(evmPrivateKey!);
  const wrapSignTypedData =
    (label: string, orig: (args: Record<string, unknown>) => Promise<string>) =>
    async (args: Record<string, unknown>): Promise<string> => {
      const message = (args.message ?? {}) as Record<string, unknown>;
      signerCallCount += 1;
      emit({
        type: "signer_call",
        call_index: signerCallCount,
        signer_entry: label,
        primary_type: String(args.primaryType ?? ""),
        domain: {
          name: (args.domain as Record<string, unknown> | undefined)?.name,
          version: (args.domain as Record<string, unknown> | undefined)?.version,
          chainId: (args.domain as Record<string, unknown> | undefined)?.chainId,
          verifyingContract: (args.domain as Record<string, unknown> | undefined)?.verifyingContract,
        },
        to: String(message.to ?? ""),
        value: message.value !== undefined ? BigInt(String(message.value)).toString() : undefined,
        from: String(message.from ?? ""),
        valid_after: message.validAfter !== undefined ? String(message.validAfter) : undefined,
        valid_before: message.validBefore !== undefined ? String(message.validBefore) : undefined,
        nonce: short(message.nonce as string | undefined),
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

  client.register("eip155:*", new ExactEvmScheme(instrumentedAccount as never));

  const loggingFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await fetch(input, init);
    if (res.status === 402) {
      try {
        const body = await res.clone().json();
        emit({ type: "quote_offered", requirements: body });
      } catch {
        emit({ type: "quote_offered_unparseable" });
      }
    }
    return res;
  };

  const fetchWithPayment = wrapFetchWithPayment(loggingFetch as typeof fetch, client);
  const httpClient = new x402HTTPClient(client);

  emit({
    type: "probe_start",
    control_under_test:
      "PR #3920 SpendControls.expectedAmount (@x402/core built from feat/expected-amount, verification cycle 2)",
    url,
    concurrency: slots,
    spend_controls: controls,
    note: "rejection logic is the PR's own; this harness adds observation only (signer counts, verbatim errors, slot timing)",
  });

  const perSlot: {
    slot: number;
    started_at: string;
    finished_at?: string;
    http?: number;
    error?: string;
    error_name?: string;
    quote_mismatch?: Record<string, string> | null;
    receipt?: unknown;
  }[] = [];

  const runSlot = async (slot: number): Promise<void> => {
    const t0 = new Date().toISOString();
    emit({ type: "slot_start", slot, url });
    try {
      const response = await fetchWithPayment(url, { method: "GET" });
      let receipt: unknown;
      const prHeader = response.headers.get("payment-response");
      if (prHeader) {
        try {
          receipt = JSON.parse(Buffer.from(prHeader, "base64").toString("utf-8"));
        } catch {
          receipt = { unparsable: short(prHeader, 24) };
        }
      }
      await httpClient.processResponse(response).catch(() => undefined);
      const finished = new Date().toISOString();
      emit({ type: "slot_result", slot, http: response.status, receipt_served: receipt ?? null });
      perSlot.push({ slot, started_at: t0, finished_at: finished, http: response.status, receipt: receipt ?? null });
    } catch (error) {
      const err = error as Error & Record<string, unknown>;
      const isQM = err?.name === "QuoteMismatchError";
      const quoteMismatch = isQM
        ? {
            quoteKey: String(err.quoteKey ?? ""),
            expected: String(err.expected ?? ""),
            offered: String(err.offered ?? ""),
            source: String(err.source ?? ""),
          }
        : null;
      const finished = new Date().toISOString();
      emit({
        type: "slot_error",
        slot,
        error: err instanceof Error ? err.message : String(error),
        error_name: err?.name ?? "Error",
        quote_mismatch: quoteMismatch,
      });
      perSlot.push({
        slot,
        started_at: t0,
        finished_at: finished,
        error: err instanceof Error ? err.message : String(error),
        error_name: err?.name ?? "Error",
        quote_mismatch: quoteMismatch,
      });
    }
  };

  if (concurrency > 1) {
    // The first-contact race: N simultaneous calls, one process, shared ledger.
    await Promise.allSettled(Array.from({ length: slots }, (_, i) => runSlot(i + 1)));
  } else {
    for (let i = 1; i <= slots; i++) await runSlot(i);
  }

  // per_cycle alias keeps the orchestrator's fact extraction unchanged.
  const perCycle = perSlot.map((s) => ({
    cycle: s.slot,
    http: s.http,
    error: s.error,
    error_name: s.error_name,
    quote_mismatch: s.quote_mismatch,
    receipt: s.receipt,
  }));

  const summary = {
    probe: "S-BS-06 x PR #3920 cross-check (cycle 2, race sessions)",
    control_under_test: "PR #3920 expectedAmount",
    url,
    concurrency: slots,
    signer_call_count: signerCallCount,
    per_cycle: perCycle,
    per_slot: perSlot,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    distinction: "signed authorization captured; on-chain transfer NOT established (mocked settlement)",
  };
  console.log(`PROBE_SUMMARY: ${JSON.stringify(summary)}`);
  if (process.env.CLIENT_EVENT_LOG) {
    try {
      writeFileSync(`${process.env.CLIENT_EVENT_LOG}.summary`, JSON.stringify(summary, null, 2), { encoding: "utf-8" });
    } catch {
      /* non-fatal */
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[sut-client-v5] fatal: ${message}`);
  process.exit(1);
});
