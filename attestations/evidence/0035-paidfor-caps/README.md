Paidfor client 0.8.0 cap battery, Phase A. Run id: argus-0035-paidfor-0.8.0-caps,run_ts 2026-11-25T13:27:43.148Z. Payer burner 0x92cfBE27b74900B81f7eC037CC620E8D9E1e9559(0 USDC on Base USDC). Endpoints: api.exa.ai/search and api.exa.ai/contents (P1/P2,same seller pay-to). Budget: 18 Phase A calls + 5 disclosed prep probes = 23 networkcalls, 0 paid, 0 signed, 0 retries, $0.00.

Verdicts (frozen expectations in freeze-0035.prereg.json, arbiter = outcome code + paid=false):

C1 per-call control MATCH refused_max_per_call, paid=false
S1 per-day cap MATCH refused_max_per_day, paid=false
S2 per-seller per-day cap MATCH refused_max_per_seller_per_day, paid=false
S4 approveAbove MATCH needs_approval, paid=false
S6 frozen switch MATCH frozen, paid=false
S7 nonce from intent MATCH package deriveNonce == independent HMAC-SHA256 recompute on all frozen vectors
S5 first-payment cap DIVERGENCE observed insufficient_funds, paid=false; exa is an indexed seller, so maxFirstPaymentUsd does not apply and the balance gate fired first. Harness design gap (no stranger seller), no 0.8.0 defect.
S3 pay-to refuse mode not_observed with a 0-USDC wallet the balance gate precedes the pay-to check; recorded honestly per freeze
S9 telemetry posture evidence-only no index row attributable to Phase A; refusal rows send no index row (README of 0.8.0)
Observed 0.8.0 gate order returned to the vendor as data:caps (per-call / per-day / per-seller / first-payment / approveAbove / frozen) fireBEFORE the balance read; the pay-to check fires AFTER it.

Files: run.json (run card), runs/L1-liveness.json (unpaid 402 probe per endpoint),runs/summary.json (battery summary), runs/rows/*.json (verbatim raw rows, C1 + S1..S9),manifest.sha256 (pins of everything above plus this README).

Verify: sha256sum -c manifest.sha256 — all lines OK.

Provenance note: the original pack README was lost in transit during the stand-to-repotransfer (original sha256 pinned in the record notes). This README was reconstructedpost-run from the pack contents; it is content-equivalent, not byte-identical, and theamendment is disclosed in the record notes. Raw run data was not touched: run.json,runs/L1-liveness.json, runs/summary.json and every row file remain byte-verifiedagainst their original pins.