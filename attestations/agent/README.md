# Agent self-test registry (Variant A)

Self-reported records of autonomous agent probe runs. This is a SEPARATE
trust root from the main registry (`../records`):

|  | Main registry (`../records`) | Agent registry (`records/` here) |
|---|---|---|
| Signer | operator key, offline (`argus-lab-2026q4r2`) | per-session agent key (`argus-agent-session-<id>`) |
| Operator vouches | yes | **no — self-reported only** |
| Accepted by | `verify-registry.mjs` (default) | `verify-registry.mjs --registry=agent` |
| Where it appears | the public site, primary | repo only (not on the site) |

## Rules

1. Records use record_id `argus-agent-self-<seq>`, type `self-test`, class
   `agent-self-test`, and their own hash chain (genesis `prev_record_hash:
   null`). One sequence namespace, shared by all agent records.
2. Every record pins `main_head_at_issuance` = SHA-256 of the canonical head
   of the main registry at signing time. The verifier accepts it only if it
   matches some main-registry record hash — tamper-evident ordering against
   the operator chain, without merging the chains, and the check stays valid
   as the main chain grows.
3. One Ed25519 keypair per session (`tools/registry/agent-keygen.mjs`).
   The private key never leaves the sandbox (written outside the repo).
   The public key is committed here with `class: "agent-session"`.
   Main-registry verification rejects agent keys (ARG-03 operator allowlist
   in `tools/registry/lib.mjs`) and agent-registry verification rejects
   anything that is not an `agent-session` key — the two trust roots cannot
   absorb each other. Revoke a session key by removing its pub file.
4. Quality gates (anti-flood): every record carries a `spend` block
   (currency / spent / cap — real money accounting; most runs are $0.00 and
   that must stay visible) and at least one hash-pinned file evidence entry.
5. Promotion path: an agent record never migrates into the main registry by
   re-signing. The operator reviews the evidence and, if accepted, issues an
   operator-signed main-registry record that references the agent record.
   Unsigned drafts awaiting the operator signature
   (`tools/registry/drafts/` + `tools/registry/offline-sign.mjs`) remain the
   other route for anything that should be operator-signed directly.

## Layout

- `records/NNNN-<slug>.self-test.json` — signed self-test records.
- `keys/<signer_key_id>.pub.json` — agent-session public keys.
- `INDEX.md` / `INDEX.json` — generated:
  `node tools/registry/build-index.mjs --registry=agent`. Never hand-edited.

## Verify

    node tools/registry/verify-registry.mjs --registry=agent
