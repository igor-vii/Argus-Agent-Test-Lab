# Inngest idempotency conformance battery — harness, evidence, results

Run #2 (canonical, 2026-10-26T20:24:53Z). Run #1 (2026-10-26T19:33Z) produced
identical verdicts; its raw evidence was lost to a lab environment reset.
13 pre-registered probes across two phases: static in-process (@inngest/test)
and dynamic end-to-end (dev server + crash-safe external effect ledger).
Headline: 0 FAIL / 5 PASS / 8 OBSERVED — honest-posture vendor verified at
runtime level. Two DX findings in the vendor's own test harness are filed as
inngest/inngest#5091.

## Layout

- `harness/` — the battery itself.
  - `app.mjs` — express + inngest/express serve; one function `i5-battery`
    (retries: 3, trigger `lab/i5`); crash-safe on-disk "payment provider"
    (`charges.json` ledger, fs-append `journal.jsonl`). **Probe rules are
    pre-registered in the file header — fixed before the run.**
  - `orchestrate.mjs` — driver: health → sync → reset evidence → probes →
    verdicts → results JSON.
  - `supervise-app.sh` — orchestrator model: restarts the app ~0.4s after
    `process.exit` (models the platform restarting a crashed worker).
  - `start-lab.sh` / `stop-lab.sh` — `inngest dev --no-discovery -u
    http://127.0.0.1:3010/api/inngest` (dev server on :8288, app on :3010).
  - `finalize-extra.mjs` — addendum probes p4c/p4d + p3 refinement.
- `evidence/` — raw run artifacts (app-side ledger `charges.json`, step
  timeline `journal.jsonl`, app stdout `app.log` incl. the
  AUTOMATIC_PARALLEL_INDEXING warning block, dev server log `dev.log`).
- `inngest-i5-results.json` — dynamic phase results + addendum (p3
  refinement, extra probes, doc anchors, backoff note).
- `inngest-h1-results.json` — static phase results (5 probes via
  @inngest/test).
- `testengine-repro.mjs` — minimal repro of the two @inngest/test DX findings
  (S1 sequential / S2 parallel / S3 injection). Run:
  `npm i inngest@4.26.0 @inngest/test@1.0.0 && node testengine-repro.mjs`.

## Reproduce

Node >= 20 (run #2 used v24.21.0). `npm i inngest@4.26.0 express@5.3.0
@inngest/test@1.0.0` + `inngest-cli@1.49.0` on PATH; then `./harness/start-lab.sh`,
`node harness/orchestrate.mjs`, `node harness/finalize-extra.mjs`,
`./harness/stop-lab.sh`. The provider ledger resets per probe; charges are
append-only within a probe (crash-safe by design — that is the measured
quantity).

## Scope

Single-node dev server; idempotency claim surface per vendor docs
(methodology anchored to the vendor's own "Verify the behavior" checklist).
Multi-node/cloud dedup semantics, flow control, timers/cron, retry-exhaustion
terminal states, and payment-rail scenarios are out of scope for this cycle.
A seal attests run validity and findings completeness — not bug-freeness.
