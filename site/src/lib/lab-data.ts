/**
 * Argus Agent Test Lab — public facts.
 * Every entry mirrors a sealed record in the public registry:
 * github.com/igor-vii/Argus-Agent-Test-Lab (attestations/records/).
 *
 * CHAIN_HEAD / RECORD_COUNT are no longer hand-maintained: they are read at
 * build time from src/data/latest-seal.json, which gen-latest-seal.mjs
 * regenerates from the registry after a full verify-registry.mjs pass.
 * The JSON is committed alongside code that changes the registry, so the
 * landing always renders the chain head it was built from.
 */

import latestSeal from "@/data/latest-seal.json";

export const REPO_URL = "https://github.com/igor-vii/Argus-Agent-Test-Lab";
export const CHAIN_HEAD = latestSeal.verify.chain_head as string;
export const RECORD_COUNT = latestSeal.verify.records as number;
/** Backwards-compatible alias — historical name, now record-count-based. */
export const SEAL_COUNT = RECORD_COUNT;

/** Canonical site URL — custom domain `argus-lab.tech`, registered 2026-10-28
 *  via nic.ru (RU-CENTER), expires 2027-10-27; attached to the Vercel project.
 *  When touching URLs: change this line, robots.txt Sitemap line, and re-run
 *  `npm run gen:og` (domain text lives in scripts/gen-og-cover.mjs). */
export const SITE_URL = "https://argus-lab.tech";
export const CONTACT_EMAIL = "argus.testlab@gmail.com";
export const ONE_PAGER_PATH = "/argus-lab-onepager.pdf";

export type Tone = "fail" | "hold" | "pass" | "observed" | "dx" | "info";

export interface SealVerdict {
  id: string;
  verdict: string;
  tone: Tone;
}

export interface SealFinding {
  id: string;
  severity: "high" | "medium" | "low" | "info";
  text: string;
}

export interface Seal {
  seq: string;
  date: string;
  type: "finding" | "seal";
  title: string;
  subject: string;
  summary: string;
  verdicts: SealVerdict[];
  findings: SealFinding[];
  evidence: number;
  links?: { label: string; href: string }[];
}

