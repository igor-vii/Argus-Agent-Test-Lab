# RUNBOOK — Run and Registry Procedure (EN)

**Version:** 1.1 · **Date:** 2026-11-22 · **Status:** internal lab procedure
**English:** [docs/RUNBOOK.md](./RUNBOOK.md) · Russian original: [docs/RUNBOOK.ru.md](./RUNBOOK.ru.md)
**Versioning rule:** the document changes only via a new version; retroactive edits are forbidden; history lives in git.

**Changelog.** v1.1 — repository map aligned with the actual layout; the fixed "stand repo" concept removed (the run platform is recorded per run, see 1.2); signing described as Ed25519 + allowlist (actual tools; the v1.0 GPG model dropped); a Definitions section added. v1.0 — first edition.

---

## 0. Purpose and three principles

This runbook defines how to format runs (batteries, lenses, probes), what artifacts go where, how they get signed into the registry, and how they are published. The procedure is identical in any execution environment.

1. **Offline-first.** Every step is verifiable without network. Network is needed only for: pull/push, posting to an external thread, and reaching the SUT when the run is live.
2. **Repo-relative.** No absolute paths in scripts, metadata, or artifacts.
3. **Full hashes in data.** Data, indexes, and code comparisons use full SHA-256 (64 hex) only. Short forms (16 hex + `...`) are acceptable in human-facing text only. Known defect: `build-index.mjs` writes a truncated 16-hex `chain_head` into INDEX.json — patch planned after the current push; until then, verify pins against the full hashes carried by records (`prev_record_hash` fields are full).

---

## 1. Repository map and environments

### 1.1. Repositories

| Repository | Access | Role | Contents |
|---|---|---|---|
| **Argus-Agent-Test-Lab** | public | **Registry** | `attestations/` (records, keys, agent, evidence, INDEX), `tools/registry/` (verify, build-index, sign-record, offline-sign, keygen, agent-*), `tools/registry/drafts/`, `sut-*/` (per-SUT stands), `action/`, `site/`, `docs/`, `mcp-server.mjs` |
| **argus-lab** | private | Workshop (Cantina NDA) | `engine/` (engine, `batteries/x402-core` — scenarios), `demo-sut/`, `demo-buyer/` (raisable stand), `ci/` (bundle pipeline), `00-REGISTRY/SCENARIO-REGISTRY.md`, `05-OPERATOR-RUNBOOK/` (fork-PoC — a **different** procedure), `06-RUNLOGS/`. `CONFIDENTIALITY.md` rules are binding: nothing about bounty materials leaves the private repo |
| **argus-console** | private | Console | Engine + scenarios in a preserved form; more stable than the sandbox, but not dogma |
| **argus-action** | public | CI path | GitHub Action (`action/action.yml`, `action/run.mjs`): the same matrix on a client machine; dogfood repos (`argus-action-dogfood`, `argus-ci-dogfood`) — self-checks |
| **argus-bundles** | public | Bundles | Storage for bundle artifacts built by `ci/build-bundle.mjs` + the `build-bundle.yml` workflow |

The single source of truth for the registry is the public repository. The push there is gate P6.

### 1.2. Run platform (instead of a fixed "stand repo")

A single stand repository **does not exist and must not exist**. The stand is raised per run; the console and CI are equivalents on other machines. Three platform kinds:

| Kind | What it is | Notes |
|---|---|---|
| `sandbox-stand` | Engine + scenarios + demo SUT (`demo-sut/`, `demo-buyer/`, `engine/`) raised in a sandbox for the duration of the run | Most reproducible; composition assembled per task |
| `console` | The console (`argus-console`): engine and scenarios preserved | More stable, still mutable — not dogma |
| `ci-action` | The Action (`argus-action`): the same matrix at a client | Client machine; composition fixed by the workflow |

**Platform rule:** the system and protocols change, scenarios change with them — therefore the platform composition is fixed **per run** in the pre-registration (engine version/digest, scenario set, SUT target) and repeated in `run.json` (section 3.3). A scenario or protocol change = a new pre-registration, never an edit of the old one.

