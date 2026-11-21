#!/usr/bin/env python3
"""Мини-ТЗ №3 шаг 3-4: голый x402 (v2, exact/EIP-3009) на семантике tUSD8.

Локальный сервер (stdlib http.server):
  GET /resource            -> 402 + PAYMENT-REQUIRED (base64 JSON accepts)
  GET /resource + PAYMENT-SIGNATURE (или X-PAYMENT) -> верификация EIP-712
     (домен tUSD8 v2, chainId 44005, verifyingContract tUSD8, Authorization typehash
      FiatTokenV2), проверка to==payTo, value==price, окно валидности, nonce
     -> 200 + PAYMENT-RESPONSE (settle помечен pending-funding)
Клиент: подписывает authorization локальным браннер-ключом (подпись не требует средств).
Плюс: негативный тест (поднятая сумма to/price) и ОДИН POST /verify к фасилитатору QDay
(никогда не /settle). Каждый шаг с таймингом; всё пишется в evidence JSON.
"""
import base64, json, os, secrets, sys, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from eth_account import Account
from eth_account.messages import encode_typed_data

RPC_CHAIN_ID = 44005
TUSD8 = "0x456569838f1d43009A91ebA4263147Afd7233483"
FACIL_VERIFY = "https://signet.qday.info/verify"
PRICE_ATOMIC = "10000"          # 0.01 tUSD8 (6 decimals)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")   # git-ignored: burner wallet.json (0600) never commits

with open(f"{OUT}/wallet.json") as f:
    W = json.load(f)
CLIENT_KEY, CLIENT_ADDR = W["private_key"], W["address"]

PORT = 8402
seen_nonces: set = set()
evidence: dict = {"steps": []}

def step(name, detail, t0=None):
    e = {"step": name, "detail": detail,
         "ts": time.strftime("%H:%M:%S")}
    if t0 is not None:
        e["ms"] = round((time.time() - t0) * 1000, 1)
    evidence["steps"].append(e)
    print(f"  [{e['ts']}{', ' + str(e['ms']) + ' ms' if t0 is not None else ''}] {name}: {detail}")

def b64(obj): return base64.b64encode(json.dumps(obj, separators=(",", ":")).encode()).decode()
def unb64(s): return json.loads(base64.b64decode(s).decode())

# EIP-712 для EIP-3009 FiatTokenV2-семантики tUSD8 (домен без salt, как у USDC)
_AUTH_TYPES = {
    "EIP712Domain": [
        {"name": "name", "type": "string"}, {"name": "version", "type": "string"},
        {"name": "chainId", "type": "uint256"}, {"name": "verifyingContract", "type": "address"}],
    "Authorization": [
        {"name": "from", "type": "address"}, {"name": "to", "type": "address"},
        {"name": "value", "type": "uint256"}, {"name": "validAfter", "type": "uint256"},
        {"name": "validBefore", "type": "uint256"}, {"name": "nonce", "type": "bytes32"}],
}

def tusd8_typed(auth: dict):
    return encode_typed_data(full_message={
        "types": _AUTH_TYPES,
        "primaryType": "Authorization",
        "domain": {"name": "tUSD8", "version": "2", "chainId": RPC_CHAIN_ID,
                   "verifyingContract": TUSD8},
        "message": {"from": auth["from"], "to": auth["to"], "value": int(auth["value"]),
                    "validAfter": int(auth["validAfter"]), "validBefore": int(auth["validBefore"]),
                    "nonce": bytes.fromhex(auth["nonce"][2:])},
    })

PAYTO = "0x7fA9C98a1b0C79Bdbd31c4998E9Fd0d5DCB1c9F4"  # условный получатель демо-ресурса (не кошелёк клиента)

ACCEPTS = [{
    "scheme": "exact", "network": "eip155:44005", "asset": TUSD8,
    "payTo": PAYTO, "amount": PRICE_ATOMIC, "maxTimeoutSeconds": 60,
    "extra": {"name": "tUSD8", "version": "2"},
}]