export const SEALS: Seal[] = [
  {
    seq: "0000",
    date: "2026-10-23",
    type: "finding",
    title: "x402 reference client signs any server-declared 402 amount",
    subject: "x402-foundation/x402",
    summary:
      "The overcharge vector that started the lab: the reference client treats the server-declared 402 amount as ground truth and signs it without binding to any caller expectation. Filed upstream; became the anchor for the binding-control family.",
    verdicts: [{ id: "overcharge-vector", verdict: "finding", tone: "fail" }],
    findings: [],
    evidence: 1,
    links: [{ label: "x402#3866", href: "https://github.com/x402-foundation/x402/issues/3866" }],
  },
  {
    seq: "0001",
    date: "2026-10-23",
    type: "seal",
    title: "Block D live run — S10/S11 vs amw-paypal-agent-demo",
    subject: "agentmiddleware/amw-paypal-agent-demo",
    summary:
      "The lab's first live round: two scenarios against a real merchant agent demo, raw live evidence captured and sealed.",
    verdicts: [
      { id: "S10", verdict: "PASS", tone: "pass" },
      { id: "S11", verdict: "PASS", tone: "pass" },
    ],
    findings: [{ id: "F2", severity: "high", text: "High-severity finding surfaced by the live run (fix path tracked with the vendor)." }],
    evidence: 4,
  },
  {
    seq: "0002",
    date: "2026-10-24",
    type: "seal",
    title: "Block D clean-machine reproduction — S10/S11",
    subject: "agentmiddleware/amw-paypal-agent-demo",
    summary:
      "Independent reproduction of #0001 on a clean machine from committed sources: verdicts identical. The reproducibility discipline starts here.",
    verdicts: [
      { id: "S10", verdict: "PASS", tone: "pass" },
      { id: "S11", verdict: "PASS", tone: "pass" },
    ],
    findings: [{ id: "F2", severity: "high", text: "Reproduced on clean machine — claim REPRODUCED." }],
    evidence: 4,
  },
  {
    seq: "0003",
    date: "2026-10-24",
    type: "seal",
    title: "S-BS-06 binding battery — reviewer round-2 controls (official @x402 client 2.28.0)",
    subject: "x402-foundation/x402",
    summary:
      "Reviewer round 2 on upstream issue #3866: C1 positive control, payTo/asset/network delta probes, resource-vs-call binding, lost-response recovery — all executed on the official client. Reviewer gaps closed with live sessions.",
    verdicts: [{ id: "S-BS-06", verdict: "PASS", tone: "pass" }],
    findings: [{ id: "F1x", severity: "info", text: "Attribution note: asset/network binding enforced by official client spendControls upstream of the gate." }],
    evidence: 1,
    links: [{ label: "x402#3866", href: "https://github.com/x402-foundation/x402/issues/3866" }],
  },
  {
    seq: "0004",
    date: "2026-10-26",
    type: "seal",
    title: "S-BS-14/15 wave 2.5 — binding-race & non-atomic-amount first run (PR #3920 @ 2b4cc47)",
    subject: "x402-foundation/x402",
    summary:
      "Cycle-1 red zone: two concurrent requirement sets on one quota key make the client sign BOTH payloads (signer ×2); a non-atomic decimal amount gets signed as a ×N payload. Both findings filed against the PR review.",
    verdicts: [
      { id: "S-BS-14 binding-race", verdict: "FAIL", tone: "fail" },
      { id: "S-BS-15 non-atomic-amount", verdict: "FAIL", tone: "fail" },
    ],
    findings: [
      { id: "F-A10", severity: "high", text: "Binding race at first contact: concurrent requirement sets, one quota key, two signatures." },
      { id: "F-A11", severity: "high", text: "Non-atomic amount signed as ×N of the resource price (cycle-1 state)." },
    ],
    evidence: 2,
    links: [{ label: "PR #3920", href: "https://github.com/x402-foundation/x402/pull/3920" }],
  },
  {
    seq: "0005",
    date: "2026-10-27",
    type: "seal",
    title: "Inngest idempotency conformance — 13 probes, 0 FAIL (2 DX)",
    subject: "inngest@4.26.0 + @inngest/test@1.0.0 (npm dist)",
    summary:
      "13 pre-registered probes across static and dynamic phases. Everything held beyond the documented scenarios or matched the vendor's published disclosure exactly — the honest-posture outcome, stated as plainly as failures get stated. Two developer-experience findings filed in the vendor's own test engine.",
    verdicts: [
      { id: "static (I1..I4)", verdict: "0 FAIL (1 PASS / 4 OBSERVED)", tone: "pass" },
      { id: "dynamic (p0..p4d)", verdict: "0 FAIL (4 PASS / 4 OBSERVED)", tone: "pass" },
    ],
    findings: [
      { id: "DX1", severity: "low", text: "@inngest/test does not surface AUTOMATIC_PARALLEL_INDEXING or any execution warnings." },
      { id: "DX2", severity: "low", text: "MockedStep memo injection bypasses runtime collision indexing with no divergence flag." },
    ],
    evidence: 8,
    links: [{ label: "inngest#5091", href: "https://github.com/inngest/inngest/issues/5091" }],
  },
  {
    seq: "0006",
    date: "2026-10-27",
    type: "seal",
    title: "S-BS-19 blockrun-nano-recovery — 3 FAIL / 3 HOLD (wave 4)",
    subject: "@blockrun/nano-client 0.8.0 (npm exact pin)",
    summary:
      "Battery against the published SDK: a shape-only payTo check signs the authorization over an attacker-controlled recipient; the default config has no spend cap (×50 signed); a lost response is a recovery dead-end whose only exit is a retry that mints a fresh nonce — a second economic execution. Three genuine guards (decimal, contract pin, replay) hold.",
    verdicts: [
      { id: "P1 payto-substitution", verdict: "FAIL (vendor-side)", tone: "fail" },
      { id: "P2 overcharge-default", verdict: "FAIL (vendor-side)", tone: "fail" },
      { id: "P3 lost-response-recovery", verdict: "FAIL (vendor-side)", tone: "fail" },
      { id: "C1..C3 controls", verdict: "HOLD (3/3)", tone: "hold" },
    ],
    findings: [
      { id: "BS19-F1", severity: "high", text: "payTo substitution passes the shape-only check; signature produced over attacker payTo." },
      { id: "BS19-F2", severity: "high", text: "No default spend cap: authorization signed for ×50 of requirements price; cap is opt-in." },
      { id: "BS19-F3", severity: "medium", text: "Lost-response recovery dead-end; manual retry = second economic execution, contradicting the README claim." },
    ],
    evidence: 6,
    links: [{ label: "blockrun-nano-client#18", href: "https://github.com/BlockRunAI/blockrun-nano-client/issues/18" }],
  },
  {
    seq: "0007",
    date: "2026-10-27",
    type: "seal",
    title: "S-BS-20 nevermined-credit-recovery — 7 FAIL / 1 DX / 3 HOLD (wave 5)",
    subject: "@nevermined-io/payments 1.13.0 (npm exact pin)",
    summary:
      "Eleven probes against the published payment middleware: lost-response retry double-charges on the default token; single-use enforcement is per-process and reactive (concurrent race delivers a free service); any settle failure except one special case delivers the resource unpaid; verify reserves nothing; streamed responses never carry a settlement receipt. Three controls hold — including a genuinely well-built byte-delta disconnect probe.",
    verdicts: [
      { id: "P1 lost-response-retry", verdict: "FAIL", tone: "fail" },
      { id: "P2 single-use-guard-race", verdict: "FAIL", tone: "fail" },
      { id: "P3 settle-failure-unpaid-delivery", verdict: "FAIL", tone: "fail" },
      { id: "P4 verify-settle-depletion-race", verdict: "FAIL", tone: "fail" },
      { id: "P5 streaming-no-receipt", verdict: "FAIL", tone: "fail" },
      { id: "P6 silent-v3-downgrade", verdict: "DX", tone: "dx" },
      { id: "C1+C3+C4 controls", verdict: "HOLD (3/3)", tone: "hold" },
    ],
    findings: [
      { id: "NV-F1", severity: "high", text: "Lost-response retry double-charges on the default v2 token; receipt attached only to the lost response." },
      { id: "NV-F2", severity: "high", text: "Single-use guard is per-process and reactive; multi-replica sellers have no guard at all." },
      { id: "NV-F3", severity: "high", text: "Any settle failure except 0059 delivers unpaid; the documented 200+success:false shape even receives a receipt." },
      { id: "NV-F4", severity: "medium", text: "Verify checks balance but reserves nothing: depletion race delivers the second service free." },
      { id: "NV-F5", severity: "medium", text: "Streamed responses carry no settlement receipt, ever; reconciliation impossible on the dominant endpoint shape." },
      { id: "NV-DX1", severity: "low", text: "Silent v3→v2 downgrade on mint: buyer wants single-use, silently holds a reusable credential." },
    ],
    evidence: 5,
    links: [{ label: "nevermined-io/payments", href: "https://github.com/nevermined-io/payments" }],
  },
  {
    seq: "0008",
    date: "2026-10-27",
    type: "seal",
    title: "S-BS-14/15 cycle 2 — PR #3920 @ b1a4d8ce cross-check",
    subject: "x402-foundation/x402",
    summary:
      "The re-run promised in cycle-1: green zone A1–A9 holds, and A11 (non-atomic amount) is verified CLOSED with typed fail-closed pre-signer rejection. The binding race A10a/A10b reproduces at the round-4 head — signer ×2, zero rejections — the serialization claim does not observably cover concurrent requirement sets.",
    verdicts: [
      { id: "A1–A9 green zone", verdict: "PASS", tone: "pass" },
      { id: "A11 non-atomic-amount", verdict: "PASS (verified closed)", tone: "pass" },
      { id: "A10a binding-race (explicit)", verdict: "FAIL", tone: "fail" },
      { id: "A10b binding-race (first-accepted)", verdict: "FAIL", tone: "fail" },
    ],
    findings: [
      { id: "F-A10", severity: "high", text: "Binding race still open at PR head: two signatures 9/8 ms apart before any slot completes." },
      { id: "A11-closed", severity: "info", text: "Vendor fix verified: scoping to enabled amount expectations works as designed." },
    ],
    evidence: 8,
    links: [{ label: "PR #3920", href: "https://github.com/x402-foundation/x402/pull/3920" }],
  },
  {
    seq: "0009",
    date: "2026-10-28",
    type: "seal",
    title: "mcp-tool-idempotency external verification — v0.2.0 fixes hold (10/10)",
    subject: "tripl3tr3s/mcp-tool-idempotency (public repo, unmodified)",
    summary:
      "The cooperative model working end-to-end: three durability windows (lost response after commit, crash after commit, cross-instance race) reported via coordinated disclosure; the maintainer shipped owner-gated claim leases and released v0.2.0; the lab verified the fix with a ten-window battery — 10/10 PASS, suite 91/91 at tag. Credited in the project's SECURITY.md.",
    verdicts: [
      { id: "T1-Before (4d665ae)", verdict: "FAIL (SUT)", tone: "fail" },
      { id: "T1-W0..W6 (v0.2.0)", verdict: "PASS", tone: "pass" },
      { id: "T1-Suite", verdict: "PASS (91/91)", tone: "pass" },
    ],
    findings: [
      { id: "F1", severity: "low", text: "Lost response after commit: retry re-fires the committed side effect — documented at-least-once limit (‘failed executions are never cached’); fixed in v0.2.0." },
      { id: "F2", severity: "medium", text: "Crash after commit: dead holder's pending row unconditionally reset by the next caller — shares F3's root cause (missing liveness check), narrow crash window; fixed in v0.2.0." },
      { id: "F3", severity: "high", text: "Cross-instance race: claim loser resets the winner's LIVE pending row (fixed in v0.2.0)." },
    ],
    evidence: 5,
    links: [{ label: "mcp-tool-idempotency", href: "https://github.com/tripl3tr3s/mcp-tool-idempotency" }],
  },
  {
    seq: "0012",
    date: "2026-10-31",
    type: "seal",
    title: "S-BS-06 cycle 3 — PR #3920 @ e993bef re-pin re-run: green zone holds, A10c/d + A12/A13 PASS (17/19)",
    subject: "x402-foundation/x402",
    summary:
      "The re-pin re-run required by the acceptance protocol after the recipient-normalization commits: full 19-session re-run at e993bef, no head mixing. Green zone A1–A9 and the A11 fail-closed rejection are unchanged. Two NEW pre-registrations go green: conflicting-offer races A10c/A10d (one commitment + one pre-signer rejection — the in-thread requested discriminating control) and case-variant recipient A12/A13 (case spelling no longer mints a fresh quote key; raised case-variant rejected pre-signer). Identical-offer A10a/A10b continues the cycle-2 pre-registration for continuity — duplicate-payment semantics per the PR author's in-thread position, outside the quote-control layer's scope.",
    verdicts: [
      { id: "A1–A9 green zone", verdict: "PASS", tone: "pass" },
      { id: "A11 non-atomic-amount", verdict: "PASS (fail-closed)", tone: "pass" },
      { id: "A10a/A10b identical-offer race", verdict: "FAIL (continuity)", tone: "fail" },
      { id: "A10c/A10d conflicting-offer race", verdict: "PASS (NEW)", tone: "pass" },
      { id: "A12/A13 case-variant recipient", verdict: "PASS (NEW)", tone: "pass" },
    ],
    findings: [
      { id: "F-A10", severity: "high", text: "Identical-offer first-contact race persists at e993bef: signer ×2 (8/7 ms apart) before any slot completes; verdict continues the cycle-2 pre-registration for continuity — author's position: duplicate-payment semantics, out of quote-control scope; the discriminating control A10c/A10d passes." },
      { id: "C3-delta-verified", severity: "info", text: "A12/A13 verify the e993bef normalization delta: case-variant offers ride the canonicalized quote-ledger anchor — no false positive at unchanged amount; raised case-variant rejected pre-signer where case-sensitive cycle-2 keys would have signed as a fresh key." },
    ],
    evidence: 8,
    links: [{ label: "PR #3920", href: "https://github.com/x402-foundation/x402/pull/3920" }],
  },
  {
    seq: "0013",
    date: "2026-10-31",
    type: "seal",
    title: "Boundary: product layer moved private — public repository remains proof-only (registry + verification + site)",
    subject: "igor-vii/Argus-Agent-Test-Lab",
    summary:
      "The open-core boundary, sealed as a chain event. Engine, scenario library, SUT harnesses and engagement archives moved to a private repository (157 files, ~1.5 MB) — a forward-only split: no history rewrite, no force-push. The last public snapshot (efbf51e) is hash-pinned by a manifest, which is this record's evidence; every file that moved carries its sha256, so any future disclosure of product code stays verifiable against what was public. All 49 sealed evidence paths, the site, the verify tooling and everything referenced from public threads remain public and byte-identical.",
    verdicts: [
      { id: "proof-layer (registry + verify + site)", verdict: "PUBLIC", tone: "info" },
      { id: "product-layer (engine + scenarios + SUT)", verdict: "PRIVATE", tone: "info" },
      { id: "published-refs (#3866 fixtures, branches)", verdict: "PUBLIC (byte-identical)", tone: "info" },
    ],
    findings: [],
    evidence: 1,
    links: [
      { label: "manifest", href: "https://github.com/igor-vii/Argus-Agent-Test-Lab/blob/main/attestations/evidence/0013-boundary/product-layer-manifest.json" },
    ],
  },
];

