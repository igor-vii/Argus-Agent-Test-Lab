/**
 * Integration test: Argus as SELLER (x402 resource server).
 *
 * Component under test: X402AgentServer (new, src/adapters/x402/X402AgentServer.ts).
 * It plays the seller half of x402 V2:
 *   - request without payment-signature  -> 402 + payment-required header/body
 *   - request with a valid signature     -> 200 + resource + payment-response
 *   - request with a malformed signature -> 402 (rejected), evidence recorded
 *
 * The "client" side is played by the same machinery Secretariat would use
 * (HttpSellerExecutionAdapter in zeus-secretariat sends POST with a
 * PAYMENT-SIGNATURE header). We emulate it locally with X402AgentAdapter +
 * BaseSepoliaPaymentAdapter so the loop is fully closed inside the test.
 *
 * If SECRETARIAT_URL is set and reachable, an additional check runs that
 * point-to-point verifies our advertised payment-required body parses through
 * Argus's own client stack (i.e. wire-format compatibility with x402 tooling).
 *
 * Reports are written to reports/argus-as-seller-<timestamp>.json.
 */
export {};
//# sourceMappingURL=ArgusAsSeller.test.d.ts.map