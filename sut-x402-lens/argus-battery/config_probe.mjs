/**
 * Config-refusal probe for the x402-lens battery (Argus Agent Test Lab).
 *
 * Runs ONE configuration scenario per invocation against the REAL shipped
 * `paymentLens` and reports whether construction is refused. The refusal
 * surface itself is documented behavior (doc-registry D-02/D-03/D-04/D-16/
 * D-17/D-18) — the probe verifies the documented contract, so a missing
 * refusal where one is documented is the anomaly.
 *
 * Env: PROBE_SCENARIO — one of:
 *   missing_config      no facilitator/network/payTo          -> expect ConfigError (D-02)
 *   v1_shorthand        network "base-sepolia"                -> expect ConfigError naming CAIP-2 (D-03)
 *   upto_flow           upto route with paymentFlow           -> expect ConfigError naming route (D-04)
 *   exact_flow          exact route with uptoFlow             -> expect ConfigError naming route (D-04)
 *   mixed_payto_string  evm+solana networks, single payTo     -> expect ConfigError (D-16)
 *   flat_headers        flat facilitatorHeaders object        -> expect throw (D-17)
 *   unknown_namespace   networks ["cosmos:cosmoshub-4"]       -> expect throw naming namespace (D-18)
 *   multi_network_ok    evm+solana with per-network payTo map -> expect NO throw (control)
 * Output: one JSON line {scenario, threw, name, field, message}.
 */
import { paymentLens } from "@x402-lens/express";

const SCENARIO = process.env.PROBE_SCENARIO || "missing_config";

const EVM_NET = "eip155:84532";
const SOL_NET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
const EVM_ADDR = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
const SOL_ADDR = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

const scenarios = {
  missing_config: () => paymentLens({ routes: { "GET /weather": "$0.001" }, sinks: { console: false } }),
  v1_shorthand: () => paymentLens({
    facilitatorUrl: "http://127.0.0.1:1/facilitator",
    network: "base-sepolia",
    payTo: EVM_ADDR,
    routes: { "GET /weather": "$0.001" },
    sinks: { console: false },
  }),
  upto_flow: () => paymentLens({
    facilitatorUrl: "http://127.0.0.1:1/facilitator",
    network: EVM_NET,
    payTo: EVM_ADDR,
    routes: [{ route: "GET /generate", price: "$0.05", scheme: "upto", paymentFlow: "upfront" }],
    sinks: { console: false },
  }),
  exact_flow: () => paymentLens({
    facilitatorUrl: "http://127.0.0.1:1/facilitator",
    network: EVM_NET,
    payTo: EVM_ADDR,
    routes: [{ route: "GET /weather", price: "$0.001", uptoFlow: "escrow" }],
    sinks: { console: false },
  }),
  mixed_payto_string: () => paymentLens({
    facilitatorUrl: "http://127.0.0.1:1/facilitator",
    networks: [EVM_NET, SOL_NET],
    payTo: EVM_ADDR,
    routes: { "GET /weather": "$0.001" },
    sinks: { console: false },
  }),
  flat_headers: () => paymentLens({
    facilitatorUrl: "http://127.0.0.1:1/facilitator",
    network: EVM_NET,
    payTo: EVM_ADDR,
    facilitatorHeaders: { authorization: "Bearer flat" },
    routes: { "GET /weather": "$0.001" },
    sinks: { console: false },
  }),
  unknown_namespace: () => paymentLens({
    facilitatorUrl: "http://127.0.0.1:1/facilitator",
    network: "cosmos:cosmoshub-4",
    payTo: EVM_ADDR,
    routes: { "GET /weather": "$0.001" },
    sinks: { console: false },
  }),
  multi_network_ok: () => paymentLens({
    facilitatorUrl: "http://127.0.0.1:1/facilitator",
    networks: [EVM_NET, SOL_NET],
    payTo: { [EVM_NET]: EVM_ADDR, [SOL_NET]: SOL_ADDR },
    routes: { "GET /weather": "$0.001" },
    sinks: { console: false },
  }),
};

const run = scenarios[SCENARIO];
if (!run) {
  process.stdout.write(`${JSON.stringify({ scenario: SCENARIO, threw: true, name: "ProbeError", field: "", message: "unknown scenario" })}\n`);
  process.exit(0);
}

try {
  const lens = run();
  await lens.close().catch(() => {});
  process.stdout.write(`${JSON.stringify({ scenario: SCENARIO, threw: false, name: "", field: "", message: "" })}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    scenario: SCENARIO,
    threw: true,
    name: error?.name ?? "Error",
    field: error?.field ?? "",
    message: String(error?.message ?? error),
  })}\n`);
}
process.exit(0);
