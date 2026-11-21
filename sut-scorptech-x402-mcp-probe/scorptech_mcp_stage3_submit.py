#!/usr/bin/env python3
"""ScorpTech x402 MCP probe, stage 3 (mini-TZ №6): sign the x402 v2 exact
EIP-3009 authorization for the Base accept (USDC v2 domain, $0.001) with the
sandbox burner and submit via params._meta["x402/payment"]. The burner is
UNFUNDED, so the facilitator must reject — full transport exercise with zero
spend. Balance re-checked after. Frames -> work/scorptech/."""
import json, os, sys, time, urllib.request, urllib.error

LITE = "https://scorptech.it.com/api/x402/mcp/lite"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")   # run frames; git-ignored
HDRS = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream",
        "User-Agent": "curl/8.5.0", "MCP-Protocol-Version": "2025-06-18"}

wallet = json.load(open(os.environ["ARGUS_BURNER_WALLET"]))  # burner EOA json {address, private_key}; NEVER commit
from_addr = wallet["address"]
challenge = json.load(open(os.path.join(OUT, "12_payment_required_1_ping.json")))["json"]["result"]["content"][0]["text"]
ch = json.loads(challenge)
accept = next(a for a in ch["accepts"] if a["network"] == "eip155:8453")

from eth_account import Account
from eth_account.messages import encode_typed_data

now = int(time.time())
auth = {"from": from_addr, "to": accept["payTo"], "value": accept["amount"],
        "validAfter": str(now - 60), "validBefore": str(now + accept["maxTimeoutSeconds"]),
        "nonce": "0x" + os.urandom(16).hex() + os.urandom(16).hex()}
domain = {"name": accept["extra"]["name"], "version": accept["extra"]["version"],
          "chainId": 8453, "verifyingContract": accept["asset"]}
types = {"EIP712Domain": [{"name": "name", "type": "string"}, {"name": "version", "type": "string"},
                          {"name": "chainId", "type": "uint256"}, {"name": "verifyingContract", "type": "address"}],
         "TransferWithAuthorization": [{"name": "from", "type": "address"}, {"name": "to", "type": "address"},
                                       {"name": "value", "type": "uint256"}, {"name": "validAfter", "type": "uint256"},
                                       {"name": "validBefore", "type": "uint256"}, {"name": "nonce", "type": "bytes32"}]}
msg = {"from": auth["from"], "to": auth["to"], "value": int(auth["value"]),
       "validAfter": int(auth["validAfter"]), "validBefore": int(auth["validBefore"]), "nonce": auth["nonce"]}
td = encode_typed_data(full_message={
    "types": types, "primaryType": "TransferWithAuthorization",
    "domain": domain, "message": msg})
key = Account.from_key(wallet["private_key"])
sig = key.sign_message(td).signature.to_0x_hex()
print("signature (truncated):", sig[:20] + "..." + sig[-10:])

payment = {"x402Version": 2, "resource": ch["resource"], "accepted": accept,
           "payload": {"authorization": auth, "signature": sig}}
print("payment payload keys:", list(payment.keys()), "| accepted.network:", accept["network"])

frame = {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
         "params": {"name": "call_tool", "arguments": {"name": "ping", "arguments": {"echo": "argus-a10-probe"}},
                    "_meta": {"x402/payment": payment}}}

req = urllib.request.Request(LITE, json.dumps(frame).encode(), HDRS)
t0 = time.perf_counter()
try:
    r = urllib.request.urlopen(req, timeout=45)
    code, rh, body = r.status, r.headers, r.read().decode()
except urllib.error.HTTPError as e:
    code, rh, body = e.code, e.headers, e.read().decode()
dt = time.perf_counter() - t0
KEEP = ("content-type", "mcp-session-id", "payment-required", "x-payment-response", "x-request-id", "x402-version")
out = {"url": LITE, "request": {"method": "tools/call",
        "params": {"name": "call_tool", "arguments": {"name": "ping", "arguments": {"echo": "argus-a10-probe"}},
                   "_meta": {"x402/payment": {**payment, "payload": {"authorization": auth, "signature": sig[:24] + "...REDACTED_FULL_SIG_IN_EVIDENCE"}}}},
        "note": "payment payload logged without full signature; authorization fields intact"},
       "http_status": code, "headers": {k: rh.get(k) for k in rh if k.lower() in KEEP},
       "elapsed_s": round(dt, 6), "body_bytes": len(body), "response": body[:4000]}
try:
    out["json"] = json.loads(body)
except Exception:
    js = None
    for line in body.splitlines():
        if line.startswith("data:"):
            try: js = json.loads(line[5:].strip())
            except Exception: pass
    out["json"] = js
p = os.path.join(OUT, "20_signed_submit_unfunded.json")
json.dump(out, open(p, "w"), indent=2, ensure_ascii=False)
print(f"-> {p} ({os.path.getsize(p)} B) | HTTP {code} | {dt:.3f}s")
j = out.get("json") or {}
res = j.get("result") or {}
if res:
    txt = "".join(c.get("text", "") for c in res.get("content", []))
    print("isError:", res.get("isError"), "| text:", txt[:300])
    print("result._meta:", json.dumps(res.get("_meta", {}), ensure_ascii=False)[:200])
if j.get("error"):
    print("rpc error:", json.dumps(j["error"])[:200])

# баланс до/после (должен остаться 0/0)
import subprocess
bal = subprocess.run([sys.executable, "-c", f'''
import json, urllib.request
addr = "{from_addr}".lower()
def rpc(m, p):
    b = json.dumps({{"jsonrpc": "2.0", "id": 1, "method": m, "params": p}}).encode()
    rq = urllib.request.Request("https://mainnet.base.org", b, {{"Content-Type": "application/json", "User-Agent": "curl/8.5.0"}})
    return json.load(urllib.request.urlopen(rq, timeout=20))["result"]
native = int(rpc("eth_getBalance", ["0x" + addr, "latest"]), 16)
usdc = int(rpc("eth_call", [{{"to": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "data": "0x70a08231" + addr.rjust(64, "0")}}, "latest"]), 16)
print(f"native_eth={{native/1e18:.6f}} usdc={{usdc/1e6:.6f}}")'''], capture_output=True, text=True)
print("balance after submit:", bal.stdout.strip() or bal.stderr[-200:])