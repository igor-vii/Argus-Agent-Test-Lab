# Evidence pack — 0032 fiangshi census-receipt anchoring (freeze-0032)

Pre-registered $0.00 anchoring demo of fiangshi census receipts for the two live
x402 sellers from Aceop-001/fiangshi#1 (`api.cleave.fi/x402/gas`,
`api.bitrefill.com/x402/gift-cards/search`), executed 2026-11-24T18:15:36Z..18:15:41Z (~6 s wall),
after the freeze was committed (`71a577b0`) and the prereg hash was posted to fiangshi#1
(comment 7140252892, before the first live GET). Budget: $0.00 — no paid x402 calls, no
keys, no settlements; the live API was touched only for one `GET /v1/index.json` and the
nine per-receipt verify/receipt/receipts routes (10 GETs total, 0 retries).

## What ran

`python3 sut-fiangshi-census/census_checker.py --repo <fiangshi@1d19e408> --out <pack>
--prereg-file sut-fiangshi-census/freeze-0032.signed.json --prereg-hash ca3858e0…926e896a`
(checker sha256 `53e4dd6684c0f9d886b59492e71f11d1fb1ba1faa8952602beebe0294ce230a8`,
committed pre-run per RUNBOOK P1). Этап 0 checks all MATCH: repo HEAD == pin `1d19e408…`,
probe present, tsx from the pin's devDeps (`npm ci`, 54 packages), prereg hash == posted
(canonical-json mode, 0031 discipline), `verify-registry` green (32 records, chain head
`27f2f614…`) before the run.

- **Offline rebuild, twice at pinned clocks** (no wall-clock dependence): the probe
  (`npx tsx argus-fiangshi-probe.ts`, imports `src/census.ts`, `src/core/receipt.ts`,
  `src/core/canonical.ts` at the pin) ran at `FIANGSHI_NOW=2026-11-24T14:00:00Z`
  (context A, after the 24 Nov refresh collection) and `FIANGSHI_NOW=2026-11-24T12:00:00Z`
  (context B, after the 72 h limit, before the refresh collection).
- **Independent receipt-hash recompute** (C1): sha256 over the canonical JSON of each
  pinned receipt minus `receipt_hash`, canonicalized by the checker's own Python
  canonicalizer (recursively sorted keys, compact separators, UTF-8) — not fiangshi's code.
- **Live evidence rows** (never affect the verdict): one index snapshot + the three pinned
  receipts on `/v1/verify?id=`, `/v1/receipt/<id>`, `/v1/receipts/<id>`.

## Result

**11 MATCH, 0 DIVERGENCE of 11 judged rows (A1–A4, B1–B4, C1–C3) → verdict: SEAL.**

- **Context A** (`FIANGSHI_NOW=14:00Z`): bands exactly {ALLOW 105, REVIEW 1293, BLOCK 525};
  Bitrefill fresh ALLOW under R3 (`data_age_hours` 0.9, no cap); cleave BLOCK stale (371 h)
  under R1; R1 chain 1 pos 124, R2 chain 2 pos 1073, R3 chain 0 pos 1073 — all three
  `verifyReceipt` ok, chain walk ok on chains 0/1/2.
- **Context B** (`FIANGSHI_NOW=12:00Z`): bands exactly {ALLOW 0, REVIEW 1402, BLOCK 521};
  Bitrefill capped to REVIEW (`band_cap {reason: data_stale, age_hours 104.2, limit_hours 72}`)
  under R2; R2 present (chain 0, pos 1073), **R3 absent** — issued after the pinned now;
  absence recorded as the expected result.
- **C1–C3**: all three pinned receipt ids reproduce under the checker's own canonicalizer;
  `prev_hash` pins verbatim (2465f1ab…, f72b3f02…, f64bd4bb…); fiangshi's `verifyChain`
  returns ok with zero errors on every affected chain.
- **L1 (evidence)**: one `GET /v1/index.json` — status 200, snapshot fingerprint
  `c7294b54c091310c356ca842194adc83a30c7f64af43f1dd6d9538ff4a21094f` (one-time fingerprint,
  not a reproducibility claim); parsed bands {BLOCK 525, REVIEW 1293, ALLOW 105} match the
  frozen context A; Bitrefill row fresh ALLOW under R3 (`data_age_hours` 4.6), cleave row
  BLOCK stale (374.7 h) under R1. Observed as-is: the snapshot's vendor `served_at` field
  reads 2026-11-24T17:40:23.736Z while the pack stamp is 18:15:36Z (~35 min behind the
  local UTC clock); recorded, not adjudicated — L rows are evidence-only.
- **L2 (evidence)**: all nine routes return **404** — the durable receipt store is not
  switched on yet (`store_total: null`, as the vendor disclosed on 24 Nov). Recorded
  DOCUMENTED either way; this redeploy gap is exactly what the anchored subset closes:
  the three receipt bytes are now fixed and re-derivable offline from git history at the
  pinned commit.

## Honest scope

A seal here proves the three receipts existed at commit `1d19e408…` and that their
canonical bytes are fixed and re-derivable offline from git history. It says nothing about
fiangshi's internal API ledger beyond the anchored bytes; the recorded claim is about
fiangshi's judgment, recomputable by anyone holding the receipt JSON. fiangshi stays
advisory: no signing key added, no new call in its request path.

## Files

`runs/20261124T181536Z/` — one run, one UTC-stamped directory:
`expected_table.json` (the checker's full matrix — the run's judgment over the frozen
column), `probe_A.json` / `probe_B.json` (offline rebuild transcripts), `receipts/`
(three pinned receipt objects, written by the probe from the offline rebuild),
`index_snapshot.json` (verbatim L1 bytes, 1,001,662 bytes), `L1_index_summary.json`,
`L2_R{1,2,3}_{verify,receipt,receipts}.json` (verbatim live transcripts), `run_meta.json`
(host, tsx source, prereg hash), `manifest.sha256`. Pack-level `manifest.sha256` covers
README, run.json and every run-pack file.
