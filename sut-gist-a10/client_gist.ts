/**
 * SUT client adapter for the gist candidate — Argus battery "gist-a10"
 * (pre-registered A10a/A10b identical-offer race matrix, x402 #4198, run #2).
 *
 * BASE = client_v5.ts race perimeter (sealed cycles argus-seal-0008/0012),
 * byte-equivalent instrumentation structure to client_boundra.ts (run #1):
 *   - signer-call counting at the signer boundary (wrapped signTypedData /
 *     signTypedDataAsync on the viem account, call_index + wall clock),
 *   - JSONL event ledger (signer_call / presign_decide / slot_start / slot_result / slot_error),
 *   - CONCURRENCY=2 slots in ONE process via Promise.allSettled (common start gate),
 *   - PROBE_SUMMARY with signer_call_count + per_slot timings,
 *   - settlement mocked, per-session throwaway unfunded keys, signatures NOT logged.
 *
 * EXACTLY TWO DIFFS vs client_v5.ts (the candidate is the variable):
 *   1. Control under test: the PINNED gist's pre-sign owner fence —
 *      gist e319a833e1be184a0df16ec69f474b72 @ revision df69c25fac01f68f6b71981e57b71699c12fd1b2
 *      (file sha256 d4395716de9feef0288288ac89b9b326569cf06c97dae50ac148bdb2e40dc6e6).
 *      The decision path (sha/canonical/digest/reserve) runs VERBATIM in a
 *      transport-only sidecar process (adapters/gist_sidecar_server.mjs, fragment
 *      byte-verified against the pinned file); this client's hook mirrors the
 *      pinned gist hook shape (its lines 64-69): intent = [method, url, sha(body),
 *      paymentRequired.resource, selectedRequirements], decision !== 'reserved'
 *      -> { abort: true, reason: decision }. GET adaptation: body = '' (empty).
 *   2. Per-slot reservation identity via AsyncLocalStorage: each race slot
 *      carries its own (account, purchaseId) into reserve() — mirrors the gist's
 *      account/purchaseId spec fields.
 *
 * Configuration facts recorded for the registry record (R3-equivalent):
 *   - Native spendControls ENABLED but NON-TRIGGERING (candidate-shaped): the
 *     pinned gist client sets allowedAssets maxAmountPerPayment '2000' at its own
 *     fixture scale; here '1000000' so the stand's atomic amounts (10000/100000)
 *     never trip it — the cap-refusal class is exercised verbatim by Layer 1
 *     (gist cases 11-12) instead of being silently dropped.
 *   - NO expectedAmount quote-control is configured (same R3 stance as run #1:
 *     expectation-independent semantics; the fence digests the canonical intent).
 *   - A10a/A10b mode labels are mechanically identical for this candidate —
 *     divergence between modes is an anomaly, not a mode effect.
 *
 * Env (superset of client_v5.ts):
 *   RESOURCE_SERVER_URL   stand base URL
 *   CONCURRENCY           N>=2 -> N simultaneous slots
 *   CLIENT_EVENT_LOG      jsonl event log path
 *   ENDPOINT_PATH         default /weather
 *   GIST_SIDECAR_URL      default http://127.0.0.1:4710
 *   GIST_ACCOUNT          account string for slot 1
 *   GIST_ACCOUNT_2        account string for slot 2 (defaults to GIST_ACCOUNT)
 *   GIST_PURCHASE_ID      purchase id for slot 1
 *   GIST_PURCHASE_ID_2    purchase id for slot 2 (defaults to GIST_PURCHASE_ID)
 *   XC_EXPECTED           recorded for comparability only (no control wired)
 */
