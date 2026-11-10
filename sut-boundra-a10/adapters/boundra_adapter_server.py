# -*- coding: utf-8 -*-
"""
boundra_adapter_server.py — MINIMAL TRANSPORT-ONLY adapter for the Argus lab
battery "boundra-a10" (pre-registered A10a/A10b identical-offer race, x402 #4198).

HARD RULE (lab discipline): this file contains ZERO reservation/decision logic.
Every decision comes verbatim from the pinned Boundra checkout:
    Gateway.evaluate_payment() + SpendLedger (SQLite BEGIN IMMEDIATE,
    UNIQUE(owner, purchase_id), SHA-256 intent_digest) loaded from
    BOUNDRA_REPO (commit fb09284434b85f824b099ade4430e1b77b4c4086).
The adapter only translates HTTP <-> Python and logs observations.

Surface = the real Boundra TS SDK API (sdk/typescript/src/index.ts):
    POST /evaluate/basic                 {intent, owner?, agent_id?, purchase_id?}
    POST /evaluations/<id>/settle        {reservation_token, settlement_ref}
    POST /evaluations/<id>/release       {reservation_token}
    GET  /health

Lifecycle: ONE adapter process per battery session, with a FRESH
BOUNDRA_STATE_DIR per session (fresh SQLite spend.db) — the reservation owner
state never leaks across sessions (pre-registration addendum R2).

Stdlib only. Python 3.10+.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

BOUNDRA_REPO = Path(os.environ["BOUNDRA_REPO"]).resolve()          # pinned checkout
STATE_DIR = Path(os.environ.get("BOUNDRA_STATE_DIR") or tempfile.mkdtemp(prefix="boundra-a10-state-"))
PORT = int(os.environ.get("BOUNDRA_ADAPTER_PORT") or "4610")
NL_RULE = os.environ.get(
    "BOUNDRA_NL_RULE",
    # mirrors the vendor's own S-BS-06 replay mandate (fixtures/s-bs-06/replay_s_bs_06.py):
    # stand payTo whitelisted, $1 per tx, no ASK in the battery amount range.
    "Pay the weather API $0.01 per call; max $1 per transaction; "
    "only pay whitelisted providers (0x9999999999999999999999999999999999999999). "
    "Daily spend cap $50.",
)

sys.path.insert(0, str(BOUNDRA_REPO))  # pinned code is the ONLY decision path

from gateway import Gateway            # noqa: E402  (pinned)
from policy import PaymentIntent       # noqa: E402  (pinned)
from spend_ledger import SpendLedger   # noqa: E402  (pinned)

STATE_DIR.mkdir(parents=True, exist_ok=True)
LEDGER_DB = STATE_DIR / "spend.db"

# Pinned construction path (mirrors the vendor's local MCP server wiring,
# mcp_server.py:36 Gateway(NL_RULE)) + the hosted wiring's ledger injection
# (hosted_mcp.py:41-43 Gateway(..., ledger=SpendLedger(...))).
GATEWAY = Gateway(NL_RULE, ledger=SpendLedger(LEDGER_DB))

LOG_LOCK = threading.Lock()


def log(event: dict) -> None:
    line = json.dumps(event, ensure_ascii=False, default=str)
    with LOG_LOCK:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # silence default stderr access log
        pass

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlparse(self.path).path == "/health":
            self._json(200, {"ok": True, "state_dir": str(STATE_DIR),
                             "boundra_repo": str(BOUNDRA_REPO),
                             "policy_summary": GATEWAY.policy_summary})
            return
        self._json(404, {"error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError as e:
            self._json(400, {"error": f"bad json: {e}"})
            return

        path = urlparse(self.path).path
        try:
            if path == "/evaluate/basic":
                intent_args = body.get("intent") or {}
                verdict = GATEWAY.evaluate_payment(
                    PaymentIntent(**intent_args),
                    owner=body.get("owner"),
                    agent_id=body.get("agent_id"),
                    purchase_id=body.get("purchase_id"),
                )
                log({"type": "adapter_evaluate", "owner": body.get("owner"),
                     "purchase_id": body.get("purchase_id"), "intent": intent_args,
                     "decision": verdict.get("decision"), "layer": verdict.get("layer"),
                     "duplicate": verdict.get("duplicate", False),
                     "purchase_id_conflict": verdict.get("purchase_id_conflict", False),
                     "reasons": verdict.get("reasons")})
                self._json(200, verdict)
                return
            if path.startswith("/evaluations/") and path.endswith("/settle"):
                evaluation_id = path.split("/")[2]
                self._json(200, GATEWAY.settle_evaluation(
                    evaluation_id, body.get("reservation_token"),
                    body.get("settlement_ref")))
                return
            if path.startswith("/evaluations/") and path.endswith("/release"):
                evaluation_id = path.split("/")[2]
                self._json(200, GATEWAY.release_evaluation(
                    evaluation_id, body.get("reservation_token")))
                return
            self._json(404, {"error": f"unknown path {path}"})
        except Exception as e:  # fail closed: transport errors must not fake a decision
            log({"type": "adapter_error", "path": path, "error": repr(e)})
            self._json(500, {"error": str(e)})


def main():
    log({"type": "adapter_start", "state_dir": str(STATE_DIR), "port": PORT,
         "boundra_repo": str(BOUNDRA_REPO), "nl_rule": NL_RULE,
         "policy_summary": GATEWAY.policy_summary})
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
