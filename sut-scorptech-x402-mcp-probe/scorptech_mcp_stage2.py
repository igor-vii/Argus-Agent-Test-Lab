#!/usr/bin/env python3
"""ScorpTech x402 MCP probe, stage 2 (mini-TZ №6): free search_tools calls,
PaymentRequired challenge capture on three $0.001 tools (ping / url_parse /
cusip_validate), and the money-free negatives (invalid args + unknown tool).
All frames -> work/scorptech/*.json."""
import json, os, time, urllib.request, urllib.error

BASE = "https://scorptech.it.com"
LITE = BASE + "/api/x402/mcp/lite"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")   # run frames; git-ignored
HDRS = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream",
        "User-Agent": "curl/8.5.0", "MCP-Protocol-Version": "2025-06-18"}
KEEP = ("content-type", "mcp-session-id", "payment-required", "x-price", "x-request-id",
        "x402-version", "www-authenticate", "payment-signature", "x-payment-response")

catalog = {t["name"]: t for t in json.load(
    open(os.path.join(OUT, "04_tools_list_full_p1.json")))["json"]["result"]["tools"]}

def post(payload, _t0=None):
    req = urllib.request.Request(LITE, json.dumps(payload).encode(), HDRS)
    t0 = time.perf_counter()
    try:
        r = urllib.request.urlopen(req, timeout=30)
        code, rh, body = r.status, r.headers, r.read().decode()
    except urllib.error.HTTPError as e:
        code, rh, body = e.code, e.headers, e.read().decode()
    dt = time.perf_counter() - t0
    ct = rh.get("Content-Type", "")
    js = None
    for line in body.splitlines():          # handle both JSON and SSE frames
        if line.startswith("data:"):
            try: js = json.loads(line[5:].strip())
            except Exception: pass
    if js is None:
        try: js = json.loads(body)
        except Exception: pass
    return {"request": payload, "http_status": code,
            "headers": {k: rh.get(k) for k in rh if k.lower() in KEEP},
            "elapsed_s": round(dt, 6), "body_bytes": len(body), "json": js,
            "body_head": None if js else body[:600]}

def save(name, obj):
    p = os.path.join(OUT, name)
    json.dump(obj, open(p, "w"), indent=2, ensure_ascii=False)
    print(f"  -> {name} ({os.path.getsize(p)} B)")

def call_tool(name, arguments):
    return post({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                 "params": {"name": "call_tool", "arguments": {"name": name, "arguments": arguments}}})

def summarize_result(fr):
    j = fr.get("json") or {}
    res = j.get("result")
    if res and not res.get("isError"):
        txt = "".join(c.get("text", "") for c in res.get("content", []))
        return "RESULT: " + txt[:220]
    if res and res.get("isError"):
        txt = "".join(c.get("text", "") for c in res.get("content", []))
        return "MCP isError: " + txt[:220]
    if j.get("error"):
        return f"RPC error {j['error'].get('code')}: {str(j['error'].get('message'))[:160]}"
    return f"HTTP {fr['http_status']} " + str(fr.get("headers", {}))[:200]

print("[1] free search_tools")
for i, (q, g) in enumerate([("ping", None), ("url parse", "dev"),
                            ("cusip", None), ("solana token", "crypto")], 1):
    params = {"query": q}
    if g: params["group"] = g
    fr = post({"jsonrpc": "2.0", "id": i, "method": "tools/call",
               "params": {"name": "search_tools", "arguments": params}})
    save(f"10_search_{i}_{q.replace(' ', '_')}.json", fr)
    res = (fr.get("json") or {}).get("result", {})
    txt = "".join(c.get("text", "") for c in res.get("content", []))
    print(f"  {q!r}({g}): {summarize_result(fr)[:160]}")

CHOSEN = ["ping", "url_parse", "cusip_validate"]
print("[2] chosen tool schemas (from catalog dump)")
sch = {n: catalog[n].get("inputSchema") for n in CHOSEN}
save("11_chosen_tool_schemas.json", {n: {"title": catalog[n].get("title"),
     "price_line": catalog[n]["description"].split("Price:")[1][:120] if "Price:" in catalog[n]["description"] else None,
     "description_head": catalog[n]["description"][:300], "inputSchema": s} for n, s in sch.items()})
for n in CHOSEN:
    req = sch[n].get("required") if isinstance(sch[n], dict) else None
    props = list((sch[n] or {}).get("properties", {}).keys()) if isinstance(sch[n], dict) else None
    print(f"  {n}: required={req} props={props}")

print("[3] PaymentRequired capture (no payment sent)")
for i, n in enumerate(CHOSEN, 1):
    # валидные аргументы возьмём по схеме; ping скорее всего без аргументов
    args = {}
    if n == "url_parse": args = {"url": "https://argus-lab.tech/"}
    if n == "cusip_validate": args = {"cusip": "037833100"}   # AAPL CUSIP
    fr = call_tool(n, args)
    save(f"12_payment_required_{i}_{n}.json", fr)
    print(f"  {n}: {summarize_result(fr)[:200]}")

print("[4] negatives (no money path)")
fr_bad_args = call_tool("url_parse", {"url": 12345})          # wrong type
save("13_negative_invalid_args.json", fr_bad_args)
print("  invalid args: ", summarize_result(fr_bad_args)[:180])
fr_bad_cusip = call_tool("cusip_validate", {"cusip": "!!!not-a-cusip!!!"})
save("14_negative_invalid_cusip.json", fr_bad_cusip)
print("  invalid cusip:", summarize_result(fr_bad_cusip)[:180])
fr_no_tool = call_tool("no_such_tool_argus_probe_xyz", {})
save("15_negative_unknown_tool.json", fr_no_tool)
print("  unknown tool: ", summarize_result(fr_no_tool)[:180])
print("done stage 2")