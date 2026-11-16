# Argus result contract — v0

The data contract between the Argus engine (hosted console / CI runner) and
every consumer of a run result: humans (stdout), automation (GitHub Action in
CI mode), and archives. Versioned in the public repository so both sides can
cite a stable contract; material changes ship as ordinary commits.

Status: **contract, engine-side implementation pending** (the engine is the
private product repo; this document is the interface it must satisfy).

## Two surfaces, one rule

- `stdout` is for **humans only**. One line, final:
  `verdict: FAIL (3/14 failed: W5, W2, W3) — details: argus-result.json`
  Nothing else on stdout is contractual; machines must not parse it.
- `--out <path>` is for **machines**. Writes the JSON object below to `<path>`
  (also usable as `-o`). Exit code and `--out` are the only machine interfaces.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | aggregate verdict PASS |
| 1 | aggregate verdict FAIL |
| 2 | aggregate verdict UNKNOWN (no FAIL, at least one UNKNOWN/HOLD) |
| 3 | result object violates this contract (schema/consistency failure; maps to failure) |

Exit codes are **step-level signals only**. Check conclusions (green/yellow/
red) are a different layer and MUST be set via the Checks API — see the
mapping section below.

## Result JSON (`argus.result.v0`)

```json
{
  "schema": "argus.result.v0",
  "mode": "simulation | live",
  "seed": "sha256-derived string, or null for live runs",
  "agent": { "id": "engine-declared id", "endpoint": "https://... | null" },
  "battery": { "id": "engine-declared stable id", "scenario_count": 14, "version": "engine-declared" },
  "run": { "id": "engine run id", "started_at": "ISO-8601", "finished_at": "ISO-8601", "duration_ms": 0 },
  "scenarios": [
    {
      "id": "W1",
      "title": "engine-declared scenario name",
      "verdict": "PASS | FAIL | UNKNOWN | HOLD | OBSERVED",
      "evidence": [{ "kind": "file", "path": "...", "sha256": "..." }],
      "notes": "one line, optional"
    }
  ],
  "summary": { "pass": 0, "fail": 0, "unknown": 0 },
  "verdict": "PASS | FAIL | UNKNOWN",
  "advisory": ["non-blocking observations; never change the verdict"],
  "disclaimer": "required when mode = simulation, see below"
}
```

Rollup rule: any FAIL → verdict FAIL; else any UNKNOWN/HOLD → UNKNOWN; else
PASS. Producers MUST NOT invent other aggregate values; consumers MUST treat
unknown strings as UNKNOWN (fail-closed reading).

## Simulation honesty (non-negotiable)

- When `mode` is `"simulation"`, the object MUST carry a `disclaimer` string:
  *"Simulation replays x402 scenario variants per the protocol spec without
  executing the agent under test. Results may vary across runs for the same
  agent — each run samples the scenario space. Not live traffic; not citable
  as evidence; not an audit or compliance attestation."*
- `seed`: simulation runs are seed-driven. CI seeds derive deterministically
  from the commit: `sha256("argus.seed.v1:" + commit_sha + ":" + battery.id)`.
  One commit → one deterministic verdict set; a re-run of the same commit is
  idempotent, so "rerun until green" is impossible. Variance across commits is
  intentional (it measures agent drift, not engine noise). Ad-hoc console
  simulation uses a fresh random seed per run and reports it.
- Determinism is an **engine obligation**, not a property of the contract.
  The engine MUST derive **all** simulation randomness from the reported
  seed — scenario selection, variant sampling, payload jitter, simulated
  timing, iteration order. Any entropy source outside the seed (unsanitized
  `Math.random`, wall-clock durations, hash-map traversal order, unseeded
  library RNGs) breaks idempotency. Re-running an identical commit (same
  seed) MUST yield **byte-identical `scenarios[]`** — verdicts, findings and
  order; only `run` timestamps may differ. CI consumers are entitled to
  assert this on a duplicate run.
- Simulation results are **never citable as evidence**: registry records,
  seals and attestation tooling accept real (`mode: "live"`) runs only. The
  `mode` field exists so every artifact self-identifies without context.
- A finding counts as **fixed** only after two consecutive runs (same seed for
  CI, comparable configuration otherwise) without it. Retention/email flows
  must not claim "fixed" from a single passing run.

## GitHub Action mapping (consumer side, implemented later)

Exit codes and check conclusions are different layers. An Actions step can
only end green (0) or red (non-zero) — there is no neutral exit code. The
neutral conclusion for UNKNOWN is therefore NOT expressible as an exit code:

| verdict | step exit | check conclusion (via Checks API) |
| --- | --- | --- |
| PASS | 0 | `success` (green) |
| UNKNOWN | 0 | `neutral` (yellow) + annotation |
| FAIL | 1 | `failure` (red) + annotations per FAIL scenario |
| invalid (exit 3) | 1 | `failure` (red) + "invalid result object" annotation |

The Action MUST create its check run through the **Checks API** with the
conclusion above (`conclusion: "neutral"` for UNKNOWN); the workflow step
exits 0 for PASS and UNKNOWN so the job itself does not fail — the signal
lives in the check conclusion, not in the step result. Naive mappings are
prohibited: UNKNOWN → red via a non-zero exit (false merge blocking) or
UNKNOWN → green with no check run (signal lost).

`advisory` entries become annotations only. Enforcement rollout: two–four
weeks of advisory-only (yellow) with a `simulated verdict` note in the PR
comment before any branch protection relies on the check.
