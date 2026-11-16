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
- Simulation results are **never citable as evidence**: registry records,
  seals and attestation tooling accept real (`mode: "live"`) runs only. The
  `mode` field exists so every artifact self-identifies without context.
- A finding counts as **fixed** only after two consecutive runs (same seed for
  CI, comparable configuration otherwise) without it. Retention/email flows
  must not claim "fixed" from a single passing run.

## GitHub Action mapping (consumer side, implemented later)

| verdict | check conclusion |
| --- | --- |
| PASS | success (green) |
| UNKNOWN | neutral (yellow) + annotation |
| FAIL | failure (red) + annotations per FAIL scenario |

`advisory` entries become annotations only. Enforcement rollout: two–four
weeks of advisory-only (yellow) with a `simulated verdict` note in the PR
comment before any branch protection relies on the check.
