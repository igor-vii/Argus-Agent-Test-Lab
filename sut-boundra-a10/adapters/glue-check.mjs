// glue-check.mjs — adapter-level validation of the transport glue ONLY
// (no stand, no race, no battery session): pinned TS SDK -> transport-only
// adapter -> pinned Gateway+SpendLedger decision path.
// Validates: SDK import from the pinned checkout; ALLOW -> duplicate DENY ->
// conflict DENY -> independence of a different purchase_id.
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUT_ROOT = path.resolve(__dirname, "..");
const BOUNDRA_REPO = path.resolve(process.env.BOUNDRA_REPO || path.join(SUT_ROOT, "../../boundra"));
const PORT = 4610;
const BASE = `http://127.0.0.1:${PORT}`;
const OWNER = "owner-glue-check";

const stateDir = mkdtempSync(path.join(tmpdir(), "boundra-glue-"));
const adapter = spawn("python3", [path.join(SUT_ROOT, "adapters/boundra_adapter_server.py")], {
  env: { ...process.env, BOUNDRA_REPO, BOUNDRA_STATE_DIR: stateDir, BOUNDRA_ADAPTER_PORT: String(PORT) },
  stdio: ["ignore", "inherit", "inherit"],
});

const wait = async () => {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return await res.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("adapter not healthy");
};

const intent = (amount) => ({
  amount, recipient: "0x9999999999999999999999999999999999999999",
  purpose: "weather API call (boundra-a10 battery)",
  resource: "http://127.0.0.1:4480/weather", method: "GET",
  network: "eip155:84532", asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  source_content: "weather",
});

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
};

try {
  const health = await wait();
  check("adapter healthy", health.ok === true, JSON.stringify(health.policy_summary));

  const sdk = (await import(pathToFileURL(path.join(BOUNDRA_REPO, "sdk/typescript/src/index.ts")).href));
  const { BoundraClient } = sdk;
  const client = new BoundraClient({ baseUrl: BASE, owner: OWNER });

  const v1 = await client.evaluate(intent(0.01), { purchaseId: "purchase-glue-1" });
  check("first reservation ALLOW", v1.decision === "ALLOW", `layer=${v1.layer} status=${v1.reservation_status}`);

  const v2 = await client.evaluate(intent(0.01), { purchaseId: "purchase-glue-1" });
  check("same ID + same intent DENY duplicate", v2.decision === "DENY" && v2.duplicate === true && v2.purchase_id_conflict === false,
    `layer=${v2.layer} reasons=${JSON.stringify(v2.reasons)}`);

  const v3 = await client.evaluate(intent(0.10), { purchaseId: "purchase-glue-1" });
  check("same ID + changed intent explicit conflict", v3.decision === "DENY" && v3.purchase_id_conflict === true,
    `layer=${v3.layer} reasons=${JSON.stringify(v3.reasons)}`);

  const v4 = await client.evaluate(intent(0.01), { purchaseId: "purchase-glue-2" });
  check("different purchase_id independent ALLOW", v4.decision === "ALLOW", `layer=${v4.layer}`);

  const v5 = await client.evaluate(intent(0.01), { purchaseId: "purchase-glue-1", });
  const v6 = await new BoundraClient({ baseUrl: BASE, owner: "owner-glue-other" }).evaluate(intent(0.01), { purchaseId: "purchase-glue-1" });
  check("owner scope: second owner same purchase_id independent", v5.decision === "DENY" && v6.decision === "ALLOW",
    `v5=${v5.decision} v6=${v6.decision}`);
} catch (e) {
  check("glue execution", false, String(e));
} finally {
  try { adapter.kill("SIGKILL"); } catch {}
  try { rmSync(stateDir, { recursive: true, force: true }); } catch {}
}
process.exit(failures ? 1 : 0);
