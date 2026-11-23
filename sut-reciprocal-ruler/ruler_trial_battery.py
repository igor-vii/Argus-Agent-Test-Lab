#!/usr/bin/env python3
"""reciprocal-ruler v0.1 trial evaluation — pre-registered matrix of draft 0029.

RUNBOOK flow (cf. 0028): this checker is committed PRE-RUN (P1). Run happens on
explicit operator go; every call is captured raw into the run pack. Stdlib only.

Trial mechanics (recon R3): quota is 3 calls per X-Trial-Client id; trial calls are
not persisted to the audit ledger and not server-side idempotent. One id per row,
ids disclosed in the run pack. Paid rows (A1 ledger-backed determinism, A7 ledger
recompute) are deferred to the paid x402 cycle — not silently dropped.

SUT spec: base-buzz/paystage#315, comment 7069954625 (hwcho310, 2026-11-21T22:07Z).
"""
import json, hashlib, os, sys, time
from urllib import request as urlreq
from urllib import error as urlerr

BASE = "https://reciprocal-ruler-x402.vercel.app"
TRIAL_QUOTE = BASE + "/v1/trial/quote-lock"
TRIAL_RECONCILE = BASE + "/v1/trial/reconcile"
TRIAL_VERIFY_MATH = BASE + "/v1/trial/verify-math"

# R1 recon (2026-11-22): byte-exact canonicalization, 4 hashed fields, live digest:
RECON_QUOTE_HASH = "14723d939ea170807a0d326c211dc6dbbab0b2416700a1ea091165d8ee1b2fd3"

PRICE_KRW = 50000  # integer KRW per spec (no floats)


def quote_hash(rule_version, buyer_id, supplier_id, terms):
    payload = {"rule_version": rule_version, "buyer_id": buyer_id,
               "supplier_id": supplier_id, "terms": terms}
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False,
                     separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def qlock_body(terms=None):
    return {"rule_version": "v0.1", "buyer_id": "argus-lab", "supplier_id": "paystage-sut",
            "buyer_version": "argus-0029", "supplier_version": "v0.1",
            "terms": terms if terms is not None else {"price_krw": PRICE_KRW}}


def rec_body(qh, expected, actual, holdback, event="POST_TRADE_REFUND", key="argus-lab-key-1"):
    return {"quote_hash": qh, "event_type": event,
            "expected_amount_krw": expected, "actual_settled_krw": actual,
            "holdback_krw": holdback, "caller_key": key}


# (id, mode, case, expected outcome per prereg 0029)
MATRIX = [
    ("A2", "trial", "reconcile: actual == expected (delta=0)", "SETTLED_OK, credit_delta +5"),
    ("A3", "trial", "shortfall covered by holdback (delta>0, holdback>=delta)",
          "COMPENSATED, uncovered=0, credit_delta -5"),
    ("A4", "trial", "shortfall NOT covered (holdback<delta)",
          "COMPENSATED, uncovered>0, credit_delta -17"),
    ("A5", "trial", "HALF_OPEN_TIMEOUT, delta>0",
          "PENDING_RECONCILIATION, credit_delta 0, no auto-compensation"),
    ("A6", "trial", "idempotency: same caller key, different amount (replay)",
          "trial: record actual (server dedup not expected per R3); divergence = finding"),
    ("B1", "trial", "boundary: delta=0 explicit", "per contract; expect SETTLED_OK semantics"),
    ("B2", "trial", "boundary: holdback=0, delta>0", "uncovered=delta, credit_delta -17"),
    ("B3", "trial", "boundary: delta<0 (overpayment)",
          "spec undefined -> honest absent-candidate, not FAIL"),
    ("VM", "trial", "verify-math arithmetic endpoint probe", "record actual; probe, not a matrix row"),
]
# paid-deferred: A1 quote-lock ledger-backed determinism ($0.05 x2 + ledger),
# A7 third-party recompute over the audit ledger dump.


