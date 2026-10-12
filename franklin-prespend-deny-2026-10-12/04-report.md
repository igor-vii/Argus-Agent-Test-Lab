# TASK F1 — Franklin PreSpend Deny-Path Dynamic Test — Forensic Report
Date (UTC): 2026-10-12
Sandbox: Qwen Code sandbox, working tree /workspace
Recorded HEAD: e7bba2aa62cacaf2d2377826797e90ef00c0235c
Recorded branch: qwen-code-4bc672ac-3e10-4fb7-9c03-81492df799b6
Tree state at start: clean (single commit "docs: preserve Russian Argus-Secretariat report";
only new content = this results directory; no commits/push/PR/merge made)

## 1. What exactly was run
Only read-only verification commands (find/grep over filesystem and full git history,
`git log/status/branch/tag/stash`, `npm view franklin`, network-availability probe).
Franklin itself was NEVER run — see blocker below. No product source, dependency, or
existing artifact was modified.

## 2. What was actually observed
- None of the four required pre-existing artifacts exist anywhere in the sandbox:
  franklin-static-audit.md, franklin-install.log, franklin-build.log, SUBJECTS-MANIFEST.md
  (filesystem-wide search + entire git history: 0 hits; logs 01, 02).
- The repository contains zero references to "Franklin", "PreSpend", or "BlockRun"
  (working tree and all commits).
- The Franklin version under test cannot be identified by any available evidence.
- The public npm package "franklin" (v2.0.20, 2017) is an unrelated React/Redux form
  factory with no payment semantics; substituting it would violate the prohibition on
  impersonating the subject / swapping upstream code.

## 3. Evidence preserved (this directory, additive only)
- 00-pre-snapshot.txt ............ HEAD, branch, clean-tree proof before any action
- 01-stageA-verification.log ..... exact searches for artifacts + package identity check
- 02-stageA-negative-control.log . re-runs with visible paths; git-history authorship check
- 03-stageB-decision.md .......... explicit refusal to improvise Stage B
- 04-report.md ................... this report
No secrets, keys, tokens, or wallet material were generated, referenced, or stored.

## 4. Was non-signing / non-sending of the payment authorization confirmed?
NOT_VERIFIED. No dynamic run occurred, so there are no runtime observations either way.
Static reasoning alone is explicitly not accepted as dynamic evidence by this task's rules.

## 5. Classification of claims
| Claim | Status |
|---|---|
| Safe PreSpend attach mechanism exists in the Franklin under test | BLOCKED (cannot be confirmed from documentation or code present here) |
| Franklin launches and reaches PreSpend | BLOCKED (subject absent; not executed) |
| Hook deny prevents signing/dispatch | BLOCKED (not tested) |
| Authorization was NOT signed/sent during a real run | NOT_VERIFIED (no run) |
| Required prior artifacts (audit/install/build/manifest) exist | DYNAMIC_OBSERVED ABSENCE — their absence was directly observed via search (logs 01–02) |
| npm "franklin" ≠ payment-agent Franklin | STATIC_CONFIRMED (registry metadata, log 01 §A3) |
Overall result status: **BLOCKED** — per completion criterion, a concrete blocker is
recorded instead of a fabricated pass. No PASS claim is made for any part of Franklin.

## 6. Remaining NOT_VERIFIED (unchanged by this task)
Real payment flow, settlement, post-payment delivery, real gateway behavior, repeat/duplicate
payments, production fallback, plus everything originally listed as untested in the task brief.

## 7. Blocker & minimal requirement to continue safely
Blocker (precise): The designated test subject "Franklin" and its prerequisite artifacts
(franklin-static-audit.md, franklin-install.log, franklin-build.log, SUBJECTS-MANIFEST.md)
are not present in this sandbox or its git history; consequently the version identity and
the officially supported PreSpend mechanism cannot be established, and Section 3 mandates
stopping rather than improvising.

Minimal requirements for the Franklin team to unblock:
1. Deliver the Franklin subject into the sandbox: pinned version + source/tarball (or a
   lockfile/artifact reference resolving to it), plus SUBJECTS-MANIFEST.md identifying it.
2. Restore/re-share the three prior artifacts (static audit, install log, build log) so the
   PreSpend mechanism can be confirmed against documented, version-matched behavior.
3. State in writing which PreSpend hook API that version supports (config/env/plugin entry
   point) and confirm it is invocable without touching the fixed BlockRun addresses or a
   paid gateway.
4. Provide a zero-funds configuration path (dry-run/no-wallet mode or equivalent) sufficient
   to reach PreSpend, so the deny-hook test needs no signing capability at all.
With items 1–4, the planned Stage B remains: launch with unconditional-deny PreSpend hook,
minimal request, capture hook event log + stdout/stderr + exit code, and document ordering
evidence that the spend decision is intercepted before any signing/dispatch step.
