#!/usr/bin/env python3
"""fiangshi durable-store live-check — judgment over the frozen expected column (prereg draft 0034).

Usage:
  python3 <lab>/sut-fiangshi-store-livecheck/store_checker.py --out <pack> \
      --prereg-file <lab>/sut-fiangshi-store-livecheck/freeze-0034.signed.json \
      --prereg-hash <posted-sha256>

Этап 0 verifies (P1) that the frozen prereg artifact still hashes to the value posted
in the thread BEFORE the first judged live GET (0031 discipline: for the signed JSON
wrapper the hash is taken over its canonical form, UTF-8) — a mismatch aborts before
any call; (P2) the clocks are recorded. The store is re-read via `git clone` of
Aceop-001/fiangshi-receipts at run time (a live re-observation, not the freeze-time
clone); receipt hashes are recomputed by this checker's own canonicalizer (not
fiangshi's code); L rows are evidence only and never affect the verdict.
"""
import argparse
import datetime
import email.utils
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request

STORE = "https://github.com/Aceop-001/fiangshi-receipts"
STORE_FREEZE = "75defddbe49a3cf12406162bc1de58139b0ed052"
API_BASE = "https://api.fiangshi.xyz"
FIANGSHI_MAIN_FREEZE = "9f4cca7f712e8ff779165d434d2cf7517bbf570a"

P1 = "34160e4a12d1afe20c66e3a150a076701310eafea0ca44bb6ecf15a5ae0ca8bf"
P2 = "682a85d7f78c9325526d5843df5a670928988e078c05889c0bbd9834842ef635"
P3 = "dc6d6a6f52b6763388d9271f7e470fff131d73c05524ccb26548774a8e312a98"
PINS = [P1, P2, P3]
FILE_SHA = {
    P1: "c88a936fe966b752ac9176106f423012949a613349ce419331cbcd177044d532",
    P2: "9f7a6295e6a580887c22cbedfccc76071d8fc07b96498006d417d7311a75c37f",
    P3: "c677ad019f71db4473518197f7e147a21c6c4926cbdf80f929cee39ffe81d937",
}
HEAD_FILE_SHA = "d04f1e99f4d8830f94223db437cf6e9bf1b35549858f8749df35e2365f73ba8d"
CHAIN_ID = "e701244c51dd854cb1baebfa724822316f0501cbc57a1de8ee958cb43d556b32"
PREV = {P1: "genesis", P2: P1, P3: P2}
STARTED_AT = "2026-11-25T03:50:17.263Z"
HEAD_RECEIPT_AT_FREEZE = P3
TX = "0x90b919810c9c3a3b6707a1847261d00609018ca42bd15ff9a2fcd10867af9696"

rows = []


def row(rid, expected, actual, ok):
    rows.append({"row": rid, "expected": expected, "actual": actual, "match": bool(ok)})
    print(f"  [{'MATCH' if ok else 'DIVERGE'}] {rid}")
    if not ok:
        print(f"          expected: {expected}\n          actual:   {actual}")
    return ok


def canon(value):
    """Mirror of JS JSON.stringify(sortDeep(v)): sorted keys, compact, UTF-8, null kept."""
    def sd(x):
        if isinstance(x, list):
            return [sd(i) for i in x]
        if isinstance(x, dict):
            return {k: sd(x[k]) for k in sorted(x.keys())}
        return x
    return json.dumps(sd(value), separators=(",", ":"), ensure_ascii=False)


def receipt_id(rec):
    body = {k: v for k, v in rec.items() if k != "receipt_hash"}
    return hashlib.sha256(canon(body).encode("utf-8")).hexdigest()