export interface CaseStudy {
  vendor: string;
  target: string;
  version: string;
  headline: string;
  badges: { label: string; tone: Tone }[];
  points: string[];
  outcome: { label: string; tone: Tone };
  seals: string[];
  links: { label: string; href: string }[];
  quote?: { text: string; attribution: string };
}

export const CASES: CaseStudy[] = [
  {
    vendor: "x402-foundation",
    target: "x402 reference client + PR #3920 core",
    version: "@x402/core 2.28.0",
    headline: "Issue #3866 rounds 2–4 + PR #3920 cycles 1–3: A11 verified closed, conflicting-offer invariant holds, normalization delta verified.",
    badges: [
      { label: "A11 closed", tone: "pass" },
      { label: "A10c/d PASS", tone: "pass" },
      { label: "A10a/b open", tone: "fail" },
    ],
    points: [
      "Origin finding (#0000): the reference client signs any server-declared 402 amount.",
      "Round 2–4 engagement on issue #3866 with control batteries and delta probes.",
      "Cycle-2 at PR head b1a4d8ce: non-atomic amount rejection verified closed; binding race (signer ×2) reproduces.",
      "Cycle-3 at e993bef (17/19 PASS): conflicting-offer races A10c/A10d PASS — one commitment + one pre-signer rejection; case-variant recipient normalization A12/A13 PASS.",
      "Author accepted the cycle-3 results; remaining gate: upstream maintainer integration review.",
    ],
    outcome: { label: "Upstream engagement · cycles 1–3", tone: "pass" },
    seals: ["0000", "0003", "0004", "0008", "0012"],
    links: [
      { label: "Issue #3866", href: "https://github.com/x402-foundation/x402/issues/3866" },
      { label: "PR #3920", href: "https://github.com/x402-foundation/x402/pull/3920" },
    ],
  },
  {
    vendor: "BlockRunAI",
    target: "@blockrun/nano-client",
    version: "0.8.0 (npm exact pin)",
    headline: "A signature over the attacker's payTo, ×50 with no cap, and a README claim its own advice breaks.",
    badges: [
      { label: "3 FAIL", tone: "fail" },
      { label: "3 HOLD", tone: "hold" },
    ],
    points: [
      "F1: shape-only payTo check signs authorization over attacker-controlled recipient.",
      "F2: no default spend cap — ×50 of quoted price signed on default config.",
      "F3: lost-response dead-end; the README's own recovery advice routes into a double charge.",
      "Earlier report #15 closed as not planned; the sealed battery answers the closure premise.",
    ],
    outcome: { label: "Public · awaiting vendor", tone: "hold" },
    seals: ["0006"],
    links: [
      { label: "Issue #18", href: "https://github.com/BlockRunAI/blockrun-nano-client/issues/18" },
      { label: "Closure #15", href: "https://github.com/BlockRunAI/blockrun-nano-client/issues/15" },
    ],
  },
  {
    vendor: "Nevermined",
    target: "@nevermined-io/payments",
    version: "1.13.0 (npm exact pin)",
    headline: "Seven failures in credit and settlement handling — including a double charge on retry.",
    badges: [
      { label: "7 FAIL", tone: "fail" },
      { label: "1 DX", tone: "dx" },
      { label: "3 HOLD", tone: "hold" },
    ],
    points: [
      "F1: lost-response retry double-charges on the default token; no idempotency key, no settlement query.",
      "F2: single-use guard is per-process and reactive — concurrent race delivers a free service.",
      "F3: any settle failure except one special case delivers the resource unpaid — with a receipt.",
      "The class was already flagged in the vendor's own tracker (#374/#367, open since June); the battery makes it sealed and reproducible.",
    ],
    outcome: { label: "Sealed · publication ready", tone: "hold" },
    seals: ["0007"],
    links: [{ label: "nevermined-io/payments", href: "https://github.com/nevermined-io/payments" }],
  },
  {
    vendor: "Inngest",
    target: "inngest + @inngest/test",
    version: "4.26.0 / 1.0.0 (npm dist)",
    headline: "Thirteen probes, zero failures: behavior matches the vendor's own disclosure on every probe.",
    badges: [
      { label: "0 FAIL", tone: "pass" },
      { label: "2 DX", tone: "dx" },
    ],
    points: [
      "Commit-then-crash window verified live against the documented A3 model, including supervisor-restart variant.",
      "Event-ID dedup holds under a 12-way concurrent race; prescribed mitigations verified effective.",
      "Two developer-experience findings in the vendor's test engine; triaged upstream (Linear EXE-2315).",
      "Lab close-out with seal #0005 published to the issue thread on closure.",
    ],
    outcome: { label: "Closed · close-out published", tone: "pass" },
    seals: ["0005"],
    links: [{ label: "Issue #5091", href: "https://github.com/inngest/inngest/issues/5091" }],
  },
  {
    vendor: "tripl3tr3s",
    target: "mcp-tool-idempotency",
    version: "4d665ae → v0.2.0",
    headline: "Reported privately, fixed publicly, verified independently — credited in SECURITY.md.",
    badges: [
      { label: "3 fixed", tone: "pass" },
      { label: "10/10 verified", tone: "pass" },
    ],
    points: [
      "Three durability windows: lost response after commit, crash after commit, cross-instance race.",
      "Coordinated disclosure before publication; maintainer shipped owner-gated claim leases.",
      "Ten-window battery on v0.2.0: 10/10 PASS, suite 91/91 at tag.",
    ],
    outcome: { label: "Fixed · verified · credited", tone: "pass" },
    seals: ["0009"],
    links: [{ label: "mcp-tool-idempotency", href: "https://github.com/tripl3tr3s/mcp-tool-idempotency" }],
    // quote intentionally withheld from the landing per maintainer request
    // (one-pager v3 only, until the maintainer green-lights landing placement):
    // "Precise, reproducible, and respectful of my timeline: the report pinpointed
    // the root cause, and they independently verified the fix against the release.
    // It was a rapid, well-documented disclosure from start to finish."
    // — maintainer, mcp-tool-idempotency
  },
  {
    vendor: "AgentMiddleware",
    target: "amw-paypal-agent-demo",
    version: "live demo (Block D)",
    headline: "The lab's first live round — and the clean-machine reproduction that set the standard.",
    badges: [
      { label: "REPRODUCED", tone: "pass" },
      { label: "1 high finding", tone: "fail" },
    ],
    points: [
      "S10/S11 executed live against a real merchant agent demo with raw evidence captured.",
      "Independent clean-machine reproduction from committed sources: verdicts identical.",
      "The two-seal discipline (run + reproduction) applied ever since.",
    ],
    outcome: { label: "Live round · reproduced", tone: "pass" },
    seals: ["0001", "0002"],
    links: [{ label: "amw-paypal-agent-demo", href: "https://github.com/agentmiddleware/amw-paypal-agent-demo" }],
  },
];

