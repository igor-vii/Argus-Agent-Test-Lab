#!/usr/bin/env python3
"""Мини-ТЗ №3 шаги 1-2: живые пробы QDay Aevum testnet (только чтение).
RPC: eth_chainId/clientVersion/blockNumber/gasPrice; tUSD8 ERC-20 reads;
facilitator GET /supported; faucet tUSD8 status (read-only POST).
Браннер-кошелёк генерится и сохраняется локально (testnet-only, не выводим ключ).
"""
import json, os, sys, time, urllib.request, urllib.error

RPC = "https://rpc-test.qday.info"
TUSD8 = "0x456569838f1d43009A91ebA4263147Afd7233483"
FACIL = "https://signet.qday.info/supported"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")   # testnet burner material lives here; git-ignored

def rpc(method, params=None, rpc_id=1):
    body = json.dumps({"jsonrpc": "2.0", "id": rpc_id, "method": method, "params": params or []}).encode()
    req = urllib.request.Request(RPC, data=body, headers={
        "Content-Type": "application/json", "User-Agent": "curl/8.5.0"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode())
    return data, round((time.time() - t0) * 1000)

def eth_call(to, data_hex):
    return rpc("eth_call", [{"to": to, "data": data_hex}, "latest"])

def decode_string(hexdata):
    # string returndata: 32B offset, 32B len, bytes
    b = bytes.fromhex(hexdata[2:])
    if len(b) < 64: return None
    n = int.from_bytes(b[32:64], "big")
    return b[64:64 + n].decode(errors="replace")

def main():
    os.makedirs(OUT, exist_ok=True)
    report = {}

    print("=== [1] RPC пробы ===")
    for m, p in [("eth_chainId", []), ("web3_clientVersion", []),
                 ("eth_blockNumber", []), ("eth_gasPrice", [])]:
        try:
            data, ms = rpc(m, p)
            report[m] = data.get("result")
            print(f"  {m} -> {data.get('result')} ({ms} ms)")
        except Exception as e:
            report[m] = f"ERROR: {e}"
            print(f"  {m} -> ERROR {e}")

    print("=== [2] браннер-кошелёк (testnet-only) ===")
    from eth_account import Account
    acct = Account.create()
    addr = acct.address
    os.makedirs(OUT, exist_ok=True)
    with open(f"{OUT}/wallet.json", "w") as f:
        json.dump({"address": addr, "private_key": acct.key.hex(),
                   "note": "QDay testnet burner, ONLY for probe №3; не для mainnet-средств"},
                  f, indent=1)
    os.chmod(f"{OUT}/wallet.json", 0o600)
    report["wallet"] = addr
    print(f"  адрес: {addr} (ключ сохранён в {OUT}/wallet.json, 0600, не выводится)")

    print("=== [3] tUSD8 on-chain reads ===")
    for label, sel in [("name", "0x06fdde03"), ("symbol", "0x95d89b41"), ("decimals", "0x313ce567")]:
        try:
            data, ms = eth_call(TUSD8, sel)
            res = data.get("result")
            if label == "decimals":
                val = int(res, 16) if res and res != "0x" else None
            else:
                val = decode_string(res) if res else None
            report[f"tusd8_{label}"] = val
            print(f"  {label}() -> {val} ({ms} ms)")
        except Exception as e:
            report[f"tusd8_{label}"] = f"ERROR: {e}"
            print(f"  {label}() -> ERROR {e}")
    # balanceOf(address)
    data_sel = "0x70a08231" + addr[2:].lower().rjust(64, "0")
    try:
        data, ms = eth_call(TUSD8, data_sel)
        bal = int(data.get("result"), 16) if data.get("result") not in (None, "0x") else 0
        report["tusd8_balance_wei_atomic"] = bal
        print(f"  balanceOf({addr[:10]}…) -> {bal} атомарных (6 dec) ({ms} ms)")
    except Exception as e:
        report["tusd8_balance_wei_atomic"] = f"ERROR: {e}"
        print(f"  balanceOf -> ERROR {e}")
    # authorizationState selector (EIP-3009, FiatTokenV2): проверка селектора через estimate? просто посчитаем селектор
    from eth_utils import keccak
    sel = keccak(b"authorizationState(bytes32,address,address,uint256,uint256,uint256)")[:4].hex()
    report["eip3009_authorizationState_selector"] = "0x" + sel
    print(f"  selector authorizationState(...) = 0x{sel} (для EIP-3009-верификации)")
    sel2 = keccak(b"transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,(uint8,bytes32,bytes32))")[:4].hex()
    report["eip3009_transferWithAuthorization_selector"] = "0x" + sel2
    print(f"  selector transferWithAuthorization[ FiatTokenV2 перегрузка ] = 0x{sel2}")

    print("=== [4] facilitator GET /supported ===")
    try:
        with urllib.request.urlopen(FACIL, timeout=30) as r:
            fac = json.loads(r.read().decode())
        report["facilitator_supported"] = fac
        print(" ", json.dumps(fac)[:600])
    except Exception as e:
        report["facilitator_supported"] = f"ERROR: {e}"
        print("  ERROR", e)

    print("=== [5] faucet tUSD8 status (read-only POST, claim НЕ отправляем) ===")
    for url, payload in [("https://faucet.qday.info/api/tusd8/status", {"expectedRecipient": addr})]:
        try:
            req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                         headers={"Content-Type": "application/json",
                                                  "User-Agent": "curl/8.5.0",
                                                  "Origin": "https://faucet.qday.info",
                                                  "Referer": "https://faucet.qday.info/en"})
            with urllib.request.urlopen(req, timeout=30) as r:
                st = json.loads(r.read().decode())
            report["faucet_status"] = st
            print(" ", json.dumps(st)[:600])
        except urllib.error.HTTPError as e:
            report["faucet_status"] = f"HTTP {e.code}: {e.read()[:300].decode(errors='replace')}"
            print("  HTTP", e.code, e.read()[:300])
        except Exception as e:
            report["faucet_status"] = f"ERROR: {e}"
            print("  ERROR", e)

    with open(f"{OUT}/probe_result.json", "w") as f:
        json.dump(report, f, indent=1)
    print(f"\nсохранено: {OUT}/probe_result.json; {time.strftime('%H:%M:%S')}")

if __name__ == "__main__":
    main()