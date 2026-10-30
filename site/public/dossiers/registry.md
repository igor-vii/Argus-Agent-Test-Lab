# Argus Lab — Disclosure Registry

Public, append-only record of engagement stamps and post-seal corrections.
Sealed dossiers are never rewritten: changes to interpretation or wording of
sealed material are recorded here as correction entries.

---

## Stamp 0009 · Case 01 · mcp-tool-idempotency — SEALED

- **Target:** mcp-tool-idempotency — general-purpose idempotency library for MCP tools (TypeScript)
- **Engagement:** adversarial battery on the tagged release; coordinated disclosure with the maintainer
- **Findings:** three durability windows (F1–F3) exposing silent duplicate execution of committed side effects
- **Outcome:** maintainer collaborated; F1–F3 fixed upstream; suites pass 91/91 at tag, 93/93 at main; verification note pinned in release notes and SECURITY.md
- **Battery:** 10/10 pass · dossier hash-pinned

### CORRECTION-0009-01 · 2026-10-29

**Trigger:** maintainer review of public materials (one-pager, landing page).

1. **Severity recalibration (maintainer's assessment, adopted):**
   - F3 (cross-instance race) — **high** (unchanged)
   - F2 — **medium** (shares F3's root cause — the missing liveness check — and requires a crash in a narrow window; previously listed as high)
   - F1 — **low** (documented at-least-once limit: "failed executions are never cached" in README; 0.2.0 default still allows it, `isRetryable` is opt-in; previously listed as high)
2. **Wording correction (adopted):** the library is generic, not payment-specific. The accurate description of the exposed behavior is **"silent duplicate execution of committed side effects"** — which becomes a double charge only when the wrapped tool takes payments. The earlier public phrasing "silent double-charge" / "MCP payment-tool lib" is superseded everywhere (landing page, one-pager, public posts).
3. **Related maintainer action:** the old "exactly-once" tagline has been removed by the maintainer everywhere, including the repository description.

**Status:** applied to the landing page and one-pager v3 (2026-10-29). The sealed dossier text itself is unchanged; this entry is the record of record.

*Note: severity and wording for this case are maintained in line with the maintainer's own characterization of the findings.*

---

## Finding 0000 · x402 reference client — SEALED

- **Target:** x402-foundation/x402 — reference client, @x402/fetch 2.28.0
- **Finding:** the reference client signs any server-declared 402 amount with no binding to any caller expectation (overcharge vector); filed upstream as x402#3866 (2026-10-21)
- **Status:** open — no maintainer response
- **Battery:** 3/3 reproduced sessions on Base Sepolia · dossier hash-pinned

### CORRECTION-0000-01 · 2026-10-30

**Trigger:** external audit of public materials — the sealed summary's wording contradicted the lab's own pinned capture notes.

1. **Wording correction:** the sealed summary said the inflated amount "was **paid**". The evidence establishes that the client **signed and handed over an authorization** for the inflated amount (100,000 units = 0.1 USDC vs a resource priced at 10,000 units = 0.01 USDC) in 3/3 reproduced sessions. On-chain settlement of an overpayment was **not established** — settlement in the harness is mocked and the client wallet is an unfunded one-shot test key; with a compliant facilitator the authorization would settle as-is. The defect claim (the client signs any server-declared 402 amount) is unaffected; only the settlement claim is withdrawn.
2. **Status refresh:** "no maintainer response" updated to **as of 2026-10-30**.

**Status:** applied to registry semantics via the signed correction record (2026-10-30). The landing page and llms.txt already used the accurate verb; one-pager v4 refresh queued. The sealed record #0000 JSON is unchanged — this entry is the record of record.
