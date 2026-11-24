# Prereg freeze 0032 — fiangshi census-receipt anchoring demo ($0.00)

**Subject:** the two live sellers from this thread — `api.cleave.fi/x402/gas` and `api.bitrefill.com/x402/gift-cards/search` — anchored as fiangshi census receipts in the Argus registry, classified under the frozen procedure (record-0028 discipline: classification recomputes from the records alone).

**Demo shape (as agreed here):** no paid x402 calls, no keys, no settlements, $0.00. The live API is touched only for **one** `GET /v1/index.json` and the per-receipt verify routes (`GET /v1/verify?id=`, `GET /v1/receipt/<id>`). The receipt chain is rebuilt **offline from the pinned commit**; receipt hashes are recomputed **independently of fiangshi's code** by the checker's own canonicalizer (Python, not fiangshi's).

## Frozen inputs

- **fiangshi commit pin:** `1d19e408e8c324c5c8085b8b143cfb6399cb0161` (main at freeze time). The scheduled 36h ALLOW-ONLY refresh due 2026-11-26 01:04 UTC may move main afterwards — this run's offline rebuild uses the pinned commit only, and the served census is treated as a function of the commit **and** the pinned clock (`FIANGSHI_NOW`), never the wall clock.
- **Canonicalization** (per `src/core/canonical.ts` at the pin): `JSON.stringify` over recursively sorted object keys, `undefined` dropped, compact separators, UTF-8; `receipt_hash` = sha256 over every field **except `receipt_hash` itself**; recompute over the canonical `receipt` object, not the HTTP wrapper (per the vendor's answer of 24 Nov 2026).
- **Receipt pins** (id = `receipt_hash`, verbatim):
  - **R1** `api.cleave.fi/x402/gas` (payee `0x0000000000000000000000000000000000000000`, `null_payee` vow): `d2c68884841332834a1e0b203e2175c5e1e92de5d279344bd6504db6b5bf4ce0`, `prev_hash` `2465f1ab971520d4ea093fed171f59a6c859b0d5252c0f7571671f91b3482e98`, census 2026-11-09 (`checked_at` 02:57:19.701Z)
  - **R2** `api.bitrefill.com/x402/gift-cards/search` (payee `0x480cd46e6fade651a0437deadda53d5c8e7d846a`): `97b5dded4c5cff75d5b26377b659ef40c7620c45cf143fac27910fb8b1af7691`, `prev_hash` `f72b3f02eefba08eb33b4336fe48cdce2d3adac8d155c82e70024dccce861249`, census 2026-11-20 (`checked_at` 03:50:53.345Z)
  - **R3** same seller: `83d618ba5344776c16fd8b159ad7d6c177838db2057b7cad2c993c8a6a076819`, `prev_hash` `f64bd4bb6917a345190482787d3ba401453992551cf6f63a10ca2904cbea9f1c`, ALLOW-only refresh 2026-11-24 (`checked_at` 13:05:02.148Z)

## Frozen expected rows

**Rebuild context A — `FIANGSHI_NOW=2026-11-24T14:00:00Z`** (after the 24 Nov refresh collection):

| Row | Expected |
|---|---|
| A1 | bands exactly `{ALLOW: 105, REVIEW: 1293, BLOCK: 525}` |
| A2 | Bitrefill row: band `ALLOW`, `issued_band` `ALLOW`, `band_cap` `null`, `receipt_id` = R3, `data_age_hours` in [0.85, 0.95], `stale` `false` |
| A3 | cleave row: band `BLOCK`, `issued_band` `BLOCK`, `band_cap` `null`, `stale` `true`, `receipt_id` = R1 |
| A4 | R1 in chain 1 at pos 124; R2 in chain 2 at pos 1073; R3 in chain 0 at pos 1073; fiangshi `verifyReceipt` ok on all three; chain walk ok on chains 0, 1, 2 |

**Rebuild context B — `FIANGSHI_NOW=2026-11-24T12:00:00Z`** (after the 72h limit, before the refresh collection):

| Row | Expected |
|---|---|
| B1 | bands exactly `{ALLOW: 0, REVIEW: 1402, BLOCK: 521}` |
| B2 | Bitrefill row: band `REVIEW`, `issued_band` `ALLOW`, `band_cap` `{reason: "data_stale", age_hours in [104.0, 104.3], limit_hours: 72}`, `receipt_id` = R2 — the freshness case, reproducible offline |
| B3 | cleave row: band `BLOCK`, `band_cap` `null`, `stale` `true`, `receipt_id` = R1 |
| B4 | R2 present (chain 0, pos 1073); **R3 absent** — issued after the pinned now; absence is the expected result, recorded as such |

**Receipt integrity (independent of fiangshi's code):**

| Row | Expected |
|---|---|
| C1 | sha256 over the canonical JSON of each pinned receipt minus `receipt_hash`, recomputed by the checker's own canonicalizer (Python, not fiangshi's), equals the pinned id — for all three |
| C2 | `prev_hash` of R1/R2/R3 equals the pinned values verbatim |
| C3 | fiangshi's own `verifyChain` over each affected chain returns `ok` with zero errors |

**Live evidence (evidence rows; never affect the verdict):**

| Row | Expected |
|---|---|
| L1 | one `GET /v1/index.json`: byte sha256 recorded as a **one-time snapshot fingerprint** — explicitly not a reproducibility claim, since `served_at` and `data_age_hours` make the bytes move per request; parsed bands and both seller rows recorded verbatim |
| L2 | `GET /v1/verify?id=` and `GET /v1/receipt/<id>` for all three: recorded **DOCUMENTED either way** — `chain_linkage: verified` if the durable receipt store is live, 404 if not (the redeploy gap this run anchors closed) |

## Verdict rule

Seal iff A1–A4, B1–B4, C1–C3 all match as frozen. Any divergence → finding, recorded as-is; the record is complete either way. Corrections are separate records; sealed originals are never edited.

## What this anchors, honestly

A seal here proves the three receipts existed at commit `1d19e408…` and that their canonical bytes are fixed and re-derivable offline from git history — the census-receipt chain becomes third-party-verifiable for the anchored subset with no signing key and no change to fiangshi's request path. It says nothing about fiangshi's internal ledger beyond the anchored bytes: the recorded claim is about fiangshi's judgment, recomputable by anyone holding the receipt JSON. The vendor's constraint stands as written: fiangshi stays advisory.

*Freeze bookkeeping: the freeze commit sha, the prereg hash (canonical sha256 of the signed freeze wrapper `freeze-0032.signed.json` in this directory, per the 0031 discipline) and the L1 snapshot fingerprint are published in the thread prereg post **before the first live GET** and recorded in the run pack and in record 0032's `run_pack_commits`. Row unit is `verdict` for every row above; the checker's full matrix output (`expected_table.json`) is the run's judgment over this frozen column.*
