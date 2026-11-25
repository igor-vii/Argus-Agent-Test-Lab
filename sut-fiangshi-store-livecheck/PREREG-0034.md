# Prereg freeze 0034 — fiangshi durable-receipt-store live-check ($0.00)

**Subject:** the three live-check receipts in fiangshi's durable receipt store (`github.com/Aceop-001/fiangshi-receipts`) — **P1** `34160e4a…` (dry-run check, Bitrefill gift-card search, ALLOW), **P2** `682a85d7…` (the first live settled check, tx `0x90b91981…9696` on Base, $0.05), **P3** `dc6d6a6f…` (dry-run check, cleave gas, BLOCK via `null_payee`) — anchored as claims in the Argus registry. This run closes the L2 redeploy-gap row of record 0032 (recorded `404/DOCUMENTED` there): the store is now live and the same receipts must resolve from the API and re-verify from the store bytes alone.

**Demo shape (as agreed in the thread):** no paid x402 calls by us, no keys, no settlements initiated by us, $0.00. The settled tx in P2 is the vendor's own demo payment, recorded as the receipt's own claim (hash-anchored, not adjudicated onchain in this run). The live API (`api.fiangshi.xyz`, per the vendor's pinning instruction — the static `fiangshi.xyz` copy is a build snapshot by design) is touched only for seven free GETs: `/health` ×1, `/v1/receipt/<id>` ×3, `/v1/verify?id=` ×3. The store is read via a git fetch of `Aceop-001/fiangshi-receipts`. No repo rebuild, no `npm ci`, no tsx — the receipts are judged directly as store bytes.

## Frozen inputs (discovery reads before the freeze, disclosed; they set the pins, not the verdicts)

- **Store pin:** `github.com/Aceop-001/fiangshi-receipts` @ `75defddbe49a3cf12406162bc1de58139b0ed052` (committed 2026-11-25T04:57:40Z, "head dc6d6a6f52b6 (#3)"). Layout: `receipts/<2-char-shard>/<receipt_hash>.json`, one file per receipt, `receipts/HEAD.json` names the newest.
- **HEAD.json @ freeze** (file sha256 `d04f1e99f4d8830f94223db437cf6e9bf1b35549858f8749df35e2365f73ba8d`): `receipt_hash` `dc6d6a6f…`, `chain_id` `e701244c…`, `started_at` `2026-11-25T03:50:17.263Z`, `count` 3, `paid` 2, `settled` 1, `usd_settled` 0.05.
- **Receipt pins** (id = `receipt_hash` = filename stem, verbatim):
  - **P1** `34160e4a12d1afe20c66e3a150a076701310eafea0ca44bb6ecf15a5ae0ca8bf` — `api.bitrefill.com/x402/gift-cards/search`, payee `0x480cd46e6fade651a0437deadda53d5c8e7d846a`, band ALLOW (score 88.33), `settlement` "dry-run", `fee_usd` 0.05, `checked_at` 2026-11-25T03:50:17.263Z, `prev_hash` "genesis", `chain_id` `e701244c51dd854cb1baebfa724822316f0501cbc57a1de8ee958cb43d556b32`, `chain` eip155:8453, snapshot `53929dbf…`, `as_of` 2026-11-24T13:05:02.148Z; raw file sha256 `c88a936fe966b752ac9176106f423012949a613349ce419331cbcd177044d532`
  - **P2** `682a85d7f78c9325526d5843df5a670928988e078c05889c0bbd9834842ef635` — same seller/payee, band ALLOW, `settlement` "settled", `tx_hash` `0x90b919810c9c3a3b6707a1847261d00609018ca42bd15ff9a2fcd10867af9696`, `chain` eip155:8453 (Base), `fee_usd` 0.05, `checked_at` 2026-11-25T04:15:27.363Z, `prev_hash` `34160e4a…` (= P1 — the cross-redeploy link the vendor announced), same `chain_id`; raw file sha256 `9f7a6295e6a580887c22cbedfccc76071d8fc07b96498006d417d7311a75c37f`
  - **P3** `dc6d6a6f52b6763388d9271f7e470fff131d73c05524ccb26548774a8e312a98` — `api.cleave.fi/x402/gas`, payee `0x0000000000000000000000000000000000000000`, band BLOCK (score 0, vow `null_payee`), `settlement` "dry-run", `checked_at` 2026-11-25T04:57:38.855Z, `prev_hash` `682a85d7…` (= P2), same `chain_id`; raw file sha256 `c677ad019f71db4473518197f7e147a21c6c4926cbdf80f929cee39ffe81d937`
- **API serving pin:** `Aceop-001/fiangshi` main @ `9f4cca7f712e8ff779165d434d2cf7517bbf570a` at freeze (informational — no rebuild in this run; the vendor's scheduled ALLOW-only refresh may move main; live-check receipts reference checks, not census collections).
- **Canonicalization** (same discipline as 0032, verified at freeze on all three pins): sorted object keys, compact separators, UTF-8, **null kept** (JS `null` is not `undefined`); `receipt_hash` = sha256 over every field **except `receipt_hash` itself**; recompute over the canonical `receipt` object, not the HTTP wrapper (per the vendor's answer of 24 Nov, comment 7136711046).
- **Clocks:** sandbox UTC stamp, the Cloudflare `Date` header of `api.fiangshi.xyz`, and the vendor's own `served_at`/`census_at` fields are all recorded at freeze and at run; offsets are **disclosed facts, never adjudicated** (the ~35 min lag seen in 0032 was the static `fiangshi.xyz` copy; the vendor states `api.fiangshi.xyz` is ≤ ~1 min behind).

## Frozen expected rows (judged; re-observed after the freeze is published)

| Row | Expected |
|---|---|
| S1 | store `receipts/HEAD.json` re-pulled: parses; its `receipt_hash` names a receipt whose `prev_hash` walk covers the frozen segment P1→P2→P3 in order (append-only tolerance: the store may have grown, HEAD may name a newer receipt); `count` == number of receipt files re-pulled; `started_at` == P1.checked_at `2026-11-25T03:50:17.263Z`; `usd_settled` == sum of `fee_usd` over receipts with `settlement` "settled" (0.05 at freeze) |
| S2 | the three pinned store files re-pulled raw: sha256 == the frozen file hashes (P1 `c88a936f…`, P2 `9f7a6295…`, P3 `c677ad01…`) — byte-identical |
| S3 | independent recompute ×3: sha256 over the canonical JSON of each receipt minus `receipt_hash`, recomputed by the checker's own Python canonicalizer (not fiangshi's code), == `receipt_hash` field == filename stem == pinned id |
| S4 | chain links verbatim: P1.`prev_hash` == "genesis"; P2.`prev_hash` == `34160e4a…`; P3.`prev_hash` == `682a85d7…`; `chain_id` `e701244c…` identical on all three — the P2→P1 linkage across the vendor's redeploy holds |
| S5 | the 0032 L2 gap closes: `GET api.fiangshi.xyz/v1/receipt/<id>` for each pinned id → status 200, and the wrapper's `receipt` object canonicalizes to bytes identical to the store receipt's canonical form (recomputes to the pinned id) |
| S6 | settlement pins verbatim on P2: `settlement` "settled", `tx_hash` `0x90b919810c9c3a3b6707a1847261d00609018ca42bd15ff9a2fcd10867af9696`, `chain` "eip155:8453", `fee_usd` 0.05; P1 and P3 `settlement` "dry-run" — recorded as the receipt's own claim, fixed by hash anchoring |

**Live evidence (evidence rows; never affect the verdict):**

| Row | Expected |
|---|---|
| L1 | one `GET /health`: status, `receipts_stored.store_total` (≥ 3), `census_at`, recorded verbatim; Cloudflare `Date` header minus sandbox UTC recorded as a disclosed offset (vendor claim: ≤ ~1 min) |
| L2 | `GET /v1/verify?id=` ×3: recorded **DOCUMENTED either way** (corroboration only; `chain_linkage` "verified" observed at freeze) |
| L3 | store head sha at run (git fetch): recorded as-is; if it advanced past `75defdd…`, the frozen segment must remain byte-identical (that stability is judged by S2) |

## Verdict rule

Seal iff S1–S6 all match as frozen. Any divergence → finding, recorded as-is; the record is complete either way. Corrections are separate records; sealed originals are never edited. L rows never affect the verdict.

## What this anchors, honestly

A seal here proves the three live-check receipts existed at freeze time with fixed canonical bytes; that the store chain links P2→P1 across fiangshi's redeploy (the vendor's ledger-resets-on-redeploy weakness, now closed for this subset); and that the API serves the same bytes the store commits. It says nothing about fiangshi's internal ledger beyond the anchored bytes, and the settlement tx is recorded as the receipt's own claim (not verified onchain in this run — no RPC in scope). The census receipts R1/R2/R3 from record 0032 are out of scope here: the store holds live-check receipts; census receipts stay anchored offline at commit `1d19e408`. fiangshi stays advisory — no signing key, no new call in its request path.

*Freeze bookkeeping: the freeze commit sha and the prereg hash (canonical sha256 of the signed freeze wrapper `freeze-0034.signed.json` in this directory, per the 0031 discipline, taken over UTF-8 text — `ensure_ascii=False` in the python one-liner) are published in the thread prereg post **before the first judged live GET** and recorded in the run pack and in record 0034's `run_pack_commits`. Row unit is `verdict` for every row above; the checker's full matrix output (`expected_table.json`) is the run's judgment over this frozen column.*