import { config } from "dotenv";
import { wrapFetchWithPayment, x402Client, x402HTTPClient } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { appendFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://127.0.0.1:4401";
const endpointPath = process.env.ENDPOINT_PATH || "/weather";
const xcExpectedRecorded = process.env.XC_EXPECTED || "false"; // comparability only — see header
const concurrency = Math.max(1, Number.parseInt(process.env.CONCURRENCY || "1", 10));
const sidecarUrl = process.env.GIST_SIDECAR_URL || "http://127.0.0.1:4710";
const account1 = process.env.GIST_ACCOUNT || "account-slot-a";
const account2 = process.env.GIST_ACCOUNT_2 || account1;
const purchaseId1 = process.env.GIST_PURCHASE_ID || "purchase-slot-1";
const purchaseId2 = process.env.GIST_PURCHASE_ID_2 || purchaseId1;

if (!evmPrivateKey) {
  console.error("Missing required EVM_PRIVATE_KEY environment variable");
  process.exit(1);
}

const slots = concurrency > 1 ? concurrency : Math.max(1, Number.parseInt(process.env.REQUEST_CYCLES || "1", 10));
const url = `${baseURL}${endpointPath}`;

// The stand serves Base Sepolia USDC (same parameters as the run #1 battery).
const STAND_ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const STAND_NETWORK = "eip155:84532";

const als = new AsyncLocalStorage<{ slot: number; account: string; purchase_id: string }>();

/* ----------------------------- event ledger ----------------------------- */

let signerCallCount = 0;
const startedAt = new Date().toISOString();

function emit(event: Record<string, unknown>): void {
  const line = JSON.stringify({ at: new Date().toISOString(), ...event });
  console.log(`[sut-client-gist] ${line}`);
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
  // Candidate-shaped native spend controls, ENABLED but NON-TRIGGERING —
  // see header (R3-equivalent): cap scaled above the stand's atomic amounts;
  // no expectedAmount quote-control is configured.
  client.setSpendControls({
    allowedAssets: [{ network: STAND_NETWORK, asset: STAND_ASSET, maxAmountPerPayment: "1000000" }],
  });

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

  // The control under test — the pinned gist's pre-sign owner fence, mirrored
  // hook shape (pinned gist lines 64-69), per-slot identity through ALS.
  client.onBeforePaymentCreation(async (context: unknown) => {
    const store = als.getStore();
    if (!store) {
      emit({ type: "presign_decide", slot: null, account: null, purchase_id: null,
             decision: "no-als-context", reason: "ALS store missing — glue bug, fail loud" });
      return { abort: true, reason: "gist-a10 glue: no ALS context (harness bug)" };
    }
    const ctx = context as { paymentRequired: { resource: unknown; url?: string; method?: string };
                            selectedRequirements: unknown };
    // Glue mirrors the pinned gist hook's intent construction (its lines 66-67):
    //   digest(['POST', url, sha(body), paymentRequired.resource, selectedRequirements])
    // GET adaptation: the stand resource is fetched with GET and no body -> body = ''.
    const method = ctx.paymentRequired?.method ?? "GET";
    const resourceUrl = ctx.paymentRequired?.url ?? url;
    const intent = [method, resourceUrl, createHash("sha256").update("").digest("hex"),
                    ctx.paymentRequired?.resource, ctx.selectedRequirements];
    let decision: string;
    try {
      const res = await fetch(`${sidecarUrl}/reserve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account: store.account, purchase_id: store.purchase_id, intent }),
      });
      const payload = (await res.json()) as { decision?: string; error?: string };
      decision = payload.decision ?? `sidecar-error:${payload.error ?? res.status}`;
    } catch (error) {
      // fail closed: a transport error must never be read as a reservation
      decision = "sidecar-unreachable";
      emit({ type: "presign_transport_error", slot: store.slot, error: String(error) });
    }
    // Verbatim mapping from the pinned gist hook (its line 68):
    //   if (decision !== 'reserved') return { abort: true, reason: decision };
    const result = decision !== "reserved" ? { abort: true as const, reason: decision } : undefined;
    emit({
      type: "presign_decide",
      slot: store.slot,
      account: store.account,
      purchase_id: store.purchase_id,
      decision: result ? "rejected" : "allow",
      reason: result ? result.reason : null,
      raw_decision: decision,
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
      "gist pre-sign owner fence (e319a833e1be184a0df16ec69f474b72 @ df69c25fac01f68f6b71981e57b71699c12fd1b2, verbatim reserve/digest via transport-only sidecar)",
    url,
    concurrency: slots,
    xc_expected_recorded_only: xcExpectedRecorded,
    quote_control_configured: false,
    native_spend_controls: "enabled, non-triggering (maxAmountPerPayment 1000000 >= stand amounts; candidate-shaped)",
    gist: { sidecar_url: sidecarUrl, accounts: [account1, account2], purchase_ids: [purchaseId1, purchaseId2] },
    note: "rejection logic is the candidate's own (pinned verbatim reserve/digest); this harness adds observation only (signer counts, presign decisions, verbatim errors, slot timing)",
  });

  const perSlot: {
    slot: number;
    account?: string;
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
      account: slot === 1 ? account1 : account2,
      purchase_id: slot === 1 ? purchaseId1 : purchaseId2,
    };
    await als.run(store, async () => {
      const t0 = new Date().toISOString();
      emit({ type: "slot_start", slot, url, account: store.account, purchase_id: store.purchase_id });
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
        perSlot.push({ slot, account: store.account, purchase_id: store.purchase_id, started_at: t0, finished_at: finished, http: response.status, receipt: receipt ?? null });
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
          account: store.account,
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
    slot: s.slot, account: s.account, purchase_id: s.purchase_id,
  }));

  const summary = {
    probe: "S-BS-06 x gist df69c25 pre-sign owner fence battery (A10a/A10b matrix, x402 #4198)",
    control_under_test: "gist pre-sign owner fence (pinned df69c25, verbatim fragment)",
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
  console.error(`[sut-client-gist] fatal: ${message}`);
  process.exit(1);
});
