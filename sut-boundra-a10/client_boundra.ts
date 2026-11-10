/**
 * SUT client adapter for the Boundra candidate — Argus battery "boundra-a10"
 * (pre-registered A10a/A10b identical-offer race matrix, x402 #4198).
 *
 * BASE = client_v5.ts (sealed cycle-2/3 race client, argus-seal-0008/0012).
 * The instrumentation perimeter is UNCHANGED, byte-for-byte in structure:
 *   - signer-call counting at the signer boundary (wrapped signTypedData /
 *     signTypedDataAsync on the viem account, call_index + wall clock),
 *   - JSONL event ledger (signer_call / slot_start / slot_result / slot_error),
 *   - CONCURRENCY=N slots in ONE process via Promise.allSettled (common start
 *     gate = simultaneous launch in one event-loop turn),
 *   - PROBE_SUMMARY with signer_call_count + per_slot timings,
 *   - settlement mocked, per-session throwaway unfunded keys, signatures NOT logged.
 *
 * EXACTLY TWO DIFFS vs client_v5.ts (the candidate is the variable, the harness
 * is the constant):
 *   1. Control under test: instead of the PR #3920 setSpendControls
 *      (expectedAmount quote-control), the pre-sign gate is the PINNED Boundra
 *      TS SDK hook (createX402Hook -> BoundraClient.evaluate) against a local
 *      transport-only adapter that runs the pinned Gateway.evaluate_payment +
 *      SpendLedger reservation path (commit fb09284434b85f824b099ade4430e1b77b4c4086).
 *   2. Per-slot reservation identity via AsyncLocalStorage: each race slot
 *      carries its own (owner, purchaseId) into evaluate() — R2/pre-flight
 *      requirement; every evaluate is logged as a `presign_decide` event
 *      (added OBSERVATION ONLY; does not change SUT behaviour).
 *
 * Configuration facts recorded for the registry record (addendum R3):
 *   - NO quote-control in the candidate client: setSpendControls(expectedAmount)
 *     is NOT configured; the hook is created WITHOUT expected_amount /
 *     expected_recipient in BOTH modes. Justification: the onBeforePaymentCreation
 *     hook API exists only in @x402/fetch 2.30.0; stacking the 2.28.0 PR build
 *     with 2.30.0 would be a larger deviation. The candidate's dedup/conflict
 *     semantics are expectation-independent (digest over the canonical intent).
 *   - XC_EXPECTED is retained in env/probe_start for TOPOLOGY COMPARABILITY with
 *     the cycle-1/2/3 baseline only; it does not wire any control here, so both
 *     A10a/A10b modes are mechanically identical for this candidate — a result
 *     divergence BETWEEN modes is an anomaly, not a mode effect.
 *
 * Env (superset of client_v5.ts):
 *   RESOURCE_SERVER_URL   stand base URL
 *   CONCURRENCY           N>=2 -> N simultaneous slots
 *   CLIENT_EVENT_LOG      jsonl event log path
 *   ENDPOINT_PATH         default /weather
 *   BOUNDRA_ADAPTER_URL   default http://127.0.0.1:4610
 *   BOUNDRA_TS_SDK        absolute path to the pinned sdk/typescript/src/index.ts
 *   BOUNDRA_PURPOSE       default "weather API call (boundra-a10 battery)"
 *   BOUNDRA_OWNER         owner string for slot 1
 *   BOUNDRA_OWNER_2       owner string for slot 2 (defaults to BOUNDRA_OWNER)
 *   BOUNDRA_PURCHASE_ID   purchase id for slot 1
 *   BOUNDRA_PURCHASE_ID_2 purchase id for slot 2 (defaults to BOUNDRA_PURCHASE_ID)
 *   XC_EXPECTED           recorded for comparability only (no control wired)
 */
