/**
 * SUT client v3 — cross-check of PR #3920 (gobeyondfj-cmd/x402, branch
 * feat/expected-amount, head 4232cf6) against the Argus acceptance matrix
 * A1–A9 on the S-BS-06 fault-injection stand.
 *
 * Difference vs client_v2.ts: the rejection logic under test is NOT ours.
 * The PR's own SpendControls.expectedAmount inside @x402/core (built from
 * the PR branch, installed as file:./x402-core-2.28.0.tgz) is the control.
 * This client only:
 *   - counts signer invocations (evidence boundary: pre-signer rejection
 *     vs actual signing), keeping the signer-call evidence discipline;
 *   - logs every 402 requirements offer verbatim;
 *   - logs every cycle error verbatim, extracting QuoteMismatchError
 *     fields (quoteKey / expected / offered / source) when present.
 *
 * Env (in addition to client_v2.ts env):
 *   XC_EXPECTED   spendControls.expectedAmount:
 *                 "$0.01" (explicit Money) | "first-accepted" | "false" (default)
 *   XC_TOLERANCE  spendControls.expectedAmountTolerance (optional, default 1.0)
 *
 * Evidence discipline: settlement is mocked by the stand; captures establish
 * that the client SIGNED (signer invocation) or was REJECTED BEFORE the
 * signer — never an on-chain transfer. Per-session throwaway unfunded keys.
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

interface CycleTarget {
  method: string;
  path: string;
}

function parseEndpointSequence(raw: string | undefined): CycleTarget[] | undefined {
  if (!raw) return undefined;
  const entries = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (entries.length === 0) return undefined;
  return entries.map((entry) => {
    const m = /^(GET|POST|PUT|DELETE|PATCH)\s+(\/.*)$/i.exec(entry);
    return m ? { method: m[1]!.toUpperCase(), path: m[2]! } : { method: "GET", path: entry };
  });
}

const endpointSequence = parseEndpointSequence(process.env.ENDPOINT_SEQUENCE);
const url = `${baseURL}${endpointPath}`;
const cycles = Number.parseInt(
  process.env.REQUEST_CYCLES || String(endpointSequence?.length ?? 1),
  10,
);
const eventLogPath = process.env.CLIENT_EVENT_LOG || undefined;

if (!evmPrivateKey) {
  console.error("Missing required EVM_PRIVATE_KEY environment variable");
  process.exit(1);
}

/* ----------------------------- event ledger ----------------------------- */

let signerCallCount = 0;
const startedAt = new Date().toISOString();

function emit(event: Record<string, unknown>): void {
  const line = JSON.stringify({ at: new Date().toISOString(), ...event });
  console.log(`[sut-client-v3] ${line}`);
  if (eventLogPath) {
    try {
      appendFileSync(eventLogPath, `${line}\n`, { encoding: "utf-8" });
    } catch {
      /* logging must never change SUT behaviour */
    }
  }
}

const short = (v: unknown, keep = 10): string => {
  const s = String(v ?? "");
  return s.length <= keep * 2 ? s : `${s.slice(0, keep)}…${s.slice(-4)}(len${s.length})`;
};

/** Цель для цикла c (1-based): ENDPOINT_SEQUENCE, последний элемент повторяется. */
function targetForCycle(cycle: number): { url: string; method: string } {
  const seq = endpointSequence;
  if (!seq || seq.length === 0) {
    return { url: `${baseURL}${endpointPath}`, method: "GET" };
  }
  const idx = Math.min(cycle - 1, seq.length - 1);
  return { url: `${baseURL}${seq[idx]!.path}`, method: seq[idx]!.method };
}

let currentTarget: { url: string; method: string } = {
  url: `${baseURL}${endpointSequence?.[0]?.path ?? endpointPath}`,
  method: endpointSequence?.[0]?.method ?? "GET",
};

/* ------------------------------ instrumentation -------------------------- */

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
        emit({ type: "quote_offered", cycle_context_url: currentTarget.url, requirements: body });
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
    control_under_test: "PR #3920 SpendControls.expectedAmount (@x402/core built from feat/expected-amount @4232cf6)",
    url: currentTarget.url,
    cycles,
    endpoint_sequence: endpointSequence ?? null,
    spend_controls: controls,
    note: "rejection logic is the PR's own; this harness adds observation only (signer counts, verbatim errors)",
  });

  const perCycle: {
    cycle: number;
    http?: number;
    error?: string;
    error_name?: string;
    quote_mismatch?: Record<string, string> | null;
    receipt?: unknown;
  }[] = [];

  for (let c = 1; c <= cycles; c++) {
    emit({ type: "cycle_start", cycle: c });
    currentTarget = targetForCycle(c);
    try {
      const response = await fetchWithPayment(currentTarget.url, { method: currentTarget.method });
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
      emit({ type: "cycle_result", cycle: c, http: response.status, receipt_served: receipt ?? null });
      perCycle.push({ cycle: c, http: response.status, receipt: receipt ?? null });
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
      emit({
        type: "cycle_error",
        cycle: c,
        error: err instanceof Error ? err.message : String(error),
        error_name: err?.name ?? "Error",
        quote_mismatch: quoteMismatch,
      });
      perCycle.push({
        cycle: c,
        error: err instanceof Error ? err.message : String(error),
        error_name: err?.name ?? "Error",
        quote_mismatch: quoteMismatch,
      });
    }
  }

  const summary = {
    probe: "S-BS-06 x PR #3920 cross-check",
    control_under_test: "PR #3920 expectedAmount",
    url,
    cycles,
    signer_call_count: signerCallCount,
    per_cycle: perCycle,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    distinction: "signed authorization captured; on-chain transfer NOT established (mocked settlement)",
  };
  console.log(`PROBE_SUMMARY: ${JSON.stringify(summary)}`);
  if (eventLogPath) {
    try {
      writeFileSync(`${eventLogPath}.summary`, JSON.stringify(summary, null, 2), { encoding: "utf-8" });
    } catch {
      /* non-fatal */
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[sut-client-v3] fatal: ${message}`);
  process.exit(1);
});