---

## 2. Record lifecycle (P0–P6)

| Phase | What happens | Gate (what must exist) |
|---|---|---|
| **P0. Scoping** | What we test; record type (`seal` / `finding` / `correction`); questions to counterparties — **before** the freeze | `tools/registry/drafts/NNNN-<slug>.<type>.draft.json` |
| **P1. Pre-registration** | Matrix rows (id, scenario, preconditions, expected, **row unit**, pass rule), boundary declarations, pins (SUT, scenarios, engine). Freeze before the first run artifact | Draft with pins filled, committed before the run |
| **P2. Platform** | Raise/select the platform (1.2), record composition in run.json; clean tree, SUT at its pin | Run directory with run.json |
| **P3. Run** | Scripts write only into a fresh run directory; raw outputs untouched; normalized rows + claim digests | `raw/`, rows, claims |
| **P4. Verification** | Recompute all pins; `node tools/registry/verify-registry.mjs` (and `--registry=agent` when writing the agent chain); build the manifest | manifest + green verify |
| **P5. Signing** | Strict order N→N+1→N+2; pre-sign checklist (5.3); `sign-record.mjs` or `offline-sign.mjs`; verify after each | Records in `attestations/records/`, INDEX rebuilt |
| **P6. Publication** | Push → CI regenerates the site catalog (`latest-seal.yml`) → post to the external thread (head, counters, pins) | Push + post |

**Freeze rule.** Rows freeze as published; nothing is re-interpreted after the run. Later refinements are a `correction` (via `amends`) or `ERRATA.md` for wording slips; a sealed record is never rewritten.

**Re-run rule.** One run = one UTC-stamped directory; a repeat goes into a new directory; the canonical run is fixed by a record.

---

## 3. File formats and naming

### 3.1. General rules

- Records: `attestations/records/NNNN-<slug>.<type>.json`; NNNN is a single global sequence (a record number is a universal handle).
- Types: `seal` (a run happened: SUT at commit X, scenarios S at pinned versions, verdicts valid, **full findings list attached**), `finding` (a defect in a third-party component, disclosed at a named venue, live status), `correction` (post-seal correction via `amends`). Separate chain: `self-test` (agent self-reports).
- Time: UTC, ISO-8601 with the Z suffix (`2026-11-22T08:00:39Z`). UTF-8, LF, no BOM. No secrets or private keys in artifacts.
- `INDEX.md` / `INDEX.json` — generated by `build-index.mjs` only; never hand-edited.

### 3.2. Draft record (P0–P1)

A draft carries no `seq`, `record_id`, `prev_record_hash`, `signature` — the signer assigns them. Key fields of the target record: `type`, `title`, `subject` (repo/component/commit), `run_ts`, `scenarios`, `evidence` (entries of kind `file` pin the SHA-256 of artifacts — editing an artifact breaks the seal), `findings_summary`, `notes`, `self_run`.

### 3.3. run.json (run directory)

```json
{
  "record_id": "NNNN",
  "prereg": { "id": "NNNN-<slug>.<type>.draft.json", "sha256": "<64 hex>" },
  "platform": {
    "kind": "sandbox-stand | console | ci-action",
    "engine": { "name": "<argus engine | argus-console>", "version_or_digest": "<version or sha256>" },
    "scenarios": { "source": "<SCENARIO-REGISTRY + scenarios file>", "digest": "<64 hex>" },
    "sut": { "target": "<target>", "commit_or_version": "<pin>" }
  },
  "host": { "class": "sandbox | external-coder | operator-local | client-machine", "os": "…", "runtime": { "node": "…", "python": "…" }, "tz": "UTC" },
  "window": { "start_utc": "<ISO Z>", "end_utc": "<ISO Z>" },
  "runs": [ { "argv": "<repo-relative command>", "exit": 0, "log": "raw/<name>" } ]
}
```

### 3.4. Evidence pack

Actual layout (see `attestations/evidence/0018-boundra-a10/`):

