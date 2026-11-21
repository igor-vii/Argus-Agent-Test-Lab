#!/usr/bin/env python3
"""apiguru amazon-scraper-v2: ОДИН платный x402-вызов (мини-ТЗ №4, шаг 2).

Запуск (когда есть funded-кошелёк с нативным USDC на Base; газ НЕ нужен —
facilitator сам сабмитит transfer):
  APIGURU_PRIVKEY=0x... python3 scripts/apiguru_paid_call.py --asin B09DJLW458

Защита от повторного платного вызова: lock-файл рядом с evidence — второй запуск
на том же ASIN/день требует --force. Сумма берётся ИЗ 402-челленджа, но сверяется
со spend-limit (--max-usdc, по умолчанию $0.05 = документированный потолок).
"""
import argparse, base64, json, os, secrets, sys, time, urllib.request, urllib.error

BASE = "https://agent.apiguru.app/agent/v1"

def fetch(path, headers=None, timeout=90):
    req = urllib.request.Request(BASE + path, headers=headers or {})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read(), round((time.time() - t0) * 1000)
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read(), round((time.time() - t0) * 1000)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--asin", default="B09DJLW458")
    ap.add_argument("--geo", default="US")
    ap.add_argument("--max-usdc", type=float, default=0.05)
    ap.add_argument("--force", action="store_true",
                    help="разрешить повторный платный вызов (по умолчанию lock не пускает)")
    a = ap.parse_args()
    priv = os.environ.get("APIGURU_PRIVKEY")
    if not priv:
        sys.exit("нужен APIGURU_PRIVKEY=0x... (кошелёк с нативным USDC на Base; газ не требуется)")
    lock = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "paid_call.lock")
    ev_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "paid_call_evidence.json")
    if os.path.exists(lock) and not a.force:
        sys.exit(f"платный вызов уже был ({lock}); см. {ev_path}; для повтора --force")

    from eth_account import Account
    from eth_account.messages import encode_typed_data

    # 1) первый GET: ожидаем 402 + PAYMENT-REQUIRED
    st, hdrs, body, ms = fetch(f"/v2/product-details?asin={a.asin}&geo={a.geo}")
    ev = {"step1": {"status": st, "ms": ms, "headers": hdrs}}
    print(f"[1] GET -> {st} ({ms} ms)")
    if st == 200:
        ev["step1"]["body"] = json.loads(body.decode())["data"] if body[:1] == b"{" else None
        json.dump(ev, open(ev_path, "w"), indent=1)
        print("    200 без 402 (free/sample?) — платный путь не задействован, evidence сохранена")
        return
    if st != 402:
        sys.exit(f"неожиданный статус {st}: {body[:300]}")
    ch = json.loads(base64.b64decode(hdrs.get("PAYMENT-REQUIRED", hdrs.get("X-PAYMENT-REQUIRED", ""))))
    accepts = ch.get("accepts", [])
    print(f"[2] 402 challenge: x402Version={ch.get('x402Version')} accepts={json.dumps(accepts)[:400]}")
    req0 = next((x for x in accepts if x.get("scheme") == "exact"), accepts[0] if accepts else None)
    if not req0:
        sys.exit("в accepts нет scheme exact")
    amount = int(req0["amount"])
    if amount > int(a.max_usdc * 1e6):
        sys.exit(f"amount {amount} atomic превышает spend-limit {a.max_usdc} USDC — СТОП")
    print(f"[3] принят accept: network={req0['network']} asset={req0['asset']} amount={amount} ({amount/1e6} USDC) payTo={req0['payTo']}")

    # 2) подпись EIP-3009 и повторный GET с PAYMENT-SIGNATURE
    acct = Account.from_key(priv)
    domain = {"name": (req0.get("extra") or {}).get("name", "USD Coin"),
              "version": (req0.get("extra") or {}).get("version", "2"),
              "chainId": int(req0["network"].split(":")[1]),
              "verifyingContract": req0["asset"]}
    now = int(time.time())
    auth = {"from": acct.address, "to": req0["payTo"], "value": str(amount),
            "validAfter": str(now - 60), "validBefore": str(now + 600),
            "nonce": "0x" + secrets.token_hex(32)}
    types = {
        "EIP712Domain": [{"name": "name", "type": "string"}, {"name": "version", "type": "string"},
                          {"name": "chainId", "type": "uint256"}, {"name": "verifyingContract", "type": "address"}],
        "Authorization": [{"name": "from", "type": "address"}, {"name": "to", "type": "address"},
                           {"name": "value", "type": "uint256"}, {"name": "validAfter", "type": "uint256"},
                           {"name": "validBefore", "type": "uint256"}, {"name": "nonce", "type": "bytes32"}],
    }
    signed = acct.sign_message(encode_typed_data(full_message={
        "types": types, "primaryType": "Authorization", "domain": domain,
        "message": {"from": auth["from"], "to": auth["to"], "value": int(auth["value"]),
                    "validAfter": int(auth["validAfter"]), "validBefore": int(auth["validBefore"]),
                    "nonce": bytes.fromhex(auth["nonce"][2:])}}))
    payload = {"x402Version": ch.get("x402Version", 2), "scheme": "exact",
               "network": req0["network"], "accepted": req0,
               "resource": ch.get("resource"),
               "payload": {"authorization": auth,
                           "signature": {"r": hex(signed.r), "s": hex(signed.s), "v": signed.v}}}
    hdr = {"PAYMENT-SIGNATURE": base64.b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode()}
    st2, hdrs2, body2, ms2 = fetch(f"/v2/product-details?asin={a.asin}&geo={a.geo}", headers=hdr)
    pr = hdrs2.get("PAYMENT-RESPONSE") or hdrs2.get("X-PAYMENT-RESPONSE")
    print(f"[4] платный GET -> {st2} ({ms2} ms)")
    if pr:
        prd = json.loads(base64.b64decode(pr))
        print(f"[5] PAYMENT-RESPONSE: {json.dumps(prd)[:400]}")
        ev["settle_ms_after_sign"] = ms2
    ev.update({"step4": {"status": st2, "ms": ms2, "headers": hdrs2,
                          "body_first_2000": body2.decode(errors="replace")[:2000]},
               "challenge": ch, "authorization": {**auth, "signature": "NOT-LOGGED"},
               "note": "подпись в evidence не пишем; txn hash только в PAYMENT-RESPONSE"})
    json.dump(ev, open(ev_path, "w"), indent=1)
    open(lock, "w").write(f"{time.strftime('%Y-%m-%dT%H:%M:%SZ')} asin={a.asin} status={st2}\n")
    print(f"evidence: {ev_path}; lock: {lock}")

if __name__ == "__main__":
    main()