class Runner:
    def __init__(self, outdir, dry=False):
        self.out = outdir
        self.dry = dry
        self.log = []
        os.makedirs(outdir, exist_ok=True)

    def call(self, row, seq, method, url, body, client):
        art = {"row": row, "seq": seq, "method": method, "url": url,
               "x_trial_client": client, "request": body,
               "captured_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        if self.dry:
            art.update(status="DRY", response=None, latency_s=None)
            self.log.append(art)
            print(f"  [dry] {row}/{seq} -> {method} {url.split('vercel.app')[-1]} client={client}")
            return None
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        req = urlreq.Request(url, data=data, method="POST",
                             headers={"Content-Type": "application/json",
                                      "X-Trial-Client": client})
        t0 = time.time()
        try:
            with urlreq.urlopen(req, timeout=30) as r:
                code, text = r.status, r.read().decode("utf-8", "replace")
        except urlerr.HTTPError as e:
            code, text = e.code, e.read().decode("utf-8", "replace")
        art.update(status=code, latency_s=round(time.time() - t0, 3))
        try:
            art["response"] = json.loads(text)
        except Exception:
            art["response_raw"] = text
        self.save(art)
        print(f"  {row}/{seq} -> HTTP {code} ({art['latency_s']}s)")
        return art

    def save(self, art):
        with open(os.path.join(self.out, f"{art['row']}-{art['seq']}.json"), "w") as f:
            json.dump(art, f, indent=2, ensure_ascii=False)
        self.log.append(art)


def run_row(r, row, case, qh_holder, extra=None):
    """One row = one attempt: trial quote-lock (pin terms) then reconcile(s)."""
    client = f"argus-0029-{row.lower()}"
    print(f"[{row}] {case}")
    qb = qlock_body()
    qa = r.call(row, 1, "POST", TRIAL_QUOTE, qb, client)
    lh = quote_hash(qb["rule_version"], qb["buyer_id"], qb["supplier_id"], qb["terms"])
    if qa and qa.get("status") == 200:
        resp = qa["response"] or {}
        qh_holder[row] = resp.get("quote_hash") or lh
        if resp.get("quote_hash"):
            ok = resp["quote_hash"] == lh
            qa["quote_hash_canon_check"] = {"local": lh, "match": ok}
            r.save(qa)
            print(f"    canon check: {'MATCH' if ok else 'DIVERGENCE (finding candidate)'}")
    qh = qh_holder.get(row) or lh  # local fallback, honest-marked if response lacked it
    seq = 2
    for body in (extra or []):
        body.setdefault("quote_hash", qh)
        r.call(row, seq, "POST", TRIAL_RECONCILE, body, client)
        seq += 1
    return qh


# Pass 2 (2026-11-23): corrected schema from the live /openapi.json + pass-1 findings.
# QuoteLockRequest: rule_version is NOT in the request schema (yet IS inside the hash per spec
# author) -> canon check runs offline hypotheses over rule_version candidates, zero extra calls.
# ReconcileRequest: idempotency_key + tx_id required; holdback_krw optional (default 22000);
# event_type enum {HALF_OPEN_TIMEOUT, POST_TRADE_REFUND}. VerifyMathRequest: expected_amount/
# actual_amount; labels MATCHED/SHORTFALL/OVERPAID. Quota: shared across trial endpoints per
# client; a 409 consumes a call, a 422 validation error does not (observed in pass-1 artifacts).
# Equality hypothesis CONFIRMED (probe 2026-11-23T05:57Z, HTTP 200): the server requires
# buyer_version == supplier_version (reciprocal declaration of the same rule version); unequal
# values explain every pass-1/probe 409. The response also reveals rule_version="0.1.0" (the
# server-side rule version evolved from the v0.1 era of the #315 answer).
VERSION_CANDIDATES = ["0.1.0", "v0.1.0", "0.1"]
RULE_VERSION_HYPOTHESES = ["0.1.0", "v0.1", "0.1"]
PASS2_PREFIX = "argus-0029-p2"


def canon_hypotheses(buyer_id, supplier_id, terms):
    return {rv: quote_hash(rv, buyer_id, supplier_id, terms) for rv in RULE_VERSION_HYPOTHESES}


def canon_report(resp_hash, hyps):
    for rv, h in hyps.items():
        if h == resp_hash:
            return f"canon MATCH (rule_version={rv})"
    return "canon: no hypothesis matched — finding candidate (hash recorded)"


def run_pass2(r):
    """Pass 2: evaluation with corrected schema; fresh disclosed ids, quota <=3 per id."""
    print("pass 2 — corrected schema; fresh ids argus-0029-p2-*")
    buyer_version = "argus-lab/0029-p2"

    # version discovery on a dedicated probe id (server validates versions: 409 VERSION_MISMATCH)
    version = None
    for i, cand in enumerate(VERSION_CANDIDATES, 1):
        body = {"buyer_version": cand, "supplier_version": cand,
                "buyer_id": "argus-lab", "supplier_id": "paystage-sut",
                "terms": {"price_krw": PRICE_KRW}}
        a = r.call("PROBE", i, "POST", TRIAL_QUOTE, body, f"{PASS2_PREFIX}-probe-r2")
        if a and a.get("status") == 200:
            version = cand
            resp_h = (a["response"] or {}).get("quote_hash")
            hyps = canon_hypotheses("argus-lab", "paystage-sut", {"price_krw": PRICE_KRW})
            verdict = canon_report(resp_h, hyps) if resp_h else "no quote_hash in response"
            a["canon_hypotheses"] = hyps
            r.save(a)
            print(f"    accepted supplier_version={cand} | {verdict}")
            break
        print(f"    candidate {cand} rejected" if a else f"    candidate {cand}: no response")
    if not version:
        print(f"STOP: no accepted supplier_version among {VERSION_CANDIDATES} — pass 2 blocked; record as finding")
        return

    qh_holder = {"v": None}

    def qlock(row, seq):
        body = {"buyer_version": version, "supplier_version": version,
                "buyer_id": "argus-lab", "supplier_id": "paystage-sut",
                "terms": {"price_krw": PRICE_KRW}}
        a = r.call(row, seq, "POST", TRIAL_QUOTE, body, f"{PASS2_PREFIX}-{row.lower()}")
        if a and a.get("status") == 200:
            resp_h = (a["response"] or {}).get("quote_hash")
            if resp_h:
                qh_holder["v"] = resp_h
                hyps = canon_hypotheses("argus-lab", "paystage-sut", {"price_krw": PRICE_KRW})
                a["canon_hypotheses"] = hyps
                a["canon_result"] = canon_report(resp_h, hyps)
                r.save(a)
                print(f"    canon: {a['canon_result']}")
        return a

    def rec(row, seq, expected, actual, holdback, event="POST_TRADE_REFUND", key=None, tx=None):
        body = {"idempotency_key": key or f"argus-0029-p2-{row.lower()}-key",
                "tx_id": tx or f"argus-0029-p2-{row.lower()}-tx1",
                "quote_hash": qh_holder["v"] or "sha256:unavailable",
                "expected_amount_krw": expected, "actual_settled_krw": actual,
                "holdback_krw": holdback, "event_type": event}
        return r.call(row, seq, "POST", TRIAL_RECONCILE, body, f"{PASS2_PREFIX}-{row.lower()}")

    for row, case, args in [
        ("A2", "actual == expected", (PRICE_KRW, PRICE_KRW, 10000)),
        ("A3", "shortfall covered", (PRICE_KRW, 40000, 10000)),
        ("A4", "shortfall NOT covered", (PRICE_KRW, 40000, 5000)),
        ("A5", "HALF_OPEN_TIMEOUT", (PRICE_KRW, 40000, 10000)),
    ]:
        print(f"[{row}] {case}")
        qlock(row, 1)
        rec(row, 2, *args, event="HALF_OPEN_TIMEOUT" if row == "A5" else "POST_TRADE_REFUND")
    print("[A6] idempotency replay: same key+tx, different amount")
    qlock("A6", 1)
    rec("A6", 2, PRICE_KRW, 40000, 10000, key="argus-0029-p2-a6-key", tx="argus-0029-p2-a6-tx1")
    rec("A6", 3, PRICE_KRW, 45000, 10000, key="argus-0029-p2-a6-key", tx="argus-0029-p2-a6-tx1")
    for row, case, args in [
        ("B1", "boundary delta=0, holdback=0", (PRICE_KRW, PRICE_KRW, 0)),
        ("B2", "boundary holdback=0, delta>0", (PRICE_KRW, 40000, 0)),
        ("B3", "boundary overpayment (delta<0)", (PRICE_KRW, 60000, 10000)),
    ]:
        print(f"[{row}] {case}")
        qlock(row, 1)
        rec(row, 2, *args)
    print("[VM] verify-math probes: MATCHED + SHORTFALL")
    vm = f"{PASS2_PREFIX}-vm"
    r.call("VM", 1, "POST", TRIAL_VERIFY_MATH,
           {"expected_amount": PRICE_KRW, "actual_amount": PRICE_KRW, "currency": "KRW"}, vm)
    r.call("VM", 2, "POST", TRIAL_VERIFY_MATH,
           {"expected_amount": PRICE_KRW, "actual_amount": 40000, "currency": "KRW"}, vm)

    ids = sorted({a["x_trial_client"] for a in r.log})
    print(f"\npass 2: {len(r.log)} calls across {len(ids)} ids: {', '.join(ids)}")


def main():
    dry = "--dry-run" in sys.argv
    outdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "work", "ruler-trial-battery")
    for i, a in enumerate(sys.argv):
        if a == "--out":
            outdir = sys.argv[i + 1]
    r = Runner(outdir, dry)
    print(f"reciprocal-ruler 0029 trial evaluation (dry={dry}) -> {os.path.abspath(outdir)}")
    if "--pass2" in sys.argv:
        if "--out" not in sys.argv:
            outdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "work", "ruler-trial-battery-p2")
            r.out = outdir
            os.makedirs(outdir, exist_ok=True)
            print(f"pass 2 artifacts -> {os.path.abspath(outdir)}")
        run_pass2(r)
        return
    qh = {}
    print("R1 (recon 2026-11-22): canonicalization reproduced byte-for-byte offline; "
          "runtime canon checks run per quote-lock call below (local recompute vs response).")

    run_row(r, "A2", "actual == expected", qh, [rec_body("X", PRICE_KRW, PRICE_KRW, 10000)])
    run_row(r, "A3", "shortfall covered", qh, [rec_body("X", PRICE_KRW, 40000, 10000)])
    run_row(r, "A4", "shortfall NOT covered", qh, [rec_body("X", PRICE_KRW, 40000, 5000)])
    run_row(r, "A5", "HALF_OPEN_TIMEOUT", qh,
            [rec_body("X", PRICE_KRW, 40000, 10000, event="HALF_OPEN_TIMEOUT")])
    run_row(r, "A6", "idempotency replay", qh,
            [rec_body("X", PRICE_KRW, 40000, 10000, key="argus-lab-key-1"),
             rec_body("X", PRICE_KRW, 45000, 10000, key="argus-lab-key-1")])
    run_row(r, "B1", "boundary delta=0", qh, [rec_body("X", PRICE_KRW, PRICE_KRW, 0)])
    run_row(r, "B2", "boundary holdback=0", qh, [rec_body("X", PRICE_KRW, 40000, 0)])
    run_row(r, "B3", "boundary overpayment", qh, [rec_body("X", PRICE_KRW, 60000, 10000)])
    r.call("VM", 1, "POST", TRIAL_VERIFY_MATH,
           {"expr": f"min(10000, {PRICE_KRW - 40000})"}, "argus-0029-vm")

    ids = sorted({a["x_trial_client"] for a in r.log})
    print(f"\nplan: {len(r.log)} calls across {len(ids)} trial ids: {', '.join(ids)}")
    print("quota: 3/id (R3). Deferred to paid tier: A1 (ledger-backed determinism), "
          "A7 (ledger recompute). Artifacts + summary -> run pack attestations/evidence/0029-reciprocal-ruler-trial/")


if __name__ == "__main__":
    main()
