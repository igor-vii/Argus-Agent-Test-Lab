#!/usr/bin/env python3
"""ScorpTech x402 MCP probe, stage 1 (mini-TZ №6): initialize -> tools/list on
the lite endpoint + catalog count on the full endpoint + health/docs snapshots.
Every HTTP frame goes to work/scorptech/ as JSON evidence."""
import json, os, time, urllib.request, urllib.error

BASE = "https://scorptech.it.com"
LITE = BASE + "/api/x402/mcp/lite"
FULL = BASE + "/api/x402/mcp"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")   # run frames; git-ignored
os.makedirs(OUT, exist_ok=True)
HDRS = {"Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "User-Agent": "curl/8.5.0", "MCP-Protocol-Version": "2025-06-18"}
KEEP = ("content-type", "mcp-session-id", "payment-required", "x-price",
        "x-price-next-call", "x-free-probes-remaining", "www-authenticate",
        "x-request-id", "x402-version", "protocol")

def post(url, payload, session=None):
    h = dict(HDRS)
    if session: h["Mcp-Session-Id"] = session
    req = urllib.request.Request(url, json.dumps(payload).encode(), h)
    t0 = time.perf_counter()
    try:
        r = urllib.request.urlopen(req, timeout=30)
        code, rh, body = r.status, r.headers, r.read().decode()
    except urllib.error.HTTPError as e:
        code, rh, body = e.code, e.headers, e.read().decode()
    dt = time.perf_counter() - t0
    ct = rh.get("Content-Type", "")
    js = None
    if "text/event-stream" in ct:
        for line in body.splitlines():
            if line.startswith("data:"):
                try: js = json.loads(line[5:].strip())
                except Exception: pass
    else:
        try: js = json.loads(body)
        except Exception: pass
    frame = {"url": url, "request": payload, "http_status": code,
             "headers": {k: rh.get(k) for k in rh if k.lower() in KEEP},
             "content_type": ct, "elapsed_s": round(dt, 6),
             "body_bytes": len(body), "json": js}
    if js is None: frame["body_head"] = body[:600]
    return frame

def save(name, obj):
    p = os.path.join(OUT, name)
    json.dump(obj, open(p, "w"), indent=2, ensure_ascii=False)
    print(f"  -> {name} ({os.path.getsize(p)} B)")

def rpc(method, params=None, _id=1):
    p = {"jsonrpc": "2.0", "id": _id, "method": method}
    if params is not None: p["params"] = params
    return p

print("[1] initialize (lite)")
init = post(LITE, rpc("initialize", {"protocolVersion": "2025-06-18",
    "capabilities": {}, "clientInfo": {"name": "argus-lab-probe", "version": "1.0.0"}}))
save("01_initialize.json", init)
sid = init["headers"].get("mcp-session-id")
print("  session:", sid, "| server:", json.dumps((init.get("json") or {}).get("result", {}).get("serverInfo"), ensure_ascii=False))
proto = (init.get("json") or {}).get("result", {}).get("protocolVersion")
save("02_initialized_notification.json", post(LITE, rpc("notifications/initialized"), sid) if False else {"note": "notification, no response body expected", "session": sid})

print("[2] tools/list (lite)")
tl = post(LITE, rpc("tools/list", {}), sid)
save("03_tools_list_lite.json", tl)
tools = (tl.get("json") or {}).get("result", {}).get("tools", [])
for t in tools:
    print(f"  - {t['name']}: {t.get('description','')[:100]}...")

print("[3] tools/list (full endpoint, page 1)")
tlf = post(FULL, rpc("tools/list", {}), None)
save("04_tools_list_full_p1.json", tlf)
ftools = (tlf.get("json") or {}).get("result", {}).get("tools", [])
names = [t["name"] for t in ftools]
print(f"  page1 tools: {len(ftools)}; first/last: {names[:3]} ... {names[-3:]}")
cursor = (tlf.get("json") or {}).get("result", {}).get("nextCursor")

pages, cnt = 1, len(ftools)
while cursor and pages < 60:
    pg = post(FULL, rpc("tools/list", {"cursor": cursor}), None)
    cur_tools = (pg.get("json") or {}).get("result", {}).get("tools", [])
    cnt += len(cur_tools); pages += 1
    cursor = (pg.get("json") or {}).get("result", {}).get("nextCursor")
    if pages % 10 == 0: print(f"  ... {cnt} tools after {pages} pages")
save("05_tools_list_full_stats.json", {"pages_fetched": pages, "tools_counted": cnt,
     "cursor_left": bool(cursor), "names": names,
     "page1_meta": [ {k: t.get(k) for k in ("name","description","_meta")} for t in ftools[:5] ]})
print(f"  TOTAL tools: {cnt} (pages {pages}, cursor_left={bool(cursor)})")

print("[4] health + docs-all snapshot")
for name, url in (("06_health.json", BASE + "/api/x402/health"),
                  ("07_docs_all.json", BASE + "/api/x402/docs/all")):
    req = urllib.request.Request(url, headers={"User-Agent": "curl/8.5.0"})
    t0 = time.perf_counter()
    try:
        r = urllib.request.urlopen(req, timeout=30); code, body = r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        code, body = e.code, e.read().decode()
    dt = time.perf_counter() - t0
    try: js = json.loads(body)
    except Exception: js = {"raw_head": body[:1500]}
    save(name, {"url": url, "http_status": code, "elapsed_s": round(dt, 6),
                "body_bytes": len(body), "json": js})
print("done stage 1")