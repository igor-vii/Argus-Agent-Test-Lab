/**
 * Integration test: Argus as BUYER against Secretariat.
 *
 * Flow under test (S8 x402 cycle):
 *   X402AgentAdapter -> POST Secretariat endpoint -> HTTP 402 + payment-required
 *   -> BaseSepoliaPaymentAdapter.signX402Payment (EIP-3009 / EIP-712)
 *   -> retry with payment-signature header -> HTTP 200.
 *
 * ENV-driven (no hardcoded URLs/keys):
 * - SECRETARIAT_URL              base URL of a running Secretariat/api-server.
 *                                Unset/unreachable => real-network part is SKIPPED,
 *                                local loopback verification runs instead.
 * - SECRETARIAT_X402_PATH        payment-guarded path (default /api/insurance/quote).
 * - ARGUS_TEST_WALLET_PRIVATE_KEY  test wallet key (falls back to the well-known
 *                                  Hardhat account #0 used across this repo's tests).
 * - BASE_SEPOLIA_RPC_URL         RPC for the payment adapter.
 *
 * Reports are written to reports/argus-as-buyer-<timestamp>.json.
 */
export {};
//# sourceMappingURL=ArgusAsBuyer.test.d.ts.map