def http_get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "argus-fiangshi-demo", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        date_hdr = r.headers.get("Date")
        return r.status, r.read(), date_hdr


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def parse_http_date(s):
    if not s:
        return None
    dt = email.utils.parsedate_to_datetime(s)
    return dt.astimezone(datetime.timezone.utc)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="output dir for the run pack")
    ap.add_argument("--prereg-file", help="path to the signed freeze wrapper; hashes to the posted prereg hash")
    ap.add_argument("--prereg-hash", help="sha256 hex of the wrapper as posted in thread #1 before the run")
    ap.add_argument("--keep-clone", help="keep the store clone at this path instead of a temp dir")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    print("== Этап 0: prereg discipline + clocks")
    run_meta = {"tool": "store_checker.py (sut-fiangshi-store-livecheck), prereg freeze-0034",
                "started_utc": now_iso(),
                "store_freeze_commit": STORE_FREEZE, "fiangshi_main_freeze": FIANGSHI_MAIN_FREEZE,
                "api_base": API_BASE,
                "host": {"python": sys.version.split()[0],
                         "os": subprocess.run(["uname", "-s"], capture_output=True, text=True).stdout.strip() + " " +
                               subprocess.run(["uname", "-m"], capture_output=True, text=True).stdout.strip()},
                "prereg_hash": args.prereg_hash}
    if args.prereg_file and args.prereg_hash:
        posted = args.prereg_hash.strip().lower()
        raw = open(args.prereg_file, "rb").read()
        cands = {"raw-bytes": hashlib.sha256(raw).hexdigest()}
        try:
            w = json.loads(raw)
            cands["canonical-json"] = hashlib.sha256(
                json.dumps(w, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            ).hexdigest()
        except Exception:
            pass
        mode = next((m for m, v in cands.items() if v == posted), None)
        if mode is None:
            print(f"  ABORT: prereg artifact hashes {cands} != posted prereg hash {posted} (0031 discipline).")
            sys.exit(1)
        row(f"P1 prereg hash == posted ({mode}, 0031 discipline)", posted, cands[mode], True)
    try:
        st, _, date_hdr = http_get(API_BASE + "/health")
        api_dt, local_dt = parse_http_date(date_hdr), datetime.datetime.now(datetime.timezone.utc)
        offset_s = round((local_dt - api_dt).total_seconds(), 3) if api_dt else None
    except Exception as e:
        offset_s = None
    run_meta["clocks"] = {"sandbox_utc_at_health": now_iso(),
                          "api_date_header_offset_seconds": offset_s,
                          "disclosed": "offset recorded as-is, never adjudicated (vendor claim: api.fiangshi.xyz <= ~1 min behind)"}
    row("P2 clocks recorded (disclosed fact, not adjudicated)",
        "sandbox UTC + api Date header offset in run_meta.json", offset_s, True)
    json.dump(run_meta, open(os.path.join(args.out, "run_meta.json"), "w"), indent=1)

    print("\n== Store re-pull (git clone at run time)")
    store_dir = args.keep_clone or os.path.join(tempfile.mkdtemp(prefix="fi-store-"), "fiangshi-receipts")
    r = subprocess.run(["git", "clone", "--quiet", STORE, store_dir], capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        print(f"  ABORT: store clone failed: {r.stderr[-500:]}")
        sys.exit(1)
    head_sha = subprocess.run(["git", "-C", store_dir, "rev-parse", "HEAD"],
                              capture_output=True, text=True).stdout.strip()
    head_committed = subprocess.run(["git", "-C", store_dir, "log", "-1", "--format=%cI"],
                                    capture_output=True, text=True).stdout.strip()
    print(f"  store head at run: {head_sha} ({head_committed})")
    json.dump({"head": head_sha, "committed_at": head_committed, "freeze_head": STORE_FREEZE,
               "advanced_past_freeze": head_sha != STORE_FREEZE},
              open(os.path.join(args.out, "L3_store_head.json"), "w"), indent=1)

    raw_head = open(os.path.join(store_dir, "receipts", "HEAD.json"), "rb").read()
    raw_receipts = {p: open(os.path.join(store_dir, "receipts", p[:2], f"{p}.json"), "rb").read() for p in PINS}
    for p, b in raw_receipts.items():
        open(os.path.join(args.out, f"store_{p[:8]}.json"), "wb").write(b)
    open(os.path.join(args.out, "store_HEAD.json"), "wb").write(raw_head)

    print("\n== S rows (judged)")
    head = json.loads(raw_head)
    files = []
    for shard in sorted(os.listdir(os.path.join(store_dir, "receipts"))):
        if shard in ("HEAD.json",) or "." in shard:
            continue
        for f in sorted(os.listdir(os.path.join(store_dir, "receipts", shard))):
            files.append(f[:-5])
    walk, cur, ok_s1 = [], head.get("receipt_hash"), True
    while cur and cur != "genesis" and cur in files:
        rec = json.load(open(os.path.join(store_dir, "receipts", cur[:2], f"{cur}.json")))
        walk.append(cur)
        cur = rec.get("prev_hash")
        if len(walk) > 10000:
            ok_s1 = False
            break
    rev = list(reversed(walk))  # chain order: oldest -> newest
    covers = all(p in rev for p in PINS) and rev.index(P1) < rev.index(P2) < rev.index(P3)
    usd = round(sum(json.load(open(os.path.join(store_dir, "receipts", p[:2], f"{p}.json"))).get("fee_usd") or 0
                    for p in files
                    if json.load(open(os.path.join(store_dir, "receipts", p[:2], f"{p}.json"))).get("settlement") == "settled"), 2)
    ok_s1 &= (head.get("count") == len(files)) and (head.get("started_at") == STARTED_AT) and (abs(usd - 0.05) < 1e-9) and covers
    row("S1 HEAD.json consistency + append-only chain walk",
        {"receipt_hash_at_freeze": HEAD_RECEIPT_AT_FREEZE, "covers_frozen_segment": "P1->P2->P3",
         "count": "== files", "started_at": STARTED_AT, "usd_settled": 0.05},
        {"head_receipt_hash": head.get("receipt_hash"), "walk_len": len(walk), "covers": covers,
         "count": head.get("count"), "files": len(files), "started_at": head.get("started_at"),
         "usd_settled_computed": usd}, ok_s1)

    ok_s2 = all(hashlib.sha256(b).hexdigest() == FILE_SHA[p] for p, b in raw_receipts.items())
    row("S2 pinned store files byte-identical (x3 sha256)",
        FILE_SHA, {p[:8]: hashlib.sha256(b).hexdigest() for p, b in raw_receipts.items()}, ok_s2)

    ok_s3, s3_detail = True, {}
    for p, b in raw_receipts.items():
        rec = json.loads(b)
        h = receipt_id(rec)
        s3_detail[p[:8]] = h
        ok_s3 &= (h == p == rec.get("receipt_hash"))
    row("S3 independent canonical recompute == id (x3, own canonicalizer)",
        "recompute == receipt_hash == filename stem", s3_detail, ok_s3)

    s4_detail, ok_s4 = {}, True
    for p in PINS:
        rec = json.load(open(os.path.join(store_dir, "receipts", p[:2], f"{p}.json")))
        s4_detail[p[:8]] = {"prev_hash": rec.get("prev_hash"), "chain_id": rec.get("chain_id")}
        ok_s4 &= (rec.get("prev_hash") == PREV[p]) and (rec.get("chain_id") == CHAIN_ID)
    row("S4 chain links verbatim + chain_id (x3)",
        {"P1": "genesis", "P2": "P1 id", "P3": "P2 id", "chain_id": CHAIN_ID}, s4_detail, ok_s4)

    ok_s5, s5_detail = True, {}
    for p in PINS:
        st, body, _ = http_get(f"{API_BASE}/v1/receipt/{p}")
        wrap = json.loads(body)
        json.dump({"status": st, "body": wrap},
                  open(os.path.join(args.out, f"L5_receipt_{p[:8]}.json"), "w"), indent=1)
        rec_api = wrap.get("receipt")
        same = (st == 200) and isinstance(rec_api, dict) and (canon(rec_api) == canon(json.loads(raw_receipts[p])))
        s5_detail[p[:8]] = {"status": st, "canonical_equal_store": same,
                            "recomputes_to": receipt_id(rec_api) if isinstance(rec_api, dict) else None}
        ok_s5 &= same
    row("S5 API /v1/receipt/<id> serves store bytes (x3) — the 0032 L2 gap",
        "status 200 + canonical(api receipt) == canonical(store receipt)", s5_detail, ok_s5)

    recs = {p: json.load(open(os.path.join(store_dir, "receipts", p[:2], f"{p}.json"))) for p in PINS}
    s6_act = {"P2_settlement": recs[P2].get("settlement"), "P2_tx_hash": recs[P2].get("tx_hash"),
              "P2_chain": recs[P2].get("chain"), "P2_fee_usd": recs[P2].get("fee_usd"),
              "P1_settlement": recs[P1].get("settlement"), "P3_settlement": recs[P3].get("settlement")}
    ok_s6 = (s6_act["P2_settlement"] == "settled" and s6_act["P2_tx_hash"] == TX
             and s6_act["P2_chain"] == "eip155:8453" and abs(s6_act["P2_fee_usd"] - 0.05) < 1e-9
             and s6_act["P1_settlement"] == "dry-run" and s6_act["P3_settlement"] == "dry-run")
    row("S6 settlement pins verbatim (claim, hash-anchored)",
        {"P2": ["settled", TX, "eip155:8453", 0.05], "P1": "dry-run", "P3": "dry-run"},
        s6_act, ok_s6)

    print("\n== Live evidence rows (never affect the verdict)")
    try:
        st, body, date_hdr = http_get(API_BASE + "/health")
        api_dt, local_dt = parse_http_date(date_hdr), datetime.datetime.now(datetime.timezone.utc)
        off = round((local_dt - api_dt).total_seconds(), 3) if api_dt else None
        health = json.loads(body)
        json.dump({"status": st, "body": health, "date_header_offset_seconds": off},
                  open(os.path.join(args.out, "L1_health.json"), "w"), indent=1)
        store_total = (health.get("receipts_stored") or {}).get("store_total")
        row("L1 /health (DOCUMENTED)", "status 200, store_total >= 3, offset disclosed",
            {"status": st, "store_total": store_total, "offset_s": off},
            st == 200 and isinstance(store_total, int) and store_total >= 3)
    except Exception as e:
        row("L1 /health (DOCUMENTED)", "recorded", f"error: {e}", True)
    for i, p in enumerate(PINS, 1):
        try:
            st, body, _ = http_get(f"{API_BASE}/v1/verify?id={p}")
            v = json.loads(body)
            json.dump({"status": st, "body": v},
                      open(os.path.join(args.out, f"L2_verify_{p[:8]}.json"), "w"), indent=1)
            row(f"L2 P{i} /v1/verify (DOCUMENTED)", "recorded as-is",
                {"status": st, "valid": v.get("valid"), "chain_linkage": v.get("chain_linkage")}, True)
        except Exception as e:
            row(f"L2 P{i} /v1/verify (DOCUMENTED)", "recorded as-is", f"error: {e}", True)
    row("L3 store head at run (git fetch, DOCUMENTED)", f"recorded as-is (freeze head {STORE_FREEZE[:8]}…)",
        {"head": head_sha, "advanced": head_sha != STORE_FREEZE}, True)

    print("\n== Verdict")
    judged = [r for r in rows if r["row"].startswith("S")]
    divergences = [r["row"] for r in judged if not r["match"]]
    verdict = "SEAL — all frozen rows match" if not divergences else f"FINDING — divergences: {', '.join(divergences)} (recorded as-is)"
    print(f"  {verdict}")
    json.dump({"store": STORE, "store_freeze_commit": STORE_FREEZE,
               "fiangshi_main_freeze": FIANGSHI_MAIN_FREEZE, "verdict": verdict, "rows": rows},
              open(os.path.join(args.out, "expected_table.json"), "w"), indent=1)
    run_meta["verdict"] = verdict
    run_meta["finished_utc"] = now_iso()
    json.dump(run_meta, open(os.path.join(args.out, "run_meta.json"), "w"), indent=1)
    with open(os.path.join(args.out, "manifest.sha256"), "w") as mf:
        for root, _, fs in os.walk(args.out):
            for f in sorted(fs):
                p = os.path.join(root, f)
                if p.endswith("manifest.sha256"):
                    continue
                mf.write(f"{hashlib.sha256(open(p, 'rb').read()).hexdigest()}  {os.path.relpath(p, args.out)}\n")
    print(f"  pack: {args.out} (expected_table.json, store_* receipts, L1/L2/L5 transcripts, manifest.sha256)")
    if not args.keep_clone:
        shutil.rmtree(os.path.dirname(store_dir), ignore_errors=True)


if __name__ == "__main__":
    main()