```
attestations/evidence/NNNN-slug/
├── README.md            # what this is, how to read it
├── manifest.sha256      # sha256 of every artifact in the pack
├── export-hashes.json   # digests of exports/claims
└── runs/
    ├── <name>.jsonl             # main matrix-row log
    ├── <name>.jsonl.summary     # summary
    ├── <name>.adapter.jsonl     # adapter/transport
    ├── <name>.stand.json        # run platform composition
    └── <name>.state/            # state (audit.jsonl, spend.db, etc.), when present
```

**Immutability rule:** after being pinned in a record, pack files are never edited; a mistake = a new artifact + `correction`/note.

### 3.5. Matrix rows

- `unit` is declared in the pre-registration: `attempt` or `verdict`. Verdict rows carry no per-attempt tuple; when attempts are needed, unit = attempt.
- For lens records (classification from records): the finished classification is **not** stored in evidence — the checker derives it from result digests across attempts of one purchase; rows carry the inputs for recomputation (attempt tuple + result binding, both attempts, including the rejected one).
- Unsortable rows get the verdict `absent`: an honest result, not a failure.

---

## 4. Registry: chains and keys

### 4.1. Chains

- **Main** (`attestations/records/`, INDEX at `attestations/` root) — operator records signed by an allowlisted key.
- **Agent** (`attestations/agent/`) — self-reports of autonomous sessions: per-session keys, namespace `argus-agent-self-<seq>`, type `self-test`; each record pins `main_head_at_issuance` (tamper-evident ordering against the main chain without merging chains); anti-flood gates: a spend block and at least one `file` evidence entry are mandatory. Never merged into main, never operator-vouched.

### 4.2. Cryptography and trust

- Signature: **Ed25519 over canonical JSON** (sorted keys, no whitespace), signature base64, signer identified by `signer_key_id`.
- Public keys: `attestations/keys/<key_id>.pub.json`; fail-closed — a record under an unlisted key does not verify.
- The main registry is additionally restricted by the `OPERATOR_KEY_IDS` allowlist in `tools/registry/lib.mjs` (ARG-03, 2026-11-21): a session key dropped into `keys/` cannot self-promote into the operator trust root.
- `prev_record_hash` = SHA-256 of the canonical form of the **full** previous record (genesis = `null`); git adds the append-only guarantee on top.
- Trust anchors: `attestations/keys/` holds current and historical public keys; private keys are **never** in the repository.

---

## 5. Signing

### 5.1. Tools (actual)

```bash
node tools/registry/verify-registry.mjs                    # main chain (exits non-zero on any tampering)
node tools/registry/verify-registry.mjs --registry=agent   # agent chain
node tools/registry/build-index.mjs                        # rebuild INDEX (main); --registry=agent — agent

node tools/registry/sign-record.mjs <draft.json>           # sign on a machine with the repo and the key:
                                                           # assigns seq, chains, writes records/NNNN-...
node tools/registry/offline-sign.mjs <draft.json> <privkey.json> \
     --seq NNNN --prev <prev_record_hash_hex>              # offline mirror: a machine with the key, no repo;
                                                           # prints the record to stdout, writes and transmits nothing
```

### 5.2. Order

Strict order **N → N+1 → N+2** without reshuffles: each next signature chains onto a head that already accounts for the previous one. Skipping, reordering, or backdating signatures is forbidden. Current queue — example: 0025 → 0026 → 0027 (finding drafts of the probe sessions), then build-index, verify, push.

### 5.3. Pre-sign checklist (every item mandatory)

1. `git pull --ff-only`; clean tree.
2. `verify-registry.mjs` — both chains green; head in records **full** (64 hex; the truncated `chain_head` in INDEX is the known index defect, see lesson 1).
3. The draft carries no `seq`/`prev_record_hash`/`signature`; `type` fields correct.
4. Every draft pin recomputed and matched by full hash (artifacts, manifest, evidence).
5. Status notes closed: no open "edit" marks, no unfilled fields.
6. Strict signing order; verify immediately after each signature.
7. Finish: `build-index.mjs` → verify → push → CI regenerates the catalog → thread post.

### 5.4. Keys: rotation and revocation

