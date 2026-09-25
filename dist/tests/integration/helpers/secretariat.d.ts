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
export declare const SECRETARIAT_URL: string;
export declare function secretariatAvailable(): boolean;
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
export declare function postJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<HttpResult<T>>;
export declare function getJson<T = Record<string, unknown>>(url: string): Promise<HttpResult<T>>;
/**
 * Create a Stage-A request on Secretariat (Secretariat then performs x402
 * discovery against `target`, validates policy and persists a DPI).
 */
export declare function createStageARequest(input: SecretariatStageARequestInput): Promise<HttpResult>;
export declare function getRequestStatus(requestId: string): Promise<HttpResult>;
export declare function submitPayment(requestId: string, payload: Record<string, unknown>): Promise<HttpResult>;
/**
 * paymentRequired (as returned by POST /v1/requests) -> Argus PaymentRequired.
 *
 * NOTE: Secretariat's canonical V2 requirement uses `amount` + `payee`;
 * Argus' X402 parser maps the seller-header form (`maxAmountRequired`/`payTo`).
 * We feed signX402Payment() the canonical Secretariat values so the signature
 * binds to what Eip3009PaymentVerifier checks.
 */
export declare function argusPaymentRequiredFromSecretariat(pr: Record<string, unknown>): PaymentRequired;
/**
 * Convert the Base64 envelope produced by PaymentAdapter.signX402Payment()
 * into the CANONICAL x402 V2 JSON object that Secretariat's
 * Eip3009PaymentVerifier requires (it needs an `accepted` binding section).
 *
 * The signature itself is NOT touched — we only attach the accepted terms.
 */
export declare function toCanonicalV2Payload(signedBase64: string, secretariatPaymentRequired: Record<string, unknown>): Record<string, unknown>;
/** Sign via Argus PaymentAdapter and adapt to Secretariat's wire format. */
export declare function signAndAdapt(adapter: PaymentAdapter, secretariatPaymentRequired: Record<string, unknown>): Promise<Record<string, unknown>>;
export interface DomainOverride {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: string;
}
export declare function signExactDpiAuthorization(opts: {
    privateKey: `0x${string}`;
    /** paymentRequired object returned by POST /v1/requests (contains DPI bindings). */
    paymentRequired: Record<string, unknown>;
    /**
     * EIP-712 domain override. Secretariat resolves it from env
     * ZEUS_EIP3009_DOMAIN_NAME/VERSION + network->chainId + asset address.
     * Keep in sync with the running Secretariat config.
     */
    domain: DomainOverride;
}): Promise<Record<string, unknown>>;
//# sourceMappingURL=secretariat.d.ts.map