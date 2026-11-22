# 0028-evidence-lens-run — first classification run of the frozen x402 evidence lens

## What this is

The run artifacts of the pre-registered classification procedure frozen at
commit `2991a080c7a637f578e0837411aa5dc38c4eed19` (draft `tools/registry/drafts/0028-x402-evidence-lens.seal.draft.json`). Platform: `sandbox-stand`
(RUNBOOK 1.2) — records-only checker `sut-x402-evidence-lens/classify.mjs`,
no engine, no live SUT; every input pin recomputed before use. The checker
holds only the frozen records: no wallet_ops, no transport logs, no operator
word. Timing is never consulted; the record decides (RUNBOOK 6.5: the
classification is derived at run time and is not precomputed anywhere).

## Results (window 2026-11-22T18:50:41Z .. 2026-11-22T18:50:41Z, UTC)

| leg | dataset / target | derived | verdict |
|---|---|---|---|
| A — self-run | sealed attempt rows of #0021 (argus-seal-0021) | delivery-retry x4 (R1-1..3, R4-1), separate-purchase x8 (R2a x2, R2b x3, R3 x3), invariant reproduced | **reproduced — no divergence** (13 sealed rows, 12 sealed PASS) |
| B — dataset[0] | raen-ledger-before (64 settled rows, 6 adjacent pairs 980..4204 ms recomputed) | **absent x6** | matches registered expectation (draft datasets[0].note) |
| C — dataset[1] | zambo-a5-lost-response (C4 production record, x402#4198 2026-11-22T17:10Z) | **absent** | matches registered expectation (draft datasets[1].note) |

- Leg A: the frozen classification, recomputed offline against the sealed rows,
  reproduces the sealed verdicts of #0021 — zero divergences. The
  `self_run.procedure` requirement of the draft is satisfied.
- Leg B: all six adjacent near-duplicate pairs classify `absent` — the records
  carry no idempotency key and no intent digest, and payer/service/route/amount
  grouping cannot distinguish a delivery retry from a separate purchase. The
  registered expectation is confirmed by derivation, not by assertion.
- Leg C: the posted record set is a single hash-bound journal entry
  (commitment recomputed: match) with no payment attempt tuple and no pair of
  submissions — `absent` on the C4 classification. The claim "effect count was
  one before and one after, no second execution" is not recomputable from this
  record alone; fuller leg records would enter as a new pinned dataset per the
  frozen extension rule.

Total divergences across all legs: **0**.

## Files

- `run.json` — RUNBOOK 3.3 run record (prereg pin = frozen draft sha256 at the freeze commit; platform, host, window, argv).
- `runs/selfrun-0021.jsonl` + `.summary` — leg A rows (attempt unit) and summary.
- `runs/raen-before.jsonl` + `.summary` — leg B pair rows (inputs for recomputation) and summary.
- `runs/zambo-a5.jsonl` + `.summary` — leg C record-shape classification and summary.
- `runs/classify.stand.json` — platform composition (RUNBOOK 3.4).
- `runs/classify.console.log` — raw console output (untouched).
- `manifest.sha256` — built last; hashes every file above.

## How to recompute

```bash
git clone https://github.com/igor-vii/Argus-Agent-Test-Lab && cd Argus-Agent-Test-Lab
git checkout 2991a080c7a637f578e0837411aa5dc38c4eed19          # the freeze commit (rules + datasets + checker)
node tools/registry/verify-registry.mjs
node sut-x402-evidence-lens/classify.mjs --out /tmp/recompute --head 2991a080c7a637f578e0837411aa5dc38c4eed19
sha256sum -c attestations/evidence/0028-evidence-lens-run/manifest.sha256
```

The derived classes must match `runs/*.jsonl.summary` byte for byte; any
divergence is a finding against this pack (RUNBOOK 3.4 immutability rule).

## Immutability

After this pack is pinned by the seal record, files here are never edited; a
mistake means a new artifact plus a correction/note (RUNBOOK 3.4).
