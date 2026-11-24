#!/usr/bin/env python3
"""reciprocal-ruler v0.2 A0 battery — pre-registered as draft 0030 (freeze-0030).

RUNBOOK flow (cf. 0029): this checker is committed PRE-RUN (P1). Run happens
after the prereg hash is posted to base-buzz/paystage#315 and x402#4198;
every call is captured raw into the run pack. Stdlib only.

Scope (agreed in #315 comment 7101307979, order A0 free first): trial tier,
persist_receipt: true, pin commit 75867aa (declared in the thread; the source
repo is private — the verifiable pin is the recon snapshot set + live /health).
Quota: 3 POST per X-Trial-Client id (409 consumes, 422 does not — 0029 obs);
GET /v1/ledger reads are free (author spec, comment 7097154364). Two ids:
argus-0030-a0c1 (3 POST), argus-0030-a0c2 (2 POST).

Receipt mechanics (verbatim per author comment 7097154364): stored judgment is
re-readable at GET /v1/ledger/{idempotency_key}?receipt=... — wrong/no receipt
403 RECEIPT_REQUIRED, unknown key 404 LEDGER_NOT_FOUND, correct receipt 200 with
receipt_verified + recomputation.match + ledger_hash_match.
"""
import hashlib
import json
import os
import sys
import time
from urllib import error as urlerr
from urllib import parse as urlparse
from urllib import request as urlreq

BASE = "https://reciprocal-ruler-x402.vercel.app"
TRIAL_RECONCILE = BASE + "/v1/trial/reconcile"
LEDGER = BASE + "/v1/ledger/"
HEALTH = BASE + "/health"

# R1 canonicalization (0029, byte-exact): 4 hashed fields, sorted keys,
# no whitespace, UTF-8, 'sha256:' prefix. Server rule_versions latest = 0.2.0
# (/health recon 2026-11-24T04:31:40Z) -> primary hash hypothesis uses 0.2.0;
# the 0.1.0 value is kept as a frozen fallback hypothesis. A0.6 (ledger read)
# reveals which one the server actually stored: mismatch = finding, not edit.
PRICE_KRW = 50000  # integer KRW per spec (no floats)
BUYER_ID = "argus-lab"
SUPPLIER_ID = "paystage-sut"
TERMS = {"price_krw": PRICE_KRW}

C1 = "argus-0030-a0c1"
C2 = "argus-0030-a0c2"
KEY1 = "argus-0030-a0-1"
TX1 = "argus-0030-tx-1"

Q_HASH_020 = "sha256:ecfadcb750a4fac739eb000cd18edd8bc4beb8579682e373e4a3a60cf6f205aa"
Q_HASH_010 = "sha256:89e69d6a4effa061e7b58ff9159d65faa074544abec5e2ae437812f7da531f38"
Q_PRIMARY = Q_HASH_020

# A0.1 numbers FIXED in freeze-0030 (delta 10000 covered by holdback 10000):
B_A01 = {
    "idempotency_key": KEY1,
    "tx_id": TX1,
    "quote_hash": Q_PRIMARY,
    "expected_amount_krw": PRICE_KRW,
    "actual_settled_krw": 40000,
    "holdback_krw": 10000,
    "event_type": "POST_TRADE_REFUND",
    "rule_version": "0.2.0",
    "persist_receipt": True,
}
# A0.3: same idempotency key, actual changed 40000 -> 45000 (intent diverges)
B_A03 = dict(B_A01, actual_settled_krw=45000)
# A0.7 pair: identical payload except rule_version; overpayment delta=-10000
B_A07A = {
    "idempotency_key": "argus-0030-a0-7a",
    "tx_id": "argus-0030-tx-7a",
    "quote_hash": Q_PRIMARY,
    "expected_amount_krw": PRICE_KRW,
    "actual_settled_krw": 60000,
    "holdback_krw": 10000,
    "event_type": "POST_TRADE_REFUND",
    # rule_version omitted -> server default 0.1.0 (frozen legacy engine)
}
B_A07B = dict(B_A07A, idempotency_key="argus-0030-a0-7b",
              tx_id="argus-0030-tx-7b", rule_version="0.2.0")


def offline_verdict(expected, actual, holdback, rule_version):
    """Four-row offline recompute (credit table per 0029 observations, R6)."""
    delta = expected - actual
    if delta > 0:
        compensated = min(holdback, delta)
        uncovered = max(0, delta - compensated)
        return {"status": "COMPENSATED", "compensated_krw": compensated,
                "uncovered_krw": uncovered, "credit_delta": -5 if uncovered == 0 else -17}
    if delta < 0:
        if rule_version == "0.2.0":
            return {"status": "OVERPAID", "compensated_krw": 0,
                    "uncovered_krw": 0, "credit_delta": 0}
        return {"status": "SETTLED_OK", "compensated_krw": 0,
                "uncovered_krw": 0, "credit_delta": 5}
    return {"status": "SETTLED_OK", "compensated_krw": 0,
            "uncovered_krw": 0, "credit_delta": 5}


