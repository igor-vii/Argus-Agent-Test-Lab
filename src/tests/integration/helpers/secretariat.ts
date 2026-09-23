/**
 * Helpers for Argus <-> Secretariat (Zeus api-server) integration tests.
 *
 * Everything here is ENV-driven — no hardcoded URLs or keys:
 *  - SECRETARIAT_URL            base URL of a running Secretariat api-server
 *                               (e.g. http://localhost:4021). Unset => real
 *                               Secretariat tests are skipped.
 *  - ARGUS_TEST_WALLET_PRIVATE_KEY / BASE_SEPOLIA_RPC_URL as in .env.example.
 *
 * This module only ADAPTS formats between the two systems; it does not modify
 * X402AgentAdapter, PaymentAdapter, ExecutionRegistry, RunOrchestrator or
 * ScenarioEngine.
 */

import type { PaymentRequired } from '../../../core/AgentTargetPort';
import type { PaymentAdapter } from '../../../adapters/payment/PaymentAdapter';

export const SECRETARIAT_URL = (process.env['SECRETARIAT_URL'] ?? '').replace(/\/$/, '');

export function secretariatAvailable(): boolean {
  return SECRETARIAT_URL.length > 0;
}

export interface SecretariatStageARequestInput {
  target: string;
  method?: string;
  payload?: unknown;
  policy: {
    maxPrice: string;
    allowedNetworks: string[];
    allowedAssets: string[];
    allowedSellers?: string[];
    authorizationMode: 'explicit' | 'policy-bound';
  };
  /** Present ONLY when ZEUS_SIGNER_MODE=custodial_test (server signs itself). */
  authorizer?: string;
  requestId?: string;
  clientId?: string;
}

export interface HttpResult<T = Record<string, unknown>> {
  status: number;
  body: T;
}

export async function postJson<T = Record<string, unknown>>(
  url: string,
  body: unknown,
): Promise<HttpResult<T>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text.slice(0, 500) };
  }
  return { status: res.status, body: parsed as T };
}

export async function getJson<T = Record<string, unknown>>(
  url: string,
): Promise<HttpResult<T>> {
  const res = await fetch(url);
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text.slice(0, 500) };
  }
  return { status: res.status, body: parsed as T };
}

/**
 * Create a Stage-A request on Secretariat (Secretariat then performs x402
 * discovery against `target`, validates policy and persists a DPI).
 */
export function createStageARequest(
  input: SecretariatStageARequestInput,
): Promise<HttpResult> {
  return postJson(`${SECRETARIAT_URL}/v1/requests`, input);
}

export function getRequestStatus(requestId: string): Promise<HttpResult> {
  return getJson(`${SECRETARIAT_URL}/v1/requests/${encodeURIComponent(requestId)}`);
}

export function submitPayment(
  requestId: string,
  payload: Record<string, unknown>,
): Promise<HttpResult> {
  return postJson(
    `${SECRETARIAT_URL}/v1/requests/${encodeURIComponent(requestId)}/payment`,
    payload,
  );
}

/**
 * paymentRequired (as returned by POST /v1/requests) -> Argus PaymentRequired.
 *
 * NOTE: Secretariat's canonical V2 requirement uses `amount` + `payee`;
 * Argus' X402 parser maps the seller-header form (`maxAmountRequired`/`payTo`).
 * We feed signX402Payment() the canonical Secretariat values so the signature
 * binds to what Eip3009PaymentVerifier checks.
 */
export function argusPaymentRequiredFromSecretariat(
  pr: Record<string, unknown>,
): PaymentRequired {
  const acceptsEntry = {
    scheme: String(pr.scheme ?? 'exact'),
    network: String(pr.network),
    maxAmountRequired: String(pr.amount),
    resource: String(pr.resource ?? ''),
    payTo: String(pr.payee ?? pr.payTo),
    maxTimeoutSeconds: Number(pr.maxTimeoutSeconds ?? 60),
    asset: String(pr.asset),
  };
  return {
    raw: Buffer.from(JSON.stringify({ accepts: [acceptsEntry] })).toString('base64'),
    parsed: {
      x402Version: 2,
      resource: { url: acceptsEntry.resource },
      accepts: [acceptsEntry],
    },
    scheme: acceptsEntry.scheme,
    network: acceptsEntry.network,
    amount: acceptsEntry.maxAmountRequired,
    asset: acceptsEntry.asset,
    payTo: acceptsEntry.payTo,
    maxTimeoutSeconds: acceptsEntry.maxTimeoutSeconds,
  };
}

/**
 * Convert the Base64 envelope produced by PaymentAdapter.signX402Payment()
 * into the CANONICAL x402 V2 JSON object that Secretariat's
 * Eip3009PaymentVerifier requires (it needs an `accepted` binding section).
 *
 * The signature itself is NOT touched — we only attach the accepted terms.
 */
