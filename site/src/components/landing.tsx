"use client";

import { ChainExplorer } from "@/components/chain-explorer";
import { VerdictBadge } from "@/components/verdict-badge";
import { LangProvider, useLang, type Dict } from "@/lib/i18n";
import {
  REPO_URL,
  CONTACT_EMAIL,
  ONE_PAGER_PATH,
  CHAIN_HEAD,
  SEAL_COUNT,
  CASES,
  TAXONOMY,
} from "@/lib/lab-data";
import { GitBranch, FileCheck2, FileDown, ExternalLink, Terminal, Mail } from "lucide-react";
import type { ReactNode } from "react";

/* ---------------------------------- brand marks ---------------------------------- */

/* header wordmark sign — canonical geometry, 24–28px (ТЗ п.2) */
function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Argus Lab mark">
      <path
        d="M14 50 L32 12 L50 50"
        stroke="currentColor"
        strokeWidth="4.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 34.5 Q32 26 42 34.5 Q32 43 22 34.5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      {/* the only accent on the mark: the pupil */}
      <circle cx="32" cy="34.5" r="3.4" fill="#34D399" />
    </svg>
  );
}

/* hero sign — variant 02 «ink + pupil» (argus-logo-sheet-v3.png), 220–260px (ТЗ п.2) */
function HeroMark({ className = "w-[240px]" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="Argus Lab mark — monogram A with an open eye"
    >
      <path
        d="M14 50 L32 12 L50 50"
        stroke="#E9E7E2"
        strokeWidth="4.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 34.5 Q32 26 42 34.5 Q32 43 22 34.5 Z"
        fill="none"
        stroke="#E9E7E2"
        strokeWidth="3"
      />
      <circle cx="32" cy="34.5" r="3.4" fill="#34D399" />
    </svg>
  );
}

/* ---------------------------------- top bar ---------------------------------- */

