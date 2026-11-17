#!/usr/bin/env python3
"""
T4-EXA live discovery-surface conformance battery (wallet-less).

Target: api.exa.ai — Exa /search and /contents x402 v2 payment gate.
Scope discipline:
  - Only the DOCUMENTED, wallet-less discovery surface (Exa docs advertise it:
    "Probe pricing without a wallet by sending unauthenticated requests").
  - No wallets, no funded accounts, no valid payment signatures constructed.
  - Exactly one malformed-signature probe to confirm the documented error
    contract (400 / X402_INVALID_SIGNATURE).
  - Rate limits: published 5 unpaid discovery requests / 60s per IP.
    This battery sends <= 1 request per 22 seconds (max 3 discovery requests
    in any 60s window). A 10s lead-in adds separation from prior ad-hoc probes.
Evidence: full raw responses (status, all headers, body, decoded challenge)
  with UTC timestamps, deterministic JSON output.
"""
import base64
import json
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

SUT = "https://api.exa.ai"
UA = "argus-lab-t4-exa-discovery/1.0 (wallet-less conformance probe; documented surface only; rate-limit compliant)"
EVIDENCE_DIR = Path("/home/z/my-project/argus-lab/attestations/evidence/0022-exa-discovery")
MIRROR_DIR = Path("/home/z/my-project/tool-results")

PROBES = [
    {
        "id": "P1",
        "name": "search-baseline",
        "desc": "Documented discovery mode: POST /search without key or payment header. Expect 402 + challenge; auto/fast pricing $0.007 (7000 atomic) per docs.",
        "url": f"{SUT}/search",
        "headers": {"Content-Type": "application/json"},
        "body": {"query": "argus x402 conformance probe", "numResults": 5},
    },
    {
        "id": "P2",
        "name": "search-clamp-contract",
        "desc": "Documented clamp contract: numResults=15 is 'silently clamped to 10 and pricing is based on 10 results' -> amount must equal P1 amount (7000).",
        "url": f"{SUT}/search",
        "headers": {"Content-Type": "application/json"},
        "body": {"query": "argus x402 conformance probe", "numResults": 15},
    },
    {
        "id": "P3",
        "name": "contents-baseline",
        "desc": "Documented discovery mode on /contents: expect 402 + challenge; text defaults on, $0.001 per page (1000 atomic for 1 URL).",
        "url": f"{SUT}/contents",
        "headers": {"Content-Type": "application/json"},
        "body": {"urls": ["https://example.com"]},
    },
    {
        "id": "P4",
        "name": "malformed-signature-contract",
        "desc": "Documented error contract: unparseable payment signature -> 400 X402_INVALID_SIGNATURE. Header value 'AAAA' is not a valid base64 payment payload.",
        "url": f"{SUT}/search",
        "headers": {"Content-Type": "application/json", "PAYMENT-SIGNATURE": "AAAA"},
        "body": {"query": "argus x402 conformance probe", "numResults": 5},
    },
]

LEAD_IN_S = 10
INTER_PROBE_S = 22


def utcnow():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def send_probe(probe):
    """Send one probe, capture everything. Never retries, never re-sends."""
    data = json.dumps(probe["body"]).encode("utf-8")
    req = urllib.request.Request(probe["url"], data=data, method="POST")
    for k, v in probe["headers"].items():
        req.add_header(k, v)
    req.add_header("User-Agent", UA)

    rec = {
        "id": probe["id"],
        "name": probe["name"],
        "desc": probe["desc"],
        "ts_utc": utcnow(),
        "request": {
            "url": probe["url"],
            "method": "POST",
            "headers_sent": probe["headers"],
            "body": probe["body"],
        },
    }
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            rec["http_status"] = r.status
            rec["response_headers"] = [[k, v] for k, v in r.headers.items()]
            rec["body"] = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        rec["http_status"] = e.code
        rec["response_headers"] = [[k, v] for k, v in e.headers.items()]
        rec["body"] = e.read().decode("utf-8", "replace")
    except Exception as e:  # transport-level failure is evidence too
        rec["http_status"] = None
        rec["transport_error"] = f"{type(e).__name__}: {e}"
        rec["response_headers"] = []
        rec["body"] = ""
    return rec


def decode_challenge(rec):
    """Extract the challenge from header (base64) and/or body (plain JSON)."""
    out = {"header_present": False, "body_present": False}
    hdr_map = {k.lower(): v for k, v in rec.get("response_headers", [])}
    raw = hdr_map.get("payment-required")
    if raw:
        out["header_present"] = True
        out["header_b64_len"] = len(raw)
        try:
            out["challenge_from_header"] = json.loads(base64.b64decode(raw))
        except Exception as e:
            out["header_decode_error"] = f"{type(e).__name__}: {e}"
    body = rec.get("body", "")
    if body.strip():
        try:
            j = json.loads(body)
            if isinstance(j, dict) and "accepts" in j:
                out["body_present"] = True
                out["challenge_from_body"] = j
        except Exception:
            pass
    return out