- A new rotation = a new `key_id` + a chain-linked amendment; old records stay valid under their original key (precedent: the 2026-10-24 rotation, `correction` 0022; key `argus-lab-2026q4` is kept in `keys/` so pre-rekey artifacts keep verifying).
- Lost key: publish the old public key (from git history if needed), re-sign affected records with content preserved, record the whole rotation as a `correction` with the old key's SHA-256 pinned — the rotation event itself must be chain-signed.
- Leak/revocation: same day; an agent session key is outside the allowlist by construction (ARG-03), the agent-chain tail is removed to the last valid record, main records untouched.
- External audit: follow-ups go to `ERRATA.md`; nothing in `records/`, `keys/`, `evidence/` changes; the head does not move.

---

## 6. Portability: sandbox ↔ third-party coder ↔ CI

### 6.1. Environment contract

A run is reproducible when it depends only on: a checkout at the recorded head, pre-registration pins, the platform composition (1.2), and tool versions recorded in `run.json`. Not required: absolute paths, environment variables beyond `PATH`, locale, timezone, network during the run (except live SUT probes, where the network is part of the subject and is recorded in run.json).

### 6.2. Second-clone test

Artifacts are portable when, in a second fresh clone, `verify-registry.mjs` (both chains) passes and all pins recompute. This is the definition of "the run is formatted correctly".

### 6.3. Role split

| Action | Sandbox | Third-party coder | Console | CI/action (client machine) |
|---|---|---|---|---|
| Runs, evidence | yes | yes | yes | yes |
| Drafts, pre-registration | yes | yes | yes | yes (via action) |
| **Main signing** | if the holder's key is in the environment; otherwise pass the draft to the holder | **no** — `offline-sign.mjs` at the holder | no | **never** (allowlist, ARG-03) |
| Agent self-test | yes (`agent-sign.mjs`, session key) | yes | no | per action configuration |

A signature covers bytes (canonical JSON): the artifact builder and the key holder may live in different environments; `offline-sign.mjs` exists exactly for the "key present, repo absent" machine.

### 6.4. Transfer between environments

Git bundle (`git bundle create lab.bundle --all`, check with `git bundle verify`) or an archive; on top — `SHA256SUMS` with full hashes; on receipt `sha256sum -c`. For publishing bundles — `argus-bundles` (built by `ci/build-bundle.mjs`).

### 6.5. Forbidden in any environment

Editing a pack after its pin; local SUT modifications before a run (pins only); dependence on environment/locale/local time; precomputed classification in lens records; private keys and secrets in the repo or logs.

---

## 7. Checklists

**Pre-run.** Freeze committed before the run · pins full (64 hex) · platform recorded (kind + composition) · SUT at its pin · counterpart questions closed · fresh run directory.
**Post-run.** raw/ untouched · rows parse as line-delimited JSON · `unit` matches the pre-registration · manifest built last · second clone green.
**Pre-sign** — section 5.3.
**Push.** verify green on both chains · INDEX rebuilt by the tool · head recorded in the post · draft files consolidated.
**Thread post.** Only after the push · head, chain counters, pins · quotes in the original language, translations marked · deadlines only as "in the next cycle/freeze".

---

## 8. Known lessons → standing rules

