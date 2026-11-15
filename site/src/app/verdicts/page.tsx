import type { Metadata } from "next";
import Link from "next/link";
import { VerdictBadge } from "@/components/verdict-badge";
import type { Tone } from "@/lib/lab-data";
import catalog from "@/data/seals-catalog.json";

export const metadata: Metadata = {
  title: "How to read a verdict — Argus Agent Test Lab",
  description:
    "A lab verdict is three layers, not one stamp: run state, per-probe verdicts, and an honest classification. Worked examples from sealed records #0006 and #0005, in English and Russian.",
  alternates: { canonical: "/verdicts" },
};

type SealRecord = (typeof catalog)[number];

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-10 font-mono text-[11px] uppercase tracking-widest text-al-accent/90">
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-6 font-mono text-sm font-semibold tracking-wide text-al-text">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm leading-relaxed text-al-muted">{children}</p>;
}

function Layer({ n, name, children }: { n: string; name: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-lg border border-al-line bg-al-panel2 p-4">
      <p className="font-mono text-[11px] uppercase tracking-widest text-al-muted">layer {n}</p>
      <h3 className="mt-1 font-mono text-sm font-semibold tracking-wide text-al-text">{name}</h3>
      <div className="mt-2 text-sm leading-relaxed text-al-muted">{children}</div>
    </div>
  );
}