def analyze(records):
    """Cross-probe conformance analysis (pure functions over captured evidence)."""
    ch = {}
    for r in records:
        c = decode_challenge(r)
        ch[r["id"]] = c

    def accepts(pid):
        c = ch[pid]
        src = c.get("challenge_from_header") or c.get("challenge_from_body") or {}
        return src.get("accepts") or [], src

    a1, s1 = accepts("P1")
    a2, s2 = accepts("P2")
    a3, s3 = accepts("P3")

    def amount(lst, network):
        for e in lst:
            if e.get("network") == network:
                return e.get("amount")
        return None

    def paytos(lst):
        return sorted({e.get("payTo") for e in lst if e.get("payTo")})

    def networks(lst):
        return sorted({e.get("network") for e in lst})

    p1_body_err = None
    try:
        p1_body_err = json.loads(records[0]["body"])
    except Exception:
        pass

    p4 = json.loads(records[3]["body"]) if records[3]["body"].strip() else {}

    return {
        "challenge_transport": {
            "header_present": ch["P1"]["header_present"],
            "body_present": ch["P1"]["body_present"],
            "both_consistent": (
                ch["P1"].get("challenge_from_header", {}).get("accepts")
                == ch["P1"].get("challenge_from_body", {}).get("accepts")
                if ch["P1"]["header_present"] and ch["P1"]["body_present"] else None
            ),
        },
        "challenge_version": {
            "P1": (s1 or p1_body_err or {}).get("x402Version"),
        },
        "base_amount_atomic": {
            "P1_numResults5": amount(a1, "eip155:8453"),
            "P2_numResults15_clamped": amount(a2, "eip155:8453"),
            "clamp_delta": (
                (lambda x, y: (int(y) - int(x)) if x and y else None)(
                    amount(a1, "eip155:8453"), amount(a2, "eip155:8453")
                )
            ),
            "P3_contents_1url": amount(a3, "eip155:8453"),
        },
        "networks_advertised_live": networks(a1),
        "solana_fee_payer_present": any(
            e.get("network", "").startswith("solana:") and e.get("extra", {}).get("feePayer")
            for e in a1
        ),
        "gateway_entries_present": sorted(
            e.get("network") for e in a1 if e.get("extra", {}).get("verifyingContract")
        ),
        "payTo_stability": {
            "P1": paytos(a1),
            "P2": paytos(a2),
            "stable_P1_vs_P2": paytos(a1) == paytos(a2),
        },
        "vendor_extension_fields_in_challenge": sorted(
            (s1 or {}).get("accepts", [{}])[0].get("extra", {}).keys()
        ) if s1 and s1.get("accepts") else [],
        "float_artifact_in_breakdown": (
            (s1 or {}).get("accepts", [{}])[0].get("extra", {}).get("breakdown")
        ),
        "malformed_signature_response": {
            "status": records[3]["http_status"],
            "tag": p4.get("tag"),
            "error": p4.get("error"),
        },
    }


def main():
    print(f"lead-in {LEAD_IN_S}s (rate-limit separation)...")
    time.sleep(LEAD_IN_S)
    records = []
    for i, probe in enumerate(PROBES):
        if i > 0:
            time.sleep(INTER_PROBE_S)
        rec = send_probe(probe)
        records.append(rec)
        c = decode_challenge(rec)
        base = c.get("challenge_from_header") or c.get("challenge_from_body") or {}
        base_amt = next(
            (e.get("amount") for e in base.get("accepts", []) if e.get("network") == "eip155:8453"),
            None,
        )
        print(
            f"{rec['id']} {rec['ts_utc']} {rec['name']}: status={rec['http_status']} "
            f"hdr_challenge={c['header_present']} body_challenge={c['body_present']} "
            f"base_amount={base_amt}"
        )

    evidence = {
        "battery": "T4-EXA live discovery-surface conformance battery (wallet-less)",
        "sut": SUT,
        "docs_contract": "https://exa.ai/docs/integrations/payments/x402/quickstart",
        "run_started_utc": records[0]["ts_utc"],
        "run_finished_utc": records[-1]["ts_utc"],
        "rate_limit_discipline": {
            "published_limit": "5 unpaid discovery requests / 60s per IP; 10 rps per paid wallet",
            "probe_pacing_seconds": INTER_PROBE_S,
            "lead_in_seconds": LEAD_IN_S,
            "total_requests_this_run": len(records),
            "no_wallet": True,
            "no_valid_payment_signature_constructed": True,
        },
        "user_agent_sent": UA,
        "probes": records,
        "analysis": analyze(records),
    }

    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    MIRROR_DIR.mkdir(parents=True, exist_ok=True)
    out = EVIDENCE_DIR / "t4-exa-probes.json"
    out.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (MIRROR_DIR / "t4-exa-probes.json").write_text(out.read_text(encoding="utf-8"), encoding="utf-8")
    print(f"evidence: {out}")
    print(f"mirror  : {MIRROR_DIR / 't4-exa-probes.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