function TopBar() {
  const { t, lang, setLang } = useLang();
  return (
    <header className="sticky top-0 z-50 border-b border-al-line bg-al-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="/" className="flex items-center gap-2.5" aria-label="Argus Lab — home">
          <LogoMark className="h-7 w-7 text-al-ink" />
          <span className="font-mono text-sm font-semibold tracking-widest text-al-text">
            ARGUS<span className="text-al-muted">·</span>LAB
          </span>
        </a>
        <nav className="hidden items-center gap-6 md:flex" aria-label="Sections">
          <a href="#registry" className="text-sm text-al-muted transition-colors hover:text-al-text">{t.nav.registry}</a>
          <a href="#method" className="text-sm text-al-muted transition-colors hover:text-al-text">{t.nav.method}</a>
          <a href="#cases" className="text-sm text-al-muted transition-colors hover:text-al-text">{t.nav.cases}</a>
          <a href="#engage" className="text-sm text-al-muted transition-colors hover:text-al-text">{t.nav.engage}</a>
        </nav>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center rounded-md border border-al-line font-mono text-[11px]"
            role="group"
            aria-label="Language"
          >
            {(["en", "ru"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={`px-2 py-1.5 uppercase transition-colors ${
                  lang === l
                    ? "rounded-md bg-al-panel2 text-al-ink"
                    : "text-al-muted hover:text-al-text"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <a
            href={ONE_PAGER_PATH}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1.5 rounded-md border border-al-line px-3 py-1.5 font-mono text-xs text-al-text transition-colors hover:border-al-muted sm:inline-flex"
          >
            <FileDown className="h-3.5 w-3.5" aria-hidden />
            One-pager (PDF)
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-md border border-al-line px-3 py-1.5 font-mono text-xs text-al-text transition-colors hover:border-al-muted"
          >
            <GitBranch className="h-3.5 w-3.5" aria-hidden />
            repo
          </a>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------ hero ------------------------------------ */

function Hero() {
  const { t } = useLang();
  const probeCount = "60+";
  const sutCount = new Set(CASES.map((c) => c.vendor + c.target)).size;
  const statValues = [SEAL_COUNT, sutCount, probeCount, 0];
  return (
    <section id="top" className="relative overflow-hidden">
      {/* faint grid backdrop — border-tone texture, not accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "linear-gradient(to right, #1C2B26 1px, transparent 1px), linear-gradient(to bottom, #1C2B26 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-24">
        {/* sign to the right of the heading on md+, centered brand block on mobile */}
        <div className="items-center gap-12 md:flex">
          <div className="min-w-0 flex-1">
            <p className="mb-4 font-mono text-xs uppercase tracking-[0.25em] text-al-muted">
              {t.hero.kicker}
            </p>
            <h1 className="max-w-4xl text-4xl font-bold leading-tight tracking-tight text-al-text sm:text-6xl">
              {t.hero.titleA}
              <br />
              {t.hero.titleB}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-al-muted">{t.hero.text}</p>
          </div>
          <div className="mt-10 flex shrink-0 justify-center md:mt-0 md:justify-end">
            <div className="relative">
              <div
                aria-hidden
                className="absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-al-accent/10 blur-2xl"
              />
              <HeroMark className="relative w-[160px] md:w-[220px] xl:w-[260px]" />
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a
            href="#registry"
            className="rounded-lg bg-al-ink px-5 py-2.5 text-sm font-semibold text-[#0B100D] transition-colors hover:bg-white"
          >
            {t.hero.ctaPrimary}
          </a>
          <a
            href="#engage"
            className="rounded-lg border border-al-line px-5 py-2.5 text-sm font-semibold text-al-text transition-colors hover:border-al-muted"
          >
            {t.hero.ctaSecondary}
          </a>
        </div>

        <dl className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-al-line bg-al-line sm:grid-cols-4">
          {t.hero.stats.map((s, i) => (
            <div key={s.v} className="bg-al-panel px-5 py-4">
              <dt className="sr-only">{s.v}</dt>
              <dd className="font-mono text-2xl font-semibold text-al-ink">{statValues[i]}</dd>
              <dd className="mt-1 text-xs text-al-muted">{s.v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ---------------------------------- registry ---------------------------------- */

function SectionHeading({ kicker, title, text }: { kicker: string; title: string; text: string }) {
  return (
    <div className="mb-10 max-w-3xl">
      <p className="mb-2 font-mono text-xs uppercase tracking-[0.25em] text-al-muted">{kicker}</p>
      <h2 className="text-2xl font-bold tracking-tight text-al-text sm:text-3xl">{title}</h2>
      <p className="mt-3 leading-relaxed text-al-muted">{text}</p>
    </div>
  );
}

function RegistrySection({ latest }: { latest: ReactNode }) {
  const { t } = useLang();
  return (
    <section id="registry" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20" aria-label="Attestation registry">
      <SectionHeading kicker={t.registry.kicker} title={t.registry.title} text={t.registry.text} />
      {/* LATEST SEAL — build-time static HTML (server component), newest record of the chain */}
      {latest}
      <div className="mt-6">
        <ChainExplorer />
      </div>
    </section>
  );
}

/* ---------------------------------- method ---------------------------------- */

function MethodSection() {
  const { t } = useLang();
  return (
    <section id="method" className="border-y border-al-line bg-al-band" aria-label="Methodology">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <SectionHeading kicker={t.method.kicker} title={t.method.title} text={t.method.text} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {t.method.cards.map((c, i) => (
            <article key={c.title} className="rounded-xl border border-al-line bg-al-panel p-5">
              <p className="mb-3 font-mono text-xs text-al-muted">0{i + 1}</p>
              <h3 className="mb-2 font-semibold text-al-text">{c.title}</h3>
              <p className="text-sm leading-relaxed text-al-muted">{c.text}</p>
            </article>
          ))}
        </div>

        {/* verdict taxonomy */}
        <div className="mt-10 rounded-xl border border-al-line bg-al-panel p-5 sm:p-6">
          <h3 className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-al-muted">
            <Terminal className="h-4 w-4" aria-hidden /> {t.method.taxonomyTitle}
          </h3>
          <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {TAXONOMY.map((term, i) => (
              <div key={term.term} className="flex items-start gap-3">
                <dt className="shrink-0 pt-0.5">
                  <VerdictBadge label={term.term} tone={term.tone} />
                </dt>
                <dd className="text-sm leading-relaxed text-al-muted">{t.method.taxonomy[i]?.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------- cases ----------------------------------- */

function caseAnchor(vendor: string) {
  return `case-${vendor.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function CasesSection() {
  const { t } = useLang();
  return (
    <section id="cases" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20" aria-label="Case studies">
      <SectionHeading kicker={t.cases.kicker} title={t.cases.title} text={t.cases.text} />
      <div className="grid gap-4 lg:grid-cols-2">
        {CASES.map((c) => (
          <article
            key={c.vendor + c.target}
            id={caseAnchor(c.vendor)}
            className="flex scroll-mt-20 flex-col rounded-xl border border-al-line bg-al-panel p-5 sm:p-6"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-al-text">{c.vendor}</h3>
                <p className="font-mono text-[11px] text-al-muted">
                  {c.target} · {c.version}
                </p>
              </div>
              <div className="flex gap-1.5">
                {c.badges.map((b) => (
                  <VerdictBadge key={b.label} label={b.label} tone={b.tone} />
                ))}
              </div>
            </div>

            <p className="mb-4 text-sm font-medium leading-relaxed text-al-text">{c.headline}</p>

            <ul className="mb-4 space-y-1.5 text-sm leading-relaxed text-al-muted">
              {c.points.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-al-muted/60" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>

            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-al-line pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-al-muted/70">seals</span>
                {c.seals.map((s) => (
                  <span key={s} className="rounded border border-al-line px-1.5 py-0.5 font-mono text-[10px] text-al-muted">
                    #{s}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                {c.links.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-xs text-al-text underline decoration-al-muted/40 underline-offset-4 transition-colors hover:decoration-al-text"
                  >
                    {l.label} <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ))}
              </div>
            </div>

            <p className="mt-3">
              <VerdictBadge label={c.outcome.label} tone={c.outcome.tone} />
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------ B2B ------------------------------------ */

function EngageSection() {
  const { t } = useLang();
  const tracks: Dict["engage"]["tracks"] = t.engage.tracks;
  return (
    <section id="engage" className="border-t border-al-line bg-al-band" aria-label="Engagement">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <SectionHeading kicker={t.engage.kicker} title={t.engage.title} text={t.engage.text} />
        <div className="grid gap-4 md:grid-cols-2">
          {tracks.map((tr) => (
            <article key={tr.title} className="flex flex-col rounded-xl border border-al-line bg-al-panel p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-al-line bg-al-panel2 font-mono text-sm text-al-ink">
                  {tr === tracks[0] ? "A" : "B"}
                </span>
                <h3 className="text-lg font-semibold text-al-text">{tr.title}</h3>
              </div>
              <p className="mb-5 text-sm leading-relaxed text-al-muted">{tr.text}</p>
              <p className="mt-auto">
                <VerdictBadge label={tr.meta} tone="pass" />
              </p>
            </article>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-al-line bg-al-panel p-5 sm:p-6">
          <h3 className="mb-4 font-mono text-xs uppercase tracking-widest text-al-muted">{t.engage.termsTitle}</h3>
          <ul className="grid gap-2 text-sm text-al-muted md:grid-cols-2">
            {t.engage.terms.map((term, i) => (
              <li key={i} className="flex gap-2">
                <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-al-muted" aria-hidden />
                {term}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-al-ink px-5 py-2.5 text-sm font-semibold text-[#0B100D] transition-colors hover:bg-white"
            >
              <GitBranch className="h-4 w-4" aria-hidden />
              {t.engage.ctaGitHub}
            </a>
            <a
              href={ONE_PAGER_PATH}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-al-line px-5 py-2.5 text-sm font-semibold text-al-text transition-colors hover:border-al-muted"
            >
              <FileDown className="h-4 w-4" aria-hidden />
              {t.engage.ctaOnePager}
            </a>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex items-center gap-1.5 font-mono text-xs text-al-muted underline decoration-al-line underline-offset-4 transition-colors hover:text-al-text"
            >
              <Mail className="h-3.5 w-3.5" aria-hidden />
              {CONTACT_EMAIL}
            </a>
          </div>
          <p className="mt-3 font-mono text-[11px] text-al-muted/70">{t.engage.contactNote}</p>
        </div>

        {/* principles */}
        <ul className="mt-10 grid gap-3 md:grid-cols-2">
          {t.engage.principles.map((p, i) => (
            <li key={i} className="flex items-start gap-3 rounded-lg border border-al-line bg-al-panel px-4 py-3 text-sm leading-relaxed text-al-text">
              <span className="mt-0.5 font-mono text-xs text-al-muted">§{i + 1}</span>
              {p}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ----------------------------------- footer ----------------------------------- */

function Footer() {
  const { t } = useLang();
  return (
    <footer className="mt-auto border-t border-al-line bg-al-bg">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <p className="flex items-center gap-2 font-mono text-sm font-semibold tracking-widest text-al-text">
            <LogoMark className="h-4 w-4 text-al-ink" />
            ARGUS<span className="text-al-muted">·</span>LAB
          </p>
          <p className="mt-1 max-w-md text-xs text-al-muted">{t.footer.tagline}</p>
          {/* contacts: X · TG · mail (ТЗ п.5) */}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-al-muted">
            <a
              href="https://x.com/INGVAR29007836"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-al-line underline-offset-4 transition-colors hover:text-al-text"
            >
              X @INGVAR29007836
            </a>
            <span className="text-al-line">·</span>
            <a
              href="https://t.me/IVANOVVII"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-al-line underline-offset-4 transition-colors hover:text-al-text"
            >
              TG @IVANOVVII
            </a>
            <span className="text-al-line">·</span>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="underline decoration-al-line underline-offset-4 transition-colors hover:text-al-text"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
        <div className="font-mono text-[11px] leading-relaxed text-al-muted">
          <p>
            {t.footer.chainHead} <span className="text-al-accent/80">{CHAIN_HEAD}…</span> · {SEAL_COUNT} {t.footer.records} · Ed25519
          </p>
          <p className="mt-1">
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="underline decoration-al-line underline-offset-4 transition-colors hover:text-al-text">
              github.com/igor-vii/Argus-Agent-Test-Lab
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ---------------------------------- JSON-LD ---------------------------------- */

function StructuredData() {
  const SITE_URL = "https://argus-lab.dev";
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}#org`,
        name: "Argus Agent Test Lab",
        alternateName: "Argus Lab",
        url: SITE_URL,
        logo: `${SITE_URL}/logo.svg`,
        description:
          "Independent black-box adversarial testing lab for agentic payment rails. Every verdict is an Ed25519-sealed record in a public hash chain.",
        sameAs: [REPO_URL, "https://x.com/INGVAR29007836"],
        contactPoint: {
          "@type": "ContactPoint",
          email: CONTACT_EMAIL,
          contactType: "technical",
        },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}#site`,
        url: SITE_URL,
        name: "Argus Agent Test Lab",
        publisher: { "@id": `${SITE_URL}#org` },
        inLanguage: "en",
      },
      {
        "@type": "ItemList",
        name: "Argus attestation registry",
        description: `Ed25519-signed attestation chain, ${SEAL_COUNT} records, chain head ${CHAIN_HEAD}.`,
        numberOfItems: SEAL_COUNT,
        itemListElement: CASES.flatMap((c) =>
          c.seals.map((seq) => ({
            "@type": "ListItem",
            position: parseInt(seq, 10) + 1,
            name: `#${seq} — sealed record`,
            url: `${REPO_URL}/tree/main/attestations/records`,
          }))
        ),
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

/* ------------------------------------ page ------------------------------------ */

function LandingShell({ latest }: { latest: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-al-bg text-al-text selection:bg-al-line">
      <StructuredData />
      <TopBar />
      <main>
        <Hero />
        <RegistrySection latest={latest} />
        <MethodSection />
        <CasesSection />
        <EngageSection />
      </main>
      <Footer />
    </div>
  );
}

export default function Landing({ latest }: { latest: ReactNode }) {
  return (
    <LangProvider>
      <LandingShell latest={latest} />
    </LangProvider>
  );
}
