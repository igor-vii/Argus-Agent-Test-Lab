# Registry errata — external-audit follow-up, 2026-11-15

Notes on prose inside signed records. Records are append-only and are NOT
modified; nothing below changes any hash, signature or chain link.
Reproduce every number with `node tools/registry/audit-followup-2026-11-15.mjs`
(read-only; uses `tools/registry/lib.mjs` canonicalization, no other deps).

## E-1 — terminology in the #0022 note (audit finding ARG-12)

The #0022 correction note reads: "the only content difference across the whole
re-sign is the structurally forced prev_record_hash rebind in #0001 (old chain
head `da9ce991…`)". The label "old chain head" is imprecise. Byte-exact
identification (2026-11-15, recomputed with this repo's `canonical()`):

```
da9ce991a7d63032199a443630b848465e8042a42722a43117f91274c60a49bc
  = sha256(canonical(pre-rekey #0001 payload minus `signature`))
```

i.e. it is the **signing-message digest of the original argus-lab-2026q4
signature over record #0001** — the exact bytes the old key signed — not a
chain-link hash. For reference, the actual chain arithmetic around the rekey
(commit `65e6149d`), all reproduced:

- `sha256(canonical(pre-rekey #0000))` = `735eae3b…` = `prev_record_hash` of
  pre-rekey #0001 (matches);
- `sha256(canonical(pre-rekey #0001))` = `c7d627c9…` (independently computed by
  the external audit — matches our re-computation);
- rebind in #0001: `prev_record_hash` `735eae3b…` → `7ba9a8ad…` =
  `sha256(canonical(re-signed #0000))` (matches);
- `sha256(canonical(#0001 current))` = `7c148786…` = `prev_record_hash` of
  #0002 (matches).

The chain is unaffected; #0022 stays byte-identical.

## E-2 — audit item A2 (evidence hashes): closed with byte access

All 242 pinned paths across the 23 records and 31 evidence manifest files were
re-hashed byte-wise on 2026-11-15:

- **85 paths present in the public repository — all match** their pinned
  sha256;
- **156 paths intentionally absent** from the public repository: they are
  pinned by `0013-boundary/product-layer-manifest.json` (boundary prep commit
  `960f827a`, "last public snapshot efbf51e") and describe files that moved to
  the private product repository at the #0013 split (commit `4b3540d7`). The
  manifest is the bridge for verifying those bytes there;
- **1 path drifted post-pin**: `package.json` — byte-verified correct at the
  pin commit (`git show 960f827a:package.json` = `0cb35c92…`) and changed
  afterwards by public-repo-only commits (`4b3540d7` boundary split,
  `1a4e3f3a` MCP stdio bridge). Every change is in git history.

No mismatch indicates tampering; no chain break.

## E-3 — audit observation "one artifact under three names" (#0020 runner)

Byte-level check dissolves the observation: the runner artifact
(`26f60fd3…`) is cited exactly twice — record #0020 `evidence[]` and
`evidence/0020-wave2-claim-layer/export-hashes.json` — under a **single**
path `sut-wave2-claim-layer/battery-wave2-claim-layer.mjs`; the file exists
and its bytes hash to the pinned value. No naming divergence exists at the
byte level (likely a text-extraction path-normalization artifact in the audit
tooling). Nothing to fix.
