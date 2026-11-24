# Evidence pack — 0031 hookguard battery (freeze-0031)

Pre-registered $0.00 hostile battery of the `onBeforePaymentCreation` hook
(`agentic-finance-graph@0.3.7`, policy `recommended-v3`), executed 2026-11-24T06:21:57–22:19Z
(22 seconds wall time, 33 calls), after the freeze was committed (`b00570dd`) and the
prereg hash was posted to x402#3866 (comment 7123847605, before the first check call;
the freeze itself is the operator's comment 7123472722). Budget: $0.00 — free
`gate_check` only, no key, no payment signed.

## What ran

`node sut-hookguard/battery_hookguard.mjs <s1a|s1b|s2|s3|s4|s5|s6|s7>` (checker sha256
`41dc9c93f85ce7e2913ef7cdf12caa2540606f16bfe1809b4f639e81c30a0503`, committed pre-run
per RUNBOOK P1). Local invocation of `makeGateHook` from the installed package; per
check exactly one free `gate_check` MCP `tools/call` to `https://agenticfinancegraph.com/mcp`;
the raw MCP HTTP exchange captured verbatim by an injected `fetchImpl` wrapper. Subject
agent `45978` (ERC-8004 Base, 0 pay events in 30 days — per the vendor's "any agent
registered on Base can be the subject"); six synthetic payees P1–P6; references R1/R5/RR1/RC1
+ fresh-ref schemes, all literals pinned in the draft. Every call written exactly once,
no retries; Этап 0 checks all MATCH (npm view == draft integrity, clean npm ci,
verify-registry 31 records head `ed94e07f…`, node -e prereg-hash == posted).

## Result

**6 MATCH, 1 DIVERGENCE of 7 sessions → record type: findings (prereg note 5).**

- **S1 (C1) MATCH** — R1/P1 $200 allow → process restart (pid changed, store untouched)
  → block, reason exactly `new_payee_window_above_max:200+200>250/168h`.
- **S2 (C2) MATCH** — 10/10 fresh-reference $200 checks to P1 all allow; every fresh ref's
  pending `{counted:true, decisions:0, usd:0}` — clean start, no cross-reference aggregation.
- **S3 MATCH** — 5×$60 across 5 fresh refs to P2: 5/5 allow; the window never sees $300.
- **S4 MATCH** — payTo rotation under RR1: P3/P4/P5 allow, 4th (P6) block
  `new_payees_per_day_exceeded:4>3` — the cap counts distinct addresses, not checks.
- **S5 MATCH** — R5/P6: $200 allow, $50 allow (exactly 250 in window — strict `>` held),
  $50 block `new_payee_window_above_max:250+50>250/168h`. Inclusive boundary did not materialize.
- **S6 DIVERGENCE (criterion semantics)** — 8 parallel identical RC1/P1 $200: 7 allow,
  1 block (`new_payee_window_above_max:1200+200>250/168h`). Frozen operationalization
  (max pending.decisions == allow count = 7, max pending.usd == 1400) does not hold:
  actual max 6 / 1200, because the Gate's `pending` is a **pre-decision snapshot**
  (independently proven by S5: check 2 under R5 sees usd=200, check 3 sees usd=250).
  The primary frozen expectation — no double-count, no under-count — **is verified**:
  the block formula `1200+200>250` accounts for all 8 checks exactly once (7 allows
  counted $200 each, the block not counted). Race outcome recorded: 7 of 8 identical
  parallel checks allowed — $1400 passed under the $250/168h first-week window.
- **S7 (C3) MATCH** — payment-creation attempt with no hook registered: zero MCP
  requests fired; no externally observable signal; absence recorded as the result.

Sessions 2, 3 and 7 came back clean — the positive statement about the hook the vendor's
disclosure did not cover, recorded the same way as a finding.

## Files

- `run.json` — prereg pins (freeze commit, prereg hash, posts), platform/transport, host, window, Этап 0 checks, budget.
- `runs/sN-callK.json` — raw per-call transcripts (33): utc_ts, session, call_no, role, reference, payee, amount, `full_response_verbatim` (raw MCP body), `sha256(response)`, hook outcome/log, pid.
- `offline_table.md` / `offline_table.json` — 7 sessions × expected (frozen) vs actual → MATCH/DIVERGENCE; zero empty cells.
- `manifest.sha256` — sha256 of every file in this pack (built last).

## How to verify offline

```bash
git clone https://github.com/igor-vii/Argus-Agent-Test-Lab && cd Argus-Agent-Test-Lab
cd attestations/evidence/0031-hookguard && sha256sum -c manifest.sha256
cd ../.. && node tools/registry/verify-registry.mjs            # main chain green
# recompute the offline table from the raw transcripts (no network):
python3 scripts/analyze_hookguard_0031.py   # or re-run the verdict logic on runs/*.json
# prereg hash of the frozen draft (must be 6dcf8cecf0f68cf89552b8deec962fbdc897a986df59aa8437113cbfef51110e):
git show b00570dd:sut-hookguard/freeze-0031.signed.json > /tmp/f.signed.json
node -e "import('./tools/registry/lib.mjs').then(async({canonical,sha256Hex})=>{const fs=await import('node:fs');const h=sha256Hex(canonical(JSON.parse(fs.readFileSync('/tmp/f.signed.json','utf8'))));console.log(h, h==='6dcf8cecf0f68cf89552b8deec962fbdc897a986df59aa8437113cbfef51110e'?'== POSTED PREREG HASH':'MISMATCH')})"
```