CHALLENGE = {
    "x402Version": 2,
    "error": "X-402: payment required for /resource",
    "resource": {"url": "http://127.0.0.1:8402/resource",
                 "description": "QDay x402 probe resource", "mimeType": "application/json"},
    "accepts": ACCEPTS,
}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_GET(self):
        if self.path != "/resource":
            self.send_error(404); return
        pay = self.headers.get("PAYMENT-SIGNATURE") or self.headers.get("X-PAYMENT")
        if not pay:
            self.send_response(402)
            self.send_header("PAYMENT-REQUIRED", b64(CHALLENGE))
            self.send_header("X-PAYMENT-REQUIRED", b64(CHALLENGE))  # v1-алиас
            self.send_header("Content-Type", "application/json")
            body = json.dumps(CHALLENGE).encode()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers(); self.wfile.write(body)
            return
        # --- верификация платежа (server-side) ---
        t0 = time.time()
        try:
            p = json.loads(base64.b64decode(pay).decode())
            pl = p["payload"]
            if "authorization" not in pl and isinstance(pl.get("payload"), dict):
                pl = pl["payload"]  # v2 wire: PaymentPayload.payload = scheme-specific record
            auth = pl["authorization"]; sig = pl["signature"]
            if isinstance(sig, dict):
                v = int(sig["v"]); r = int(sig["r"], 16); s = int(sig["s"], 16)
                sig_bytes = r.to_bytes(32, "big") + s.to_bytes(32, "big") + bytes([v if v in (27, 28) else v + 27])
            else:
                sig_bytes = bytes.fromhex(sig[2:] if sig.startswith("0x") else sig)
            typed = tusd8_typed(auth)
            rec = Account.recover_message(typed, signature=sig_bytes)
            recovered = rec if isinstance(rec, str) else rec.address
            now = int(time.time())
            checks = {
                "signer_matches_from": recovered.lower() == auth["from"].lower(),
                "to_is_payTo": auth["to"].lower() == PAYTO.lower(),
                "value_matches_price": str(auth["value"]) == ACCEPTS[0]["amount"],
                "window_valid": int(auth["validAfter"]) < now < int(auth["validBefore"]),
                "nonce_fresh": auth["nonce"] not in seen_nonces,
            }
            ok = all(checks.values())
            seen_nonces.add(auth["nonce"])
            step("server_verify", {"ok": ok, "checks": checks,
                                   "recovered": recovered, "declared_from": auth["from"]}, t0)
            if ok:
                resp = {"success": True, "error": None, "transaction": None,
                        "network": "eip155:44005",
                        "payer": recovered,
                        "settlement_note": "on-chain settle skipped in probe: burner unfunded "
                                           "(faucet gated by Turnstile/email), signature verified off-chain",
                        "payer": recovered}
                self.send_response(200)
                self.send_header("PAYMENT-RESPONSE", b64(resp))
                self.send_header("X-PAYMENT-RESPONSE", b64(resp))  # v1-алиас
                body = json.dumps({"resource": "QDay-probe-ok", "paid": PRICE_ATOMIC + " tUSD8 (authorized, not settled)"}).encode()
            else:
                self.send_response(402)
                body = json.dumps({"error": "verification failed", "checks": checks}).encode()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers(); self.wfile.write(body)
        except Exception as e:
            step("server_verify_error", repr(e), t0)
            self.send_response(400)
            body = json.dumps({"error": repr(e)}).encode()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers(); self.wfile.write(body)

def client_get(payload_b64=None, note=""):
    req = urllib.request.Request("http://127.0.0.1:8402/resource")
    if payload_b64:
        req.add_header("PAYMENT-SIGNATURE", payload_b64)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, dict(r.headers), r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode()

