# Evidence pack — 0034 fiangshi durable-receipt-store live-check (freeze-0034)

Pre-registered $0.00 live-check of the three receipts in fiangshi's durable receipt
store (`github.com/Aceop-001/fiangshi-receipts`) from Aceop-001/fiangshi#1 —
P1 `34160e4a…` (dry-run, Bitrefill gift-card search, ALLOW), P2 `682a85d7…` (first live
settled check, tx `0x90b91981…9696` on Base, $0.05), P3 `dc6d6a6f…` (dry-run, cleave gas,
BLOCK via `null_payee`) — executed 2026-11-25T10:36:36Z..10:36:44Z (~8 s wall), after the
freeze was committed (`aabfe82b`) and the prereg hash was posted to fiangshi#1
(comment 7159924452 at 10:36:24Z, before the first judged live GET). This run closes the
L2 redeploy-gap row of record 0032 (recorded 404/DOCUMENTED there): the store is live and
the receipts must resolve from the API and re-verify from store bytes alone.

## What ran

`python3 sut-fiangshi-store-livecheck/store_checker.py --out <pack>
--prereg-file sut-fiangshi-store-livecheck/freeze-0034.signed.json --prereg-hash 2c50ef0c…d7655`
(checker sha256 `be9d9f3b4522e3935a174ba9225f978dc13b95f8d38649bce248afc1802d00c4`,
committed pre-run per RUNBOOK P1). Этап 0 checks all MATCH: prereg hash == posted
(canonical-json mode, 0031 discipline), clocks recorded.

- **Store re-pull at run time**: `git clone` of `Aceop-001/fiangshi-receipts` — head
  `75defddbe49a3cf12406162bc1de58139b0ed052`, unchanged since the freeze. The three pinned
  receipt files and `HEAD.json` are re-read from that fresh clone (copies in this pack:
  `store_*.json`), never reused from freeze-time discovery.
- **Independent receipt-hash recompute** (S3): sha256 over the canonical JSON of each
  receipt minus `receipt_hash`, canonicalized by the checker's own Python canonicalizer
  (recursively sorted keys, compact separators, UTF-8, **null kept**) — not fiangshi's code.
- **API cross-check** (S5, the 0032 gap): `GET api.fiangshi.xyz/v1/receipt/<id>` ×3, the
  wrapper's `receipt` object canonicalized and compared byte-wise to the store receipt's
  canonical form; `/v1/verify?id=` ×3 recorded as corroboration (evidence-only L2).
- **Clock disclosure**: the api `Date` header runs 0.75–0.81 s behind the sandbox UTC
  clock — recorded as-is, never adjudicated (vendor claim ≤ ~1 min; the ~35 min lag of
  record 0032 was the static `fiangshi.xyz` copy).

**Disclosed deviation from the freeze prose**: the freeze says "seven free GETs"; the
checker made **eight** (two `GET /health` — one in Этап 0 to pin the clock, one for L1;
3× `/v1/receipt/<id>`, 3× `/v1/verify?id=`). Both /health calls are free public endpoints,
0 retries; the judged rows S1–S6 do not depend on any /health body. Recorded as-is.

## Result

**6 MATCH, 0 DIVERGENCE of the 6 judged rows (S1–S6) → verdict: SEAL.**

- S1: `HEAD.json` consistent — `receipt_hash` `dc6d6a6f…`, walk covers the frozen segment
  P1→P2→P3 in order, count 3 == files, `started_at` `2026-11-25T03:50:17.263Z`,
  `usd_settled` 0.05 == sum of settled fees.
- S2: all three pinned files byte-identical (raw sha256 == frozen pins).
- S3: all three ids reproduce under the checker's own canonicalizer (recompute ==
  `receipt_hash` == filename stem).
- S4: `prev_hash` links verbatim (`genesis → 34160e4a → 682a85d7 → dc6d6a6f`), `chain_id`
  `e701244c…` on all three — the P2→P1 link across the vendor's redeploy holds.
- S5: all three `/v1/receipt/<id>` → 200, wrapper receipt canonical-equal to store bytes,
  recomputes to the pinned id — the 0032 L2 gap is closed.
- S6: settlement pins verbatim on P2 (settled, tx `0x90b91981…9696`, eip155:8453,
  fee_usd 0.05); P1/P3 dry-run — recorded as the receipt's own claim, hash-anchored.

Evidence-only: L1 `/health` 200 (store_total 3, census 8488, offset 0.81 s), L2 all three
`/v1/verify` → `valid: true`, `chain_linkage: verified`, L3 store head `75defdd…` unchanged.

## Files

`runs/20261125T103636Z/` — the full run pack (15 files, sha256 of each in
`runs/20261125T103636Z/manifest.sha256`): `expected_table.json` (the checker's judgment
over the frozen column), `run_meta.json`, the re-pulled store bytes (`store_HEAD.json`,
`store_34160e4a.json`, `store_682a85d7.json`, `store_dc6d6a6f.json`), the API transcripts
(`L5_receipt_*.json` ×3, `L2_verify_*.json` ×3), `L1_health.json`, `L3_store_head.json`.
`run.json` — machine-readable run summary. Budget: $0.00 (no paid x402 calls, no keys, no
settlements initiated by the lab, no npm ci, no tsx).