export const METHOD_CARDS = [
  {
    title: "Black-box by construction",
    text: "The SUT is always the published artifact — npm dist, exact pin, unmodified. No source access, no vendor cooperation required. If it can't be shown against the artifact users actually install, it isn't shown.",
  },
  {
    title: "Verdict rules committed before the run",
    text: "Required behaviors and verdict semantics are fixed in committed battery fixtures before a probe fires; rollup matrices are finalized at receipt and carry full provenance — run commit, fixture, seal. No post-hoc reshaping of what a failure means — the rig can't drift toward the conclusion.",
  },
  {
    title: "Offline by default",
    text: "All traffic on 127.0.0.1 against adversarial stands and honest mock backends modeled from the vendor's own contracts, each decision citing a vendor source line. No vendor-operated service is touched without written authorization.",
  },
  {
    title: "Sealed and hash-chained",
    text: "Every record is signed with Ed25519 and chained to the previous record's hash. Anyone can verify the whole chain from the public repo in one command. Seals attest run validity and findings completeness — not bug-freeness.",
  },
];

export const TAXONOMY: { term: string; tone: Tone; text: string }[] = [
  { term: "FAIL", tone: "fail", text: "Vendor-side failure under the probe — the SDK or platform loses money or integrity under the tested fault." },
  { term: "HOLD", tone: "hold", text: "The SDK rejected or limited the fault — a genuine guard fired where the battery expected one." },
  { term: "PASS", tone: "pass", text: "The platform held beyond the documented scenarios." },
  { term: "OBSERVED", tone: "observed", text: "Observed behavior matches the vendor's published disclosure — an honest-posture result, not a defect." },
  { term: "DX", tone: "dx", text: "Developer-experience finding: no direct money-loss path, but the tooling hides a hazard the runtime itself flags." },
];

export const B2B_TRACKS = [
  {
    id: "A",
    title: "Coordinated production round",
    text: "You invited reproduction against production; we run it under written scope authorization: funded test wallet, agreed time window on 48 hours' notice, a no-debit/refund arrangement for probe transactions, full request capture shared with you. Deliverable: a sealed production-round report — either documenting that the production endpoint held against the full battery, or documenting the exact boundary where defects become live money movement.",
    meta: "from $990 / round",
  },
  {
    id: "B",
    title: "Fix verification",
    text: "Our batteries become your acceptance rig. You ship a patched artifact; we re-run the sealed suite against the published release and seal PASS/FAIL per finding. A clean seal is an independently checkable artifact you can cite to integrators and in your security narrative.",
    meta: "Per-finding sealed verdict",
  },
];

export const PRINCIPLES = [
  "Praise in public where it is earned — as loudly as failures get stated.",
  "Break in public where it is broken — with line numbers, not adjectives.",
  "Vendor responses get equal space alongside every published finding.",
  "No vendor operates our stands; no engagement buys a verdict.",
];
