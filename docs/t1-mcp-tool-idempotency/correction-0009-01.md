# CORRECTION-0009-01 — severity recalibration and wording correction for seal #0009

- **Record (chain):** `argus-seal-0009` (seq 0009) — *this dossier amends its
  public interpretation; the sealed record itself is unchanged.*
- **Trigger:** maintainer review of public materials (one-pager, landing page).
- **Date:** 2026-10-29.
- **Status:** adopted and applied to the landing page and one-pager v3 on
  2026-10-29.
- **Immutability:** this file is hash-pinned as evidence of registry record
  #0010 (`correction`) and must not be edited after signing. Later corrections
  get their own files.

## 1. Severity recalibration (maintainer's assessment, adopted)

| Finding | Was | Now | Rationale |
|---|---|---|---|
| F3 — cross-instance race: claim loser resets the winner's LIVE pending row | high | **high** (unchanged) | Can silently invalidate another instance's in-flight work; root cause is the missing liveness check. |
| F2 — crash after commit: dead holder's pending row unconditionally reset by the next caller | high | **medium** | Shares F3's root cause (missing liveness check) and additionally requires a crash inside a narrow window. |
| F1 — lost response after commit: retry re-fires the committed side effect | high | **low** | Documented at-least-once limit: "failed executions are never cached" in the project README; the v0.2.0 default still allows it and `isRetryable` is opt-in. |

The severities are maintained in line with the maintainer's own
characterization of the findings.

## 2. Wording correction (adopted)

The library is **generic**, not payment-specific. The accurate description of
the exposed behavior is **"silent duplicate execution of committed side
effects"** — which becomes a double charge only when the wrapped tool takes
payments. The earlier public phrasing "silent double-charge" / "MCP
payment-tool lib" is superseded everywhere (landing page, one-pager, public
posts).

## 3. Related maintainer action

The old "exactly-once" tagline has been removed by the maintainer everywhere,
including the repository description of `tripl3tr3s/mcp-tool-idempotency`.

## 4. Scope of the correction

- The sealed dossier text of #0009
  (`external-verification-mcp-tool-idempotency-v0.2.0.md`) is **unchanged**;
  seals are final at issuance.
- This entry is the record of record: future references to the case should
  cite seal #0009 **plus** CORRECTION-0009-01 (registry record #0010).
- The human-readable disclosure page
  (`site/public/dossiers/registry.md`) mirrors this correction; the signed
  chain record remains the authoritative source.
