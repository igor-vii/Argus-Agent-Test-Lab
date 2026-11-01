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
import sealsCatalog from "@/data/seals-catalog.json";

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

/**
 * SEALS is generated, not hand-maintained: site/scripts/gen-seals-catalog.mjs
 * maps the sealed registry (attestations/records/, after a full
 * verify-registry.mjs pass) into src/data/seals-catalog.json; optional
 * editorial wording lives in src/data/seals-editorial.json (keyed by seq).
 * CI regenerates the catalog on every push — new seals reach the chain
 * explorer with zero manual site edits.
 */
export const SEALS = sealsCatalog as Seal[];


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