class Runner:
    def __init__(self, outdir, dry=False):
        self.out = outdir
        self.dry = dry
        self.log = []
        os.makedirs(outdir, exist_ok=True)

    def _capture(self, row, seq, method, url, body, client):
        art = {"row": row, "seq": seq, "method": method, "url": url,
               "x_trial_client": client, "request": body,
               "captured_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        return art

    def call(self, row, seq, method, url, body=None, client="", receipt=None):
        art = self._capture(row, seq, method, url, body, client)
        if receipt is not None:
            sep = "&" if urlparse.urlparse(url).query else "?"
            url = url + sep + "receipt=" + urlparse.quote(receipt, safe="")
            art["url"] = url
        if self.dry:
            art.update(status="DRY", response=None, latency_s=None)
            self.log.append(art)
            print(f"  [dry] {row}/{seq} -> {method} {url.split('vercel.app')[-1]}")
            self.save(art)
            return None
        data = None
        headers = {"X-Trial-Client": client} if client else {}
        if method == "POST":
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = urlreq.Request(url, data=data, method=method, headers=headers)
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


def run(r, dry):
    print("A0 battery (freeze-0030, pin 75867aa declared; recon sha256s in draft 0030)")
    r.call("A0.1", 1, "POST", TRIAL_RECONCILE, B_A01, C1)
    r.call("A0.2", 1, "POST", TRIAL_RECONCILE, B_A01, C1)          # byte-identical body
    r.call("A0.3", 1, "POST", TRIAL_RECONCILE, B_A03, C1)          # same key, changed actual
    # GET reads: free, outside quota (author spec)
    r.call("A0.4", 1, "GET", LEDGER + KEY1, None, C1,
           receipt="argus-0030-wrong-receipt")                     # 403 expected
    r.call("A0.5", 1, "GET", LEDGER + "argus-0030-no-such-key", None, C1)  # 404 expected
    a1 = next((a for a in r.log if a["row"] == "A0.1" and isinstance(a.get("response"), dict)), None)
    receipt = (((a1 or {}).get("response") or {}).get("ledger") or {}).get("receipt")
    if receipt and not dry:
        r.call("A0.6", 1, "GET", LEDGER + KEY1, None, C1, receipt=receipt)
    else:
        print("  A0.6 skipped: no receipt captured from A0.1 (recorded as absent row)")
    r.call("A0.7a", 1, "POST", TRIAL_RECONCILE, B_A07A, C2)        # default 0.1.0
    r.call("A0.7b", 1, "POST", TRIAL_RECONCILE, B_A07B, C2)        # 0.2.0
    r.call("A0.8", 1, "GET", HEALTH, None, C2)


def recompute(r):
    """Four-row offline recompute table -> divergence count."""
    rows = []

    def resp(row):
        a = next((x for x in r.log if x["row"] == row and isinstance(x.get("response"), dict)), None)
        return (a or {}).get("response") or {}

    v = resp("A0.1")
    exp = offline_verdict(50000, 40000, 10000, "0.2.0")
    ok = (v.get("status") == exp["status"]
          and v.get("compensated_krw") == exp["compensated_krw"]
          and v.get("uncovered_krw") == exp["uncovered_krw"]
          and v.get("credit_delta") == exp["credit_delta"]
          and (v.get("ledger") or {}).get("persisted") is True
          and bool((v.get("ledger") or {}).get("receipt")))
    rows.append(("row1 A0.1 COMPENSATED persisted+receipt", ok, exp, v))

    l1 = (v.get("ledger") or {}).get("ledger_hash")
    v2 = resp("A0.2")
    l2 = (v2.get("ledger") or {}).get("ledger_hash")
    ok2 = v2.get("idempotent_replay") is True and l1 is not None and l1 == l2
    rows.append(("row2 A0.2 idempotent_replay + ledger_hash unchanged", ok2,
                 {"idempotent_replay": True, "ledger_hash": l1},
                 {"idempotent_replay": v2.get("idempotent_replay"), "ledger_hash": l2}))

    v3 = resp("A0.7a")
    exp3 = offline_verdict(50000, 60000, 10000, "0.1.0")
    ok3 = (v3.get("status") == exp3["status"] and v3.get("credit_delta") == exp3["credit_delta"]
           and v3.get("compensated_krw") == exp3["compensated_krw"])
    rows.append(("row3 A0.7a 0.1.0 SETTLED_OK +5", ok3, exp3, v3))

    v4 = resp("A0.7b")
    exp4 = offline_verdict(50000, 60000, 10000, "0.2.0")
    ok4 = (v4.get("status") == exp4["status"] and v4.get("credit_delta") == exp4["credit_delta"]
           and v4.get("compensated_krw") == 0 and v4.get("uncovered_krw") == 0)
    rows.append(("row4 A0.7b 0.2.0 OVERPAID 0", ok4, exp4, v4))

    print("\noffline recompute (four-row table):")
    div = 0
    for name, ok, exp, got in rows:
        print(f"  {'MATCH ' if ok else 'DIVERGENCE'} {name}")
        if not ok:
            div += 1
            print(f"    expected: {json.dumps(exp, sort_keys=True)}")
            print(f"    live:     {json.dumps(got, sort_keys=True)[:400]}")
    print(f"divergences: {div}")
    return div


def main():
    dry = "--dry-run" in sys.argv
    root = os.path.dirname(os.path.abspath(__file__))
    outdir = os.path.join(root, "..", "work", "ruler-a0-battery-0030")
    for i, a in enumerate(sys.argv):
        if a == "--out":
            outdir = sys.argv[i + 1]
    r = Runner(outdir, dry)
    print(f"reciprocal-ruler 0030 A0 battery (dry={dry}) -> {os.path.abspath(outdir)}")
    run(r, dry)
    if not dry:
        div = recompute(r)
        ids = sorted({a["x_trial_client"] for a in r.log if a.get("x_trial_client")})
        posts = [a for a in r.log if a["method"] == "POST"]
        print(f"\ncalls: {len(posts)} POST across ids {', '.join(ids)} (quota 3/id; 409 consumes)")
        with open(os.path.join(r.out, "summary.json"), "w") as f:
            json.dump({"divergences": div, "post_calls": len(posts), "ids": ids,
                       "rows": len(r.log)}, f, indent=2)


if __name__ == "__main__":
    main()