def build_payment(value_override=None, to_override=None):
    now = int(time.time())
    auth = {"from": CLIENT_ADDR, "to": to_override or PAYTO,
            "value": value_override or PRICE_ATOMIC,
            "validAfter": str(now - 60), "validBefore": str(now + 300),
            "nonce": "0x" + secrets.token_hex(32)}
    typed = tusd8_typed(auth)
    signed = Account.from_key(CLIENT_KEY).sign_message(typed)
    auth["to"] = to_override or auth["to"]
    sig = {"r": hex(signed.r), "s": hex(signed.s), "v": signed.v}
    payload = {"x402Version": 2, "scheme": "exact", "network": "eip155:44005",
               "resource": {"url": "http://127.0.0.1:8402/resource",
                            "description": "QDay x402 probe resource",
                            "mimeType": "application/json"},
               "accepted": ACCEPTS[0],
               "payload": {"authorization": auth, "signature": sig}}
    return payload

def main():
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    print("=== x402 v2 exact/EIP-3009 рукопожатие на tUSD8-семантике ===")
    st, hdrs, body = client_get()
    ch = hdrs.get("PAYMENT-REQUIRED")
    step("client_get_402", {"status": st, "header_present": bool(ch),
                            "accepts_network": unb64(ch)["accepts"][0]["network"] if ch else None})
    if st != 402:
        print("FAIL: ожидали 402"); sys.exit(1)

    t0 = time.time()
    payload = build_payment()
    pay_b64 = b64(payload)
    step("client_sign", {"value": payload["payload"]["authorization"]["value"],
                         "validBefore": payload["payload"]["authorization"]["validBefore"],
                         "nonce": payload["payload"]["authorization"]["nonce"][:12] + "…"}, t0)

    t0 = time.time()
    st, hdrs, body = client_get(pay_b64)
    pr = hdrs.get("PAYMENT-RESPONSE")
    step("client_pay_get_200", {"status": st, "payment_response": unb64(pr) if pr else None,
                                "body": body[:200]}, t0)

    # негативный тест: клиент подписывает ПОВЫШЕННУЮ сумму (overcharge-вектор из argus-finding-0000)
    t0 = time.time()
    payload_bad = build_payment(value_override="1000000")  # 1 tUSD8 вместо 0.01
    st2, hdrs2, body2 = client_get(b64(payload_bad))
    step("negative_overcharge", {"status": st2, "body": body2[:260]}, t0)

    # негативный тест: правильная сумма, но получатель НЕ payTo
    t0 = time.time()
    payload_bad2 = build_payment(to_override=CLIENT_ADDR)  # платим себе
    st3, hdrs3, body3 = client_get(b64(payload_bad2))
    step("negative_wrong_recipient", {"status": st3, "body": body3[:260]}, t0)

    print("=== POST /verify к фасилитатору QDay (stateless, /settle НЕ вызываем) ===")
    payload_real = build_payment()
    # Спек-контракт x402 facilitator: POST {x402Version, paymentPayload, paymentRequirements}
    spec_body = {"x402Version": 2,
                 "paymentPayload": payload_real,
                 "paymentRequirements": ACCEPTS[0]}
    t0 = time.time()
    try:
        req = urllib.request.Request(FACIL_VERIFY, data=json.dumps(spec_body).encode(),
                                     headers={"Content-Type": "application/json", "User-Agent": "curl/8.5.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            vf = {"http": r.status, "body": r.read().decode()[:800]}
    except urllib.error.HTTPError as e:
        vf = {"http": e.code, "body": e.read().decode(errors="replace")[:800]}
    except Exception as e:
        vf = {"http": None, "body": repr(e)}
    step("facilitator_verify", vf, t0)

    srv.shutdown()
    evidence["meta"] = {
        "chain_id": RPC_CHAIN_ID, "asset": TUSD8, "price_atomic": PRICE_ATOMIC,
        "payto": PAYTO, "client_addr": CLIENT_ADDR,
        "facilitator_verify": vf,
        "wallet_note": "burner testnet-only key NOT included in evidence",
    }
    with open(f"{OUT}/x402_handshake_evidence.json", "w") as f:
        json.dump(evidence, f, indent=1)
    print(f"\nevidence: {OUT}/x402_handshake_evidence.json; done {time.strftime('%H:%M:%S')}")

if __name__ == "__main__":
    main()