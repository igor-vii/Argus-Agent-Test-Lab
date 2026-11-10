import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, REPO_URL } from "@/lib/lab-data";

export const metadata: Metadata = {
  title: "Terms — Argus Agent Test Lab",
  description:
    "Terms for argus-lab.tech and console.argus-lab.tech: open beta status, payments and refunds, consent and opt-out, what a seal attests, no warranty.",
  alternates: { canonical: "/terms" },
};

function H2({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="mt-10 font-mono text-[11px] uppercase tracking-widest text-al-accent/90"
    >
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm leading-relaxed text-al-muted">{children}</p>;
}

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <p className="font-mono text-[11px] uppercase tracking-widest text-al-muted">legal</p>
      <h1 className="mt-2 font-mono text-2xl font-semibold tracking-wide text-al-text">Terms</h1>
      <P>
        Applies to argus-lab.tech and the self-service console at console.argus-lab.tech
        (including its MCP endpoint). Versioned in the public repository — material changes ship
        as ordinary commits, so the history of these terms is auditable.
      </P>
      <P>
        <Link href="/" className="underline decoration-al-line underline-offset-4 hover:text-al-text">
          ← back to argus-lab.tech
        </Link>
      </P>

      <H2>1. What this service is</H2>
      <P>
        Argus Agent Test Lab runs pre-registered, black-box adversarial batteries against AI
        agents that move money — and against the payment rails and SDKs they rely on. The
        self-service console lets you register your own agent endpoint and run the same style of
        battery against it under a money-guard policy. Every verdict is an Ed25519-signed record
        chained to the hash of its predecessor in a public registry.
      </P>

      <H2>2. Open beta — nothing is charged</H2>
      <P>
        The console is in open beta: checkout is switched off and no payment method is collected.
        While the beta window lasts, you cannot be billed. Paid tiers go live only after the beta
        period closes, and prices are shown in the console before anything can be purchased.
      </P>

      <H2>3. Paid runs and refunds (after beta)</H2>
      <P>
        When billing switches on: engine quota is purchased up front, and every engine run is
        consumed from that quota before it starts. A run whose agent fails the canonical payment
        gate stops before the battery begins and is refunded in full (net cost 0). Runs that
        execute past the gate are non-refundable, except for infrastructure failures on our side,
        which are refunded automatically.
      </P>

      <H2 id="consent">4. Consent and opt-out</H2>
      <P>
        The lab does not test services we do not have permission to test. Offline batteries run on
        127.0.0.1 against adversarial stands and honest mock backends modeled from the vendor&apos;s
        own published contracts. No vendor-operated endpoint is touched without written
        authorization. Self-service engine runs go only to endpoints that the account owner
        registers.
      </P>
      <P>
        If you believe a public record concerns your service and you object to it, contact us.
        Vendor responses are published with equal space next to any finding, and factual
        corrections ship as chained correction records — nothing in the registry is silently
        rewritten.
      </P>

      <H2>5. What a seal attests</H2>
      <P>
        A seal attests run validity and findings completeness — not the absence of bugs. Anyone
        can verify the whole chain from the public repository in one command; verification
        instructions live in the repository README.
      </P>

      <H2>6. Acceptable use</H2>
      <P>
        Use the console only against endpoints you own or are authorized to test. Do not register
        third-party endpoints without their permission. Do not use the lab to attack, defraud or
        harass anyone.
      </P>

      <H2>7. No warranty; liability</H2>
      <P>
        The service and all records are provided &quot;as is&quot;. Verdicts are evidence, not advice or
        certification. To the maximum extent permitted by law, the lab&apos;s liability for the
        self-service console is limited to the fees you actually paid for the affected run quota.
        For commissioned engagements, the signed written scope prevails over this page.
      </P>

      <H2>8. Contact and changes</H2>
      <P>
        Questions, objections and deletion requests:{" "}
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