function SealCard({ seal }: { seal: SealRecord }) {
  return (
    <div className="mt-4 rounded-lg border border-al-line bg-al-panel2 p-4">
      <p className="font-mono text-[11px] uppercase tracking-widest text-al-muted">
        seal #{seal.seq} · {seal.date} · {seal.subject}
      </p>
      <h3 className="mt-1 text-sm font-semibold text-al-text">{seal.title}</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {seal.verdicts.map((v) => (
          <VerdictBadge key={v.id} label={`${v.id}: ${v.verdict}`} tone={v.tone as Tone} />
        ))}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-al-muted">{seal.summary}</p>
      {seal.links?.[0] && (
        <p className="mt-3">
          <a
            href={seal.links[0].href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs underline decoration-al-line underline-offset-4 hover:text-al-text"
          >
            {seal.links[0].label} ↗
          </a>
        </p>
      )}
    </div>
  );
}

const WORKED = ["0006", "0005"].map(
  (seq) => catalog.find((r) => r.seq === seq) as SealRecord,
);

export default function VerdictsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <p className="font-mono text-[11px] uppercase tracking-widest text-al-muted">methodology</p>
      <h1 className="mt-2 font-mono text-2xl font-semibold tracking-wide text-al-text">
        How to read a verdict
      </h1>
      <P>
        A lab verdict is not a single pass/fail stamp. Every sealed record in the registry reads in
        three layers, and conflating them is the most common misreading of the lab&apos;s work. This
        page walks through the layers using two real seals, then shows how to verify both offline.
      </P>
      <P>
        <Link href="/" className="underline decoration-al-line underline-offset-4 hover:text-al-text">
          ← back to argus-lab.tech
        </Link>
      </P>

      <H2>1. Three layers, one outcome</H2>
      <Layer n="1" name="Run state — what executed">
        What physically happened: how many probes ran, which captures were taken, how much evidence
        was sealed. A run state of COMPLETE means the battery finished — it says{" "}
        <em>nothing</em> about whether the target passed. A complete run can end in three failures;
        an incomplete run proves nothing either way.
      </Layer>
      <Layer n="2" name="Verdicts — per-probe results">
        Each probe gets its own verdict: FAIL, PASS, HOLD or OBSERVED. HOLD is the honest middle: an
        effect was reproduced but attribution is not settled yet. OBSERVED marks behavior verified
        beyond the documented scenario without failing anything.
      </Layer>
      <Layer n="3" name="Classification — what it means">
        Who owns the finding and what it is: vendor-side, test-side, or the deliberate{" "}
        <span className="font-mono text-xs">DELIVERY_UNKNOWN</span> — the state where the lab
        refuses to claim more than it can prove. A seller&apos;s response is a claim, not proof of
        receipt; absence of evidence is not evidence of absence. This layer is where the lab states
        the boundary of its own knowledge.
      </Layer>

      <H2>2. Worked example — seal #0006, a failing battery</H2>
      <SealCard seal={WORKED[0]} />
      <P>
        Read in three layers: the run completed against the published SDK; the verdict layer shows
        three vendor-side FAILs with the three control probes HOLD; the classification puts P1–P3 on
        the vendor (a shape-only payTo check, a missing default spend cap, a lost-response dead-end
        whose only exit mints a second economic execution) while recording that the genuine guards
        — decimal normalization, contract pin, replay window — hold.
      </P>
      <P>
        Evidence comes in two kinds. DERIVED evidence — the six sealed artifacts: logs, captures,
        reproduction scripts — is reproducible by anyone from the sealed hashes. EXTERNAL evidence —
        the vendor&apos;s public issue thread — is labeled as claims: it counts toward context, never
        toward proof. That separation is why the record can say &quot;three failures, vendor-side&quot;
        and still not claim what the vendor intends to do about it.
      </P>

      <H2>3. Worked example — seal #0005, a clean battery</H2>
      <SealCard seal={WORKED[1]} />
      <P>
        Thirteen probes, zero failures — and the record still does not say &quot;the target is
        correct&quot; in general. It says exactly what was probed, that everything held beyond the
        documented scenarios or matched the vendor&apos;s published disclosure, and it files two
        developer-experience findings in the vendor&apos;s own test engine. OBSERVED here means
        verified against the disclosed model, including a supervisor-restart variant — not
        &quot;looks fine&quot;. The close-out was published to the vendor&apos;s issue thread on
        closure, so the EXTERNAL stream carries the lab&apos;s own statement, not just vendor claims.
      </P>

      <H2>4. Badge legend</H2>
      <div className="mt-4 space-y-2">
        {[
          ["pass", "Verified working within the probed boundary."],
          ["fail", "Reproduced defect with sealed evidence; owner stated in the classification."],
          ["hold", "Effect reproduced, attribution not settled — the honest middle."],
          ["dx", "Developer-experience finding: real friction, not a security failure."],
        ].map(([tone, meaning]) => (
          <div key={tone} className="flex flex-wrap items-center gap-3">
            <VerdictBadge label={tone.toUpperCase()} tone={tone as Tone} />
            <span className="text-sm text-al-muted">{meaning}</span>
          </div>
        ))}
      </div>

      <H2>5. Verify it yourself</H2>
      <P>
        Seals are content-addressed: the record hash pins the title, verdicts, findings and evidence
        count, so a published record cannot be silently edited — corrections ship as chained
        correction records. To verify the whole registry offline:
      </P>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-al-line bg-al-panel2 p-4 font-mono text-xs leading-relaxed text-al-muted">
        <code>{`git clone https://github.com/igor-vii/Argus-Agent-Test-Lab
cd Argus-Agent-Test-Lab
node tools/registry/verify-registry.mjs   # -> 23/23 PASS`}</code>
      </pre>
      <P>
        If the command prints 23/23, every seal on this site matches the sealed artifacts in the
        public repository — the registry and the site cannot drift.
      </P>

      <H2>Как читать вердикт (RU)</H2>
      <P>
        Вердикт лаборатории — это три слоя, а не одна печать «прошёл/не прошёл». Слой 1 — состояние
        прогона: что физически выполнилось и сколько артефактов запечатано; COMPLETE означает, что
        батарея завершилась, и не говорит ничего о качестве цели. Слой 2 — вердикты по пробам: FAIL,
        PASS, HOLD или OBSERVED, где HOLD — честная середина: эффект воспроизведён, но
        атрибуция ещё не установлена. Слой 3 — классификация: кто владеет находкой и где проходит
        граница знания лаборатории; состояние DELIVERY_UNKNOWN означает «мы не можем доказать, что
        произошло»: ответ продавца — это заявление, а не доказательство получения, а отсутствие
        доказательств — не доказательство отсутствия.
      </P>
      <P>
        Примеры выше — настоящие записи из реестра: печать #0006 (три отказа на стороне вендора при
        трёх удержанных контролелях) и печать #0005 (тринадцать проб без единого отказа, два DX-замечания).
        Выверить реестр можно офлайн той же командой из раздела 5.
      </P>
    </main>
  );
}
