/**
 * LATEST SEAL — static, indexable HTML rendered from build-time data.
 * Data source: src/data/latest-seal.json, produced by scripts/gen-latest-seal.mjs
 * (runs verify-registry.mjs first; a broken chain fails the build, so this block
 * can never show an unverified seal). No client JS, no fetch — readable by
 * GPTBot / ClaudeBot / PerplexityBot and every search crawler.
 */
import latest from "@/data/latest-seal.json";
import { REPO_URL } from "@/lib/lab-data";
import type { Tone } from "@/lib/lab-data";
import { VerdictBadge } from "@/components/verdict-badge";

const short = (hash: string | null, n = 8) => (hash ? hash.slice(0, n) : "—");

export function LatestSealBlock() {
  const rec = latest.record;
  const evidenceBase = `${REPO_URL}/blob/main/`;

  return (
    <article
      aria-label={`Latest seal #${rec.seq}: ${rec.title}`}
      className="rounded-2xl border border-al-line bg-al-panel"
    >
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-al-line px-5 py-3 sm:px-6">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-al-muted">
          latest seal
        </p>
        <p className="font-mono text-[11px] text-al-muted">
          <span className="text-al-accent">registry intact</span> · {latest.verify.records} records ·{" "}
          <a
            href={`${REPO_URL}/blob/main/tools/registry/verify-registry.mjs`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-al-line underline-offset-4 transition-colors hover:text-al-text"
          >
            verify-registry.mjs ↗
          </a>
        </p>
      </div>

      <div className="p-5 sm:p-6">
        {/* id line */}
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono text-xs text-al-text">
            {rec.record_id}
          </span>
          <span className="font-mono text-[11px] text-al-muted">{rec.date}</span>
          <span className="font-mono text-[11px] text-al-muted">{rec.subject}</span>
        </div>

        <h3 className="mb-4 max-w-4xl text-lg font-semibold leading-snug text-al-text">
          {rec.title}
        </h3>

        {/* verdict badges — the accent lives here, where it belongs */}
        <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-al-muted">verdicts</p>
        <div className="mb-5 flex flex-wrap gap-1.5">
          {rec.scenarios.map((s) => (
            <VerdictBadge
              key={s.id}
              label={`${s.id}: ${s.verdict}`}
              tone={s.tone as Tone}
            />
          ))}
        </div>

        {/* hash chain */}
        <p className="mb-5 font-mono text-xs leading-relaxed text-al-muted">
          chain{" "}
          <span className="text-al-text">{short(rec.prev_record_hash)}</span>
          {" → "}
          <span className="text-al-text">{short(rec.chain_head)}</span>{" "}
          <span className="text-al-accent" aria-label="chain verified">✓</span>
          {" · "}Ed25519 · prev_record_hash → chain head
        </p>

        {/* evidence buttons */}
        <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-al-muted">
          hash-pinned evidence ({rec.evidence.length})
        </p>
        <div className="flex flex-wrap gap-2">
          {rec.evidence.map((e) => {
            const name = e.path.split("/").pop() ?? e.path;
            return (
              <a
                key={e.path}
                href={`${evidenceBase}${e.path}`}
                target="_blank"
                rel="noopener noreferrer"
                title={`${evidenceBase}${e.path}`}
                className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-al-line bg-al-panel2 px-2.5 py-1.5 font-mono text-[11px] text-al-muted transition-colors hover:border-al-muted hover:text-al-text"
              >
                <span className="text-al-accent/80" aria-hidden>⛭</span>
                {name}
              </a>
            );
          })}
        </div>
      </div>

      {/* verify line — one command, public */}
      <div className="border-t border-al-line px-5 py-3 sm:px-6">
        <p className="font-mono text-[11px] leading-relaxed text-al-muted">
          <span className="text-al-muted/60">$</span> git clone {REPO_URL.replace("https://", "")} && node
          tools/registry/verify-registry.mjs{"  "}
          <span className="text-al-muted/60">→</span>{" "}
          <span className="text-al-accent">registry intact: {latest.verify.records} records, chain head {short(latest.verify.chain_head)}…</span>
        </p>
      </div>
    </article>
  );
}
