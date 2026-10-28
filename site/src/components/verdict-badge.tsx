import type { Tone } from "@/lib/lab-data";

const TONE_STYLES: Record<Tone, string> = {
  fail: "border-red-400/30 bg-red-400/10 text-red-300",
  hold: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  pass: "border-al-accent/30 bg-al-accent/10 text-al-accent",
  observed: "border-al-muted/30 bg-al-muted/10 text-al-text/80",
  dx: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  info: "border-al-line bg-al-panel2 text-al-muted",
};

export function VerdictBadge({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider ${TONE_STYLES[tone]}`}
    >
      {label}
    </span>
  );
}

export function SeverityDot({ severity }: { severity: string }) {
  const color =
    severity === "high"
      ? "bg-red-400"
      : severity === "medium"
        ? "bg-amber-400"
        : severity === "low"
          ? "bg-zinc-400"
          : "bg-zinc-500";
  return <span className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${color}`} aria-hidden />;
}