1. **The "64 slip".** `build-index.mjs` and the summary line of `verify-registry.mjs` truncate the head to 16 hex; the verification logic is correct (it compares full `prev_record_hash`). Rule: full 64 hex in all data and comparisons; short forms in human text only. The index patch lands after the current push as a separate code change.
2. **Status notes before signing.** An open note blocks signing; it is resolved before the pre-sign step.
3. **Row unit declared in the pre-registration.** Verdict rows cannot carry a per-attempt tuple; when attempts are needed — unit = attempt (lens commitment, x402#4198 thread).
4. **Lens without ready answers.** The pass condition is the classification itself, done by the checker from frozen records; evidence carries inputs for recomputation, not results; unsortable = `absent`.
5. **Key revocation — same day.** The allowlist is never extended by session keys (ARG-03); rotation goes through a `correction` (precedent 0022).
6. **Quotes in the original language.** Translations are marked explicitly (the 2026-11-22 incident).
7. **The platform is not a constant.** Stand, console, CI are equal platform kinds; composition is recorded per run in the pre-registration and `run.json`; a scenario/protocol change = a new pre-registration.

---

## 9. Definitions

| Term | Definition |
|---|---|
| **Record** | A signed registry element: `seal`, `finding`, or `correction` in the main chain; `self-test` in the agent chain. File `NNNN-<slug>.<type>.json` |
| **Seal** | A "run happened" record: SUT at a pin, scenarios at pins, verdicts valid, findings fully attached. Does not mean "bug-free" |
| **Finding** | A record of a defect in a third-party component with the disclosure venue and a live status; statuses change via **amendments**, not edits |
| **Correction** | A post-seal correction via `amends`; the sealed record is never rewritten |
| **Draft** | A record draft in `tools/registry/drafts/` without `seq`/chain/signature; the signer assigns them |
| **Freeze** | Fixing the pre-registration before the run; afterwards only correction/note |
| **Pre-registration** | Matrix rows, unit, pass rules, boundaries and pins fixed before the first artifact |
| **Row unit** | The matrix row unit: `attempt` or `verdict`; declared in the pre-registration |
| **Lens** | A pre-registered check in which the checker classifies attempts from frozen records only (delivery retry vs second execution); unsortable = `absent` |
| **`absent`** | The verdict "the property cannot be established from the records" — an honest result, not a failure |
| **Canonical JSON** | Sorted keys, no whitespace; the signing and hashing form |
| **`prev_record_hash`** | SHA-256 of the canonical form of the full previous record; genesis = `null`; always 64 hex |
| **Chain head** | The hash of the canonical form of the last record; short forms acceptable in human text |
| **Trust anchor** | A public key in `attestations/keys/<key_id>.pub.json`; fail-closed verification |
| **`signer_key_id`** | The signer's key identifier; for main — from the `OPERATOR_KEY_IDS` allowlist |
| **Allowlist (ARG-03)** | The hard list of operator key_ids in `tools/registry/lib.mjs`; session keys cannot self-promote |
| **Agent chain** | A separate registry of autonomous-session self-reports; per-session keys; pins `main_head_at_issuance`; never merged with main |
| **`main_head_at_issuance`** | The pin of the main-chain head at agent-record issuance (tamper-evident ordering) |
| **Evidence pack** | The directory `attestations/evidence/NNNN-slug/`: README, manifest.sha256, export-hashes.json, runs/ |
| **Pin** | The full SHA-256 (64 hex) of an artifact fixed in a record/draft; editing the artifact breaks the pin |
| **Run platform** | The environment kind: `sandbox-stand` / `console` / `ci-action`; composition recorded per run |
| **SUT** | System Under Test — the run's target (component/gateway/server at a pinned commit/version) |
| **Z suffix** | The UTC+0 designator in ISO-8601 ("Zulu"): `2026-11-22T08:00:39Z` = 08:00:39 UTC. Not an invention of this runbook — the international standard for timestamps in strings |
| **ERRATA.md** | The journal of wording clarifications outside the chain; does not touch `records/`, `keys/`, `evidence/` or the head |
| **Offline-first** | Every step verifiable without network; network only for pull/push, the thread post, and live SUT probes |

---

## 10. Mini-FAQ

**Do we restructure the repositories to match this document?** No. The document is aligned to the actual structure; no directory moves — pins, INDEX, verify and CI are untouched. Exactly one code change is planned: the full `chain_head` in `build-index.mjs`/`verify-registry.mjs` (after the current push).

**May an artifact be edited after its pin?** No: a new artifact + `correction`/note.

**Which number comes next?** The single global sequence: N = last main record + 1; the `type` field carries the semantics.

**A coder needs an environment variable?** Forbidden; the value lives in the script or `run.json`.

**A run died mid-session?** The directory stays; the repeat goes to a new directory; the canonical run is fixed by a record.

**The layout does not match section 1?** Historical paths are not renamed; the difference is recorded in a new RUNBOOK version.
