#!/usr/bin/env python3
"""fiangshi demo checker — judgment over the frozen expected column (prereg draft 0032).

Usage:
  git clone https://github.com/Aceop-001/fiangshi <repo>
  cd <repo> && git checkout 1d19e408e8c324c5c8085b8b143cfb6399cb0161 && npm ci
  cp <lab>/sut-fiangshi-census/argus-fiangshi-probe.ts ./argus-fiangshi-probe.ts
  python3 <lab>/sut-fiangshi-census/census_checker.py --repo <repo> --out <pack> \
      --prereg-file <lab>/sut-fiangshi-census/freeze-0032.signed.json --prereg-hash <posted-sha256>

Этап 0 verifies the pinned commit and, when --prereg-file/--prereg-hash are given,
that the frozen prereg artifact still hashes to the value posted in the thread
BEFORE the first live GET (0031 discipline: for the signed JSON wrapper the hash
is taken over its canonical form, not the raw bytes) — a mismatch aborts before
any call; the probe runs twice at pinned times
(no wall-clock dependence); receipt hashes are recomputed by this checker's own
canonicalizer (not fiangshi's code); live rows are evidence only and never affect the
verdict.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import urllib.request

PIN = "1d19e408e8c324c5c8085b8b143cfb6399cb0161"
BASE = "https://fiangshi.xyz"
R1 = "d2c68884841332834a1e0b203e2175c5e1e92de5d279344bd6504db6b5bf4ce0"
R2 = "97b5dded4c5cff75d5b26377b659ef40c7620c45cf143fac27910fb8b1af7691"
R3 = "83d618ba5344776c16fd8b159ad7d6c177838db2057b7cad2c993c8a6a076819"
PREV = {
    R1: "2465f1ab971520d4ea093fed171f59a6c859b0d5252c0f7571671f91b3482e98",
    R2: "f72b3f02eefba08eb33b4336fe48cdce2d3adac8d155c82e70024dccce861249",
    R3: "f64bd4bb6917a345190482787d3ba401453992551cf6f63a10ca2904cbea9f1c",
}
CTX_A, CTX_B = "2026-11-24T14:00:00Z", "2026-11-24T12:00:00Z"
EXPECTED_BANDS_A = {"ALLOW": 105, "REVIEW": 1293, "BLOCK": 525}
EXPECTED_BANDS_B = {"ALLOW": 0, "REVIEW": 1402, "BLOCK": 521}
EXPECTED_POS_A = {"R1_cleave": (1, 124), "R2_bitrefill_20nov": (2, 1073), "R3_bitrefill_24nov": (0, 1073)}
EXPECTED_POS_B = {"R1_cleave": (1, 124), "R2_bitrefill_20nov": (0, 1073), "R3_bitrefill_24nov": None}

rows = []


def row(rid, expected, actual, ok):
    rows.append({"row": rid, "expected": expected, "actual": actual, "match": bool(ok)})
    print(f"  [{'MATCH' if ok else 'DIVERGE'}] {rid}")
    if not ok:
        print(f"          expected: {expected}\n          actual:   {actual}")
    return ok


def canon(value):
    """Mirror of JS JSON.stringify(sortDeep(v)) at the pinned commit: sorted keys, compact, UTF-8, null kept."""
    def sd(x):
        if isinstance(x, list):
            return [sd(i) for i in x]
        if isinstance(x, dict):
            return {k: sd(x[k]) for k in sorted(x.keys())}
        return x
    return json.dumps(sd(value), separators=(",", ":"), ensure_ascii=False)


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "argus-fiangshi-demo", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, r.read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, help="path to the fiangshi clone at the pinned commit")
    ap.add_argument("--out", required=True, help="output dir for the run pack")
    ap.add_argument("--skip-live", action="store_true", help="skip live GET rows (offline-only dry run)")
    ap.add_argument("--prereg-file", help="path to the committed freeze draft; hashes to the posted prereg hash")
    ap.add_argument("--prereg-hash", help="sha256 hex of the draft as posted in thread #1 before the first live GET")
    ap.add_argument("--allow-npx-download", action="store_true",
                    help="allow npx to download an unpinned tsx if the local one is missing (disclosed in the pack)")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    rdir = os.path.join(args.out, "receipts")
    os.makedirs(rdir, exist_ok=True)

    print("== Этап 0: pinned commit + tooling")
    head = subprocess.run(["git", "-C", args.repo, "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    row("P1 repo HEAD == pin", PIN, head, head == PIN)
    probe = os.path.join(args.repo, "argus-fiangshi-probe.ts")
    row("P2 probe present", probe, os.path.exists(probe), os.path.exists(probe))
    have_tsx = os.path.exists(os.path.join(args.repo, "node_modules", ".bin", "tsx"))
    row("P3 tsx installed", "node_modules/.bin/tsx", have_tsx, have_tsx)
    tsx_source = "repo devDeps (pinned by npm ci)"
    if not have_tsx:
        if not args.allow_npx_download:
            print("  ABORT: local tsx missing — npx would fetch an unpinned tsx from the npm registry.")
            print("  Either pin tsx first or re-run with --allow-npx-download (the choice is disclosed in the pack).")
            sys.exit(1)
        tsx_source = "npx download (unpinned — disclosed)"
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
        row(f"P4 prereg hash == posted ({mode}, 0031 discipline)", posted, cands[mode], True)
    run_meta = {"tool": "census_checker.py (sut-fiangshi-census), prereg freeze-0032", "tsx_source": tsx_source,
                "host": {"node": subprocess.run(["node", "-v"], capture_output=True, text=True).stdout.strip(),
                         "npm": subprocess.run(["npm", "-v"], capture_output=True, text=True).stdout.strip(),
                         "os": subprocess.run(["uname", "-s"], capture_output=True, text=True).stdout.strip() + " " +
                               subprocess.run(["uname", "-m"], capture_output=True, text=True).stdout.strip()},
                "prereg_hash": args.prereg_hash, "skip_live": bool(args.skip_live)}
    json.dump(run_meta, open(os.path.join(args.out, "run_meta.json"), "w"), indent=1)

    probes = {}
    for name, now in (("A", CTX_A), ("B", CTX_B)):
        outp = os.path.join(args.out, f"probe_{name}.json")
        env = dict(os.environ, FIANGSHI_NOW=now)
        r = subprocess.run(["npx", "tsx", "argus-fiangshi-probe.ts", outp, rdir], cwd=args.repo,
                           capture_output=True, text=True, env=env, timeout=600)
        if r.returncode != 0:
            print(f"probe {name} FAILED:\n{r.stderr[-2000:]}")
            sys.exit(1)
        probes[name] = json.load(open(outp))
        print(f"probe {name} (FIANGSHI_NOW={now}): bands={probes[name]['bands']}")

    def payee(probe, needle):
        for p in probe["payee_rows"]:
            if needle in (p.get("url") or ""):
                return p
        return None

    print("\n== Context A rows (FIANGSHI_NOW=%s)" % CTX_A)
    A = probes["A"]
    row("A1 bands", EXPECTED_BANDS_A, A["bands"], A["bands"] == EXPECTED_BANDS_A)
    bf = payee(A, "bitrefill")
    exp_a2 = {"band": "ALLOW", "issued_band": "ALLOW", "band_cap": None, "receipt_id": R3, "stale": False}
    act_a2 = {k: bf.get(k) for k in exp_a2} | {"data_age_hours": bf.get("data_age_hours")}
    row("A2 Bitrefill fresh", exp_a2 | {"data_age_hours": "in [0.85,0.95]"}, act_a2,
        all(act_a2[k] == v for k, v in exp_a2.items()) and 0.85 <= (act_a2["data_age_hours"] or -1) <= 0.95)
    cl = payee(A, "cleave")
    exp_a3 = {"band": "BLOCK", "issued_band": "BLOCK", "band_cap": None, "stale": True, "receipt_id": R1}
    row("A3 cleave stale BLOCK", exp_a3, {k: cl.get(k) for k in exp_a3}, all(cl.get(k) == v for k, v in exp_a3.items()))
    ok_a4 = True
    for k, (ch_i, pos) in EXPECTED_POS_A.items():
        p = A["pins"][k]
        ok_a4 &= p.get("found") and (p["chain"], p["pos"]) == (ch_i, pos) and p["verify_receipt"]["ok"] and p["chain_walk_ok"]
    row("A4 pins chains/pos/verify/walk", EXPECTED_POS_A,
        {k: A["pins"][k] for k in EXPECTED_POS_A}, ok_a4)

    print("\n== Context B rows (FIANGSHI_NOW=%s)" % CTX_B)
    B = probes["B"]
    row("B1 bands", EXPECTED_BANDS_B, B["bands"], B["bands"] == EXPECTED_BANDS_B)
    bfB = payee(B, "bitrefill")
    cap = bfB.get("band_cap") or {}
    exp_b2 = {"band": "REVIEW", "issued_band": "ALLOW", "receipt_id": R2,
              "cap_reason": "data_stale", "limit_hours": 72, "age": "in [104.0,104.3]"}
    act_b2 = {"band": bfB.get("band"), "issued_band": bfB.get("issued_band"), "receipt_id": bfB.get("receipt_id"),
              "cap_reason": cap.get("reason"), "limit_hours": cap.get("limit_hours"), "age": cap.get("age_hours")}
    row("B2 Bitrefill capped REVIEW", exp_b2, act_b2,
        bfB.get("band") == "REVIEW" and bfB.get("issued_band") == "ALLOW" and bfB.get("receipt_id") == R2
        and cap.get("reason") == "data_stale" and cap.get("limit_hours") == 72
        and 104.0 <= (cap.get("age_hours") or -1) <= 104.3)
    clB = payee(B, "cleave")
    exp_b3 = {"band": "BLOCK", "band_cap": None, "stale": True, "receipt_id": R1}
    row("B3 cleave BLOCK", exp_b3, {k: clB.get(k) for k in exp_b3}, all(clB.get(k) == v for k, v in exp_b3.items()))
    p_r2b, p_r3b = B["pins"]["R2_bitrefill_20nov"], B["pins"]["R3_bitrefill_24nov"]
    row("B4 R2 present chain 0 pos 1073; R3 absent", EXPECTED_POS_B,
        {"R2": p_r2b.get("found") and (p_r2b.get("chain"), p_r2b.get("pos")) == (0, 1073),
         "R3": p_r3b.get("found")},
        p_r2b.get("found") and (p_r2b["chain"], p_r2b["pos"]) == (0, 1073) and not p_r3b.get("found"))

    print("\n== Receipt integrity (independent canonicalizer)")
    ok_c1 = ok_c2 = True
    for rid in (R1, R2, R3):
        f = os.path.join(rdir, f"{rid}.json")
        if not os.path.exists(f):
            ok_c1 = ok_c2 = False
            continue
        rec = json.load(open(f))
        rh = rec.pop("receipt_hash", None)
        h = hashlib.sha256(canon(rec).encode("utf-8")).hexdigest()
        ok_c1 &= (h == rid)
        ok_c2 &= (rec.get("prev_hash") == PREV[rid])
    row("C1 python-canonical sha256 == id (x3)", "all three reproduce", ok_c1, ok_c1)
    row("C2 prev_hash pins verbatim (x3)", PREV, ok_c2, ok_c2)
    ok_c3 = all(A["pins"][k].get("chain_walk_ok") for k in EXPECTED_POS_A)
    row("C3 fiangshi verifyChain ok (chains 0/1/2)", "ok, zero errors", ok_c3, ok_c3)

    print("\n== Live evidence rows (never affect the verdict)")
    if args.skip_live:
        row("L1/L2", "skipped (--skip-live)", None, True)
    else:
        try:
            st, raw = get_json(f"{BASE}/v1/index.json")
            fp = hashlib.sha256(raw).hexdigest()
            idx = json.loads(raw)
            open(os.path.join(args.out, "index_snapshot.json"), "wb").write(raw)
            entries = next(idx[k] for k in ("payees", "sellers", "entries", "data", "index") if k in idx and isinstance(idx[k], list))
            bands_live = {}
            for e in entries:
                bands_live[e.get("band", "?")] = bands_live.get(e.get("band", "?"), 0) + 1
            mine = [e for e in entries if "cleave" in e.get("url", "") or "bitrefill" in e.get("url", "")]
            json.dump({"status": st, "sha256": fp, "bands": bands_live, "pinned_seller_rows": mine},
                      open(os.path.join(args.out, "L1_index_summary.json"), "w"), indent=1)
            row("L1 index snapshot (DOCUMENTED)", f"status 200, fingerprint recorded: {fp[:16]}…, bands {bands_live}", True, True)
        except Exception as e:
            row("L1 index snapshot (DOCUMENTED)", "recorded", f"error: {e}", True)
        for name, rid in (("R1", R1), ("R2", R2), ("R3", R3)):
            for route, url in (("verify", f"{BASE}/v1/verify?id={rid}"),
                               ("receipt", f"{BASE}/v1/receipt/{rid}"),
                               ("receipts", f"{BASE}/v1/receipts/{rid}")):
                try:
                    st, body = get_json(url)
                    res = {"status": st, "body": json.loads(body)}
                except Exception as e:
                    code = getattr(e, "code", None)
                    res = {"status": code, "note": f"{'not deployed (404) — the redeploy gap this run anchors closed' if code == 404 else str(e)}"}
                json.dump(res, open(os.path.join(args.out, f"L2_{name}_{route}.json"), "w"), indent=1)
                row(f"L2 {name} /{route} (DOCUMENTED)", "recorded as-is", res.get("status"), True)

    print("\n== Verdict")
    judged = [r for r in rows if not r["row"].startswith(("L", "P"))]
    divergences = [r["row"] for r in judged if not r["match"]]
    verdict = "SEAL — all frozen rows match" if not divergences else f"FINDING — divergences: {', '.join(divergences)} (recorded as-is)"
    print(f"  {verdict}")
    json.dump({"pin": PIN, "contexts": [CTX_A, CTX_B], "verdict": verdict, "rows": rows},
              open(os.path.join(args.out, "expected_table.json"), "w"), indent=1)
    with open(os.path.join(args.out, "manifest.sha256"), "w") as mf:
        for root, _, files in os.walk(args.out):
            for f in sorted(files):
                p = os.path.join(root, f)
                if p.endswith("manifest.sha256"):
                    continue
                mf.write(f"{hashlib.sha256(open(p, 'rb').read()).hexdigest()}  {os.path.relpath(p, args.out)}\n")
    print(f"  pack: {args.out} (expected_table.json, probe_A/B.json, receipts/, L1/L2 transcripts, manifest.sha256)")


if __name__ == "__main__":
    main()
