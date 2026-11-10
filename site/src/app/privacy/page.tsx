import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, REPO_URL } from "@/lib/lab-data";

export const metadata: Metadata = {
  title: "Privacy — Argus Agent Test Lab",
  description:
    "What the Argus lab collects, where it lives, what is public by design, which third parties are involved, and how to get data removed.",
  alternates: { canonical: "/privacy" },
};

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-10 font-mono text-[11px] uppercase tracking-widest text-al-accent/90">
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm leading-relaxed text-al-muted">{children}</p>;
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <p className="font-mono text-[11px] uppercase tracking-widest text-al-muted">legal</p>
      <h1 className="mt-2 font-mono text-2xl font-semibold tracking-wide text-al-text">Privacy</h1>
      <P>
        Short version: the lab collects what it needs to run batteries and bill honestly, keeps
        verdicts public by design, and does not sell data. This page applies to argus-lab.tech and
        console.argus-lab.tech.
      </P>
      <P>
        <Link href="/" className="underline decoration-al-line underline-offset-4 hover:text-al-text">
          ← back to argus-lab.tech
        </Link>
      </P>

      <H2>1. What we collect</H2>
      <P>
        Account email and an authentication session when you sign up to the console. Agent names
        and endpoint URLs you register for testing. Run parameters, reports and verdicts produced
        by your runs. Request captures taken during authorized production rounds — those are
        shared with you and treated as engagement material. Minimal operational telemetry
        (timestamps, quota usage) needed to run the service.
      </P>

      <H2>2. What is public by design</H2>
      <P>
        The registry is public: sealed verdicts and hash-pinned evidence are meant to be cited and
        verified by anyone. Seals contain no credentials or keys. Personal data appears in the
        registry only when an engagement explicitly publishes it (for example, a vendor&apos;s public
        response).
      </P>

      <H2>3. Where data lives</H2>
      <P>
        The site and console are hosted on Vercel. Run data lives in the console database. Seals
        are content-addressed and verifiable offline against the public repository — we cannot
        silently alter a published record.
      </P>

      <H2>4. Third parties</H2>
      <P>
        Vercel (hosting and edge network). Payment rails — USDC over x402 — only when billing is
        switched on; we never collect or store card data. Public registries that reference the
        lab&apos;s own public metadata (Glama, SealKeeper, the official MCP registry). Vercel
        Analytics for cookieless page-view counting.
      </P>

      <H2>5. What we never do</H2>
      <P>
        We do not sell data, do not run ads, and do not send marketing email to people who did not
        sign up. Console run data is not shared with vendors of the systems you test — your
        findings about your own agent stay yours.
      </P>

      <H2>6. Retention and deletion</H2>
      <P>
        Run reports are retained for the life of the account so that quota, refunds and seals stay
        auditable. You can request export or deletion of your account data at any time via the
        contacts below. Published seals are immutable by design; factual corrections ship as
        chained correction records instead of silent rewrites.
      </P>

      <H2>7. Contact</H2>
      <P>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="underline decoration-al-line underline-offset-4 hover:text-al-text"
        >
          {CONTACT_EMAIL}
        </a>{" "}
        or the public repository issues (
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-al-line underline-offset-4 hover:text-al-text"
        >
          github.com/igor-vii/Argus-Agent-Test-Lab
        </a>
        ).
      </P>
    </main>
  );
}
