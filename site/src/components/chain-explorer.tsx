"use client";

import { useState } from "react";
import { SEALS, CHAIN_HEAD, RECORD_COUNT, REPO_URL, type Seal } from "@/lib/lab-data";
import { VerdictBadge, SeverityDot } from "@/components/verdict-badge";

function SealNode({
  seal,
  active,
  onClick,
  isLast,
}: {
  seal: Seal;
  active: boolean;
  onClick: () => void;
  isLast: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Seal #${seal.seq}: ${seal.title}`}
      className="group flex shrink-0 flex-col items-center gap-2 focus:outline-none"
    >
      <span
        className={`font-mono text-[10px] tracking-widest transition-colors ${
          active ? "text-al-accent" : "text-al-muted group-hover:text-al-text"
        }`}
      >
        #{seal.seq}
      </span>
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all ${
          active
            ? "border-al-accent bg-al-accent/15 shadow-[0_0_16px_rgba(52,211,153,0.35)]"
            : "border-al-line bg-al-panel2 group-hover:border-al-muted"
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${active ? "bg-al-accent" : "bg-al-muted/50 group-hover:bg-al-muted"}`} />
      </span>
      <span className={`h-px w-10 sm:w-14 ${isLast ? "bg-transparent" : active ? "bg-al-accent/40" : "bg-al-line"}`} />
    </button>
  );
}

export function ChainExplorer() {
  const [selected, setSelected] = useState<Seal>(SEALS[SEALS.length - 1]);

  return (
    <div className="rounded-2xl border border-al-line bg-al-panel">
      {/* terminal header */}
      <div className="flex items-center justify-between border-b border-al-line px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
          <span className="ml-3 font-mono text-xs text-al-muted">attestations/records — hash chain explorer</span>
        </div>
        <span className="hidden font-mono text-[11px] text-al-muted sm:block">
          head <span className="text-al-accent">{CHAIN_HEAD}…</span>
        </span>
      </div>

      {/* chain */}
      <div className="overflow-x-auto px-5 pt-6 pb-2 [scrollbar-width:thin]">
        <div className="flex min-w-max items-start justify-between sm:justify-start sm:gap-1">
          {SEALS.map((s, i) => (
            <SealNode
              key={s.seq}
              seal={s}
              active={s.seq === selected.seq}
              isLast={i === SEALS.length - 1}
              onClick={() => setSelected(s)}
            />
          ))}
        </div>
      </div>

      {/* detail panel */}
      <div className="border-t border-al-line p-5 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono text-xs text-al-text">
            {selected.type === "finding" ? "argus-finding" : "argus-seal"}-{selected.seq}
          </span>
          <span className="font-mono text-[11px] text-al-muted">{selected.date}</span>
          <span className="truncate font-mono text-[11px] text-al-muted">{selected.subject}</span>
        </div>

        <h3 className="mb-2 text-lg font-semibold text-al-text">{selected.title}</h3>
        <p className="mb-4 max-w-3xl text-sm leading-relaxed text-al-muted">{selected.summary}</p>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-al-muted">verdicts</p>
            <div className="flex flex-wrap gap-1.5">
              {selected.verdicts.map((v) => (
                <VerdictBadge key={v.id} label={`${v.id}: ${v.verdict}`} tone={v.tone} />
              ))}
            </div>
            <p className="mt-3 font-mono text-[11px] text-al-muted/70">
              {selected.evidence} hash-pinned evidence file{selected.evidence === 1 ? "" : "s"}
            </p>
          </div>

          <div>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-al-muted">findings</p>
            {selected.findings.length === 0 ? (
              <p className="font-mono text-xs text-al-muted/70">— none recorded on this record —</p>
            ) : (
              <ul className="space-y-1.5">
                {selected.findings.map((f) => (
                  <li key={f.id} className="flex gap-2 text-xs leading-relaxed text-al-muted">
                    <SeverityDot severity={f.severity} />
                    <span>
                      <span className="font-mono text-al-text">{f.id}</span>{" "}
                      <span className="font-mono text-al-muted/70">({f.severity})</span> {f.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {selected.links && selected.links.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {selected.links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-al-text underline decoration-al-muted/40 underline-offset-4 transition-colors hover:decoration-al-text"
              >
                {l.label} ↗
              </a>
            ))}
          </div>
        )}
      </div>

      {/* verify line — chain ok is a status: accent allowed here */}
      <div className="border-t border-al-line px-5 py-3">
        <p className="font-mono text-[11px] leading-relaxed text-al-muted">
          <span className="text-al-muted/60">$</span> node tools/registry/verify-registry.mjs{"  "}
          <span className="text-al-muted/60">→</span> <span className="text-al-accent">registry intact: {RECORD_COUNT} records, chain head {CHAIN_HEAD}…</span>{" "}
          <a href={`${REPO_URL}/tree/main/attestations/records`} target="_blank" rel="noopener noreferrer" className="ml-2 text-al-text underline decoration-al-muted/40 underline-offset-4 transition-colors hover:decoration-al-text">
            records ↗
          </a>
        </p>
      </div>
    </div>
  );
}