import { config } from "dotenv";
import { wrapFetchWithPayment, x402Client, x402HTTPClient } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { appendFileSync, writeFileSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { pathToFileURL } from "node:url";

config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://127.0.0.1:4401";
const endpointPath = process.env.ENDPOINT_PATH || "/weather";
const xcExpectedRecorded = process.env.XC_EXPECTED || "false"; // comparability only — see header
const concurrency = Math.max(1, Number.parseInt(process.env.CONCURRENCY || "1", 10));
const adapterUrl = process.env.BOUNDRA_ADAPTER_URL || "http://127.0.0.1:4610";
const tsSdkPath = process.env.BOUNDRA_TS_SDK || "";
const purpose = process.env.BOUNDRA_PURPOSE || "weather API call (boundra-a10 battery)";
const owner1 = process.env.BOUNDRA_OWNER || "owner-slot-a";
const owner2 = process.env.BOUNDRA_OWNER_2 || owner1;
const purchaseId1 = process.env.BOUNDRA_PURCHASE_ID || "purchase-slot-1";
const purchaseId2 = process.env.BOUNDRA_PURCHASE_ID_2 || purchaseId1;

if (!evmPrivateKey) {
  console.error("Missing required EVM_PRIVATE_KEY environment variable");
  process.exit(1);
}
if (!tsSdkPath) {
  console.error("Missing required BOUNDRA_TS_SDK environment variable (pinned SDK path)");
  process.exit(1);
}

const slots = concurrency > 1 ? concurrency : Math.max(1, Number.parseInt(process.env.REQUEST_CYCLES || "1", 10));
const url = `${baseURL}${endpointPath}`;

const als = new AsyncLocalStorage<{ slot: number; owner: string; purchase_id: string }>();

/* ----------------------------- event ledger ----------------------------- */

let signerCallCount = 0;
const startedAt = new Date().toISOString();

function emit(event: Record<string, unknown>): void {
  const line = JSON.stringify({ at: new Date().toISOString(), ...event });
  console.log(`[sut-client-boundra] ${line}`);
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
  // Pinned Boundra TS SDK (commit fb09284) — the candidate's own client surface.
  const sdk = (await import(pathToFileURL(tsSdkPath).href)) as typeof import("../../../boundra/sdk/typescript/src/index");
  const { BoundraClient, createX402Hook } = sdk;

  const client = new x402Client();
  // NOTE (R3): NO setSpendControls expectedAmount here — see file header.

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

  // The control under test — the pinned candidate's own pre-sign hook, wired
  // per-slot through ALS so each race slot carries its own (owner, purchaseId).
  client.onBeforePaymentCreation(async (context: unknown) => {
    const store = als.getStore();
    if (!store) {
      emit({ type: "presign_decide", slot: null, owner: null, purchase_id: null,
             decision: "no-als-context", reason: "ALS store missing — glue bug, fail loud" });
      return { abort: true, reason: "boundra-a10 glue: no ALS context (harness bug)" };
    }
    const boundra = new BoundraClient({
      baseUrl: adapterUrl,
      owner: store.owner,
      fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init), // loopback adapter, NOT the wrapped fetch
    });
    const hook = createX402Hook(boundra, { purpose, purchaseId: store.purchase_id });
    const result = (await hook(context as never)) as void | { abort: true; reason: string };
    emit({
      type: "presign_decide",
      slot: store.slot,
      owner: store.owner,
      purchase_id: store.purchase_id,
      decision: result && result.abort ? "rejected" : "allow",
      reason: result && result.abort ? result.reason : null,
    });
    return result;
  });

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
      "Boundra pre-sign reservation boundary (gobeyondfj-cmd/boundra @ fb09284434b85f824b099ade4430e1b77b4c4086, TS SDK createX402Hook, transport-only local adapter)",
    url,
    concurrency: slots,
    xc_expected_recorded_only: xcExpectedRecorded,
    quote_control_configured: false,
    boundra: { adapter_url: adapterUrl, purpose, owners: [owner1, owner2], purchase_ids: [purchaseId1, purchaseId2] },
    note: "rejection logic is the candidate's own (pinned Gateway+SpendLedger); this harness adds observation only (signer counts, presign decisions, verbatim errors, slot timing)",
  });

  const perSlot: {
    slot: number;
    owner?: string;
    purchase_id?: string;
    started_at: string;
    finished_at?: string;
    http?: number;
    error?: string;
    error_name?: string;
    receipt?: unknown;
  }[] = [];

  const runSlot = async (slot: number): Promise<void> => {
    const store = {
      slot,
      owner: slot === 1 ? owner1 : owner2,
      purchase_id: slot === 1 ? purchaseId1 : purchaseId2,
    };
    await als.run(store, async () => {
      const t0 = new Date().toISOString();
      emit({ type: "slot_start", slot, url, owner: store.owner, purchase_id: store.purchase_id });
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
        perSlot.push({ slot, owner: store.owner, purchase_id: store.purchase_id, started_at: t0, finished_at: finished, http: response.status, receipt: receipt ?? null });
      } catch (error) {
        const err = error as Error & Record<string, unknown>;
        const finished = new Date().toISOString();
        emit({
          type: "slot_error",
          slot,
          error: err instanceof Error ? err.message : String(error),
          error_name: err?.name ?? "Error",
        });
        perSlot.push({
          slot,
          owner: store.owner,
          purchase_id: store.purchase_id,
          started_at: t0,
          finished_at: finished,
          error: err instanceof Error ? err.message : String(error),
          error_name: err?.name ?? "Error",
        });
      }
    });
  };

  if (concurrency > 1) {
    // The first-contact race: N simultaneous calls, one process, shared client.
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
    receipt: s.receipt,
  }));

  const presignDecisions = perSlot.map((s) => ({
    slot: s.slot, owner: s.owner, purchase_id: s.purchase_id,
  }));

  const summary = {
    probe: "S-BS-06 x Boundra fb09284 pre-sign reservation battery (A10a/A10b matrix, x402 #4198)",
    control_under_test: "Boundra pre-sign reservation (pinned fb09284)",
    url,
    concurrency: slots,
    signer_call_count: signerCallCount,
    per_cycle: perCycle,
    per_slot: perSlot,
    presign_decisions: presignDecisions,
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
  console.error(`[sut-client-boundra] fatal: ${message}`);
  process.exit(1);
});