export function toCanonicalV2Payload(
  signedBase64: string,
  secretariatPaymentRequired: Record<string, unknown>,
): Record<string, unknown> {
  const envelope = JSON.parse(
    Buffer.from(signedBase64, 'base64').toString('utf-8'),
  ) as {
    x402Version: number;
    scheme: string;
    network: string;
    payload: { signature: string; authorization: Record<string, string> };
  };

  const auth = envelope.payload.authorization;
  const accepted = {
    scheme: envelope.scheme,
    network: envelope.network,
    // Canonical bindings come from the persisted Secretariat intent:
    asset: String(secretariatPaymentRequired.asset),
    amount: String(secretariatPaymentRequired.amount),
    payTo: String(
      auth.to ?? secretariatPaymentRequired.payee ?? secretariatPaymentRequired.payTo,
    ),
    maxTimeoutSeconds: Number(secretariatPaymentRequired.maxTimeoutSeconds ?? 60),
  };

  return {
    x402Version: 2,
    accepted,
    payload: envelope.payload,
  };
}

/** Sign via Argus PaymentAdapter and adapt to Secretariat's wire format. */
export async function signAndAdapt(
  adapter: PaymentAdapter,
  secretariatPaymentRequired: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const argusPr = argusPaymentRequiredFromSecretariat(secretariatPaymentRequired);
  const signed = await adapter.signX402Payment(argusPr);
  return toCanonicalV2Payload(signed, secretariatPaymentRequired);
}

// ---------------------------------------------------------------------------
// Exact-binding signer (Argus-side integration helper; no core changes)
// ---------------------------------------------------------------------------
//
// Secretariat's Eip3009PaymentVerifier binds the submitted payload against the
// DURABLE payment intent (DPI), not just the seller terms:
//   authorization.nonce       === dpi.nonce            (NONCE_MISMATCH)
//   authorization.validAfter  === dpi.validAfter       (VALID_AFTER_MISMATCH)
//   authorization.validBefore === dpi.validBefore      (VALID_BEFORE_MISMATCH)
// while PaymentAdapter.signX402Payment() generates its own random nonce and a
// fresh validity window. The DPI values are returned by POST /v1/requests in
// `paymentRequired` (see state-machine buildAwaitingSignatureResult), so the
// correct integration shape is: SIGN EXACTLY what the intermediary persisted.
//
// This helper uses viem directly with the SAME well-known test key that every
// existing Argus integration test already uses (ENV-driven). It does NOT
// modify PaymentAdapter/X402AgentAdapter/ExecutionRegistry/etc.

import { privateKeyToAccount } from 'viem/accounts';
import type { Address, Hex } from 'viem';

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

export interface DomainOverride {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: string;
}

export async function signExactDpiAuthorization(opts: {
  privateKey: `0x${string}`;
  /** paymentRequired object returned by POST /v1/requests (contains DPI bindings). */
  paymentRequired: Record<string, unknown>;
  /**
   * EIP-712 domain override. Secretariat resolves it from env
   * ZEUS_EIP3009_DOMAIN_NAME/VERSION + network->chainId + asset address.
   * Keep in sync with the running Secretariat config.
   */
  domain: DomainOverride;
}): Promise<Record<string, unknown>> {
  const account = privateKeyToAccount(opts.privateKey);
  const pr = opts.paymentRequired;
  const authorization = {
    from: account.address as Address,
    to: String(pr.payee ?? pr.payTo) as Address,
    value: BigInt(String(pr.value ?? pr.amount)),
    validAfter: BigInt(String(pr.validAfter)),
    validBefore: BigInt(String(pr.validBefore)),
    nonce: String(pr.nonce) as Hex,
  };
  const signature = await account.signTypedData({
    domain: {
      name: opts.domain.name ?? 'USD Coin',
      version: opts.domain.version ?? '2',
      chainId: BigInt(opts.domain.chainId ?? 84532),
      verifyingContract: String(opts.domain.verifyingContract ?? pr.asset) as Address,
    },
    types: EIP3009_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  });

  return {
    x402Version: 2,
    accepted: {
      scheme: String(pr.scheme ?? 'exact'),
      network: String(pr.network),
      asset: String(pr.asset),
      amount: String(pr.amount),
      payTo: String(pr.payee ?? pr.payTo),
      maxTimeoutSeconds: Number(pr.maxTimeoutSeconds ?? 3600),
    },
    payload: {
      signature,
      authorization: {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value.toString(),
        validAfter: authorization.validAfter.toString(),
        validBefore: authorization.validBefore.toString(),
        nonce: authorization.nonce,
      },
    },
  };
}
