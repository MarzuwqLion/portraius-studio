import type { ReactNode } from "react";
import { band, type Band } from "@/lib/identity/score";
import { cn } from "@/lib/utils";
import { GreaseCircle, GreaseStrike } from "./GreaseMark";

// A take: one output shown as a print at its true aspect ratio, on Studio
// grey (spec: Visual direction, Layout). It develops in when its image lands.
export function Take({
  src,
  alt,
  aspect,
  picked = false,
  rejected = false,
  onPick,
  pickLabel,
  seed,
  children,
  className,
}: {
  src?: string;
  alt: string;
  aspect: string; // CSS aspect-ratio, e.g. "4 / 5"
  picked?: boolean;
  rejected?: boolean;
  onPick?: () => void;
  pickLabel?: string;
  seed?: number;
  children?: ReactNode; // status text while the image isn't ready
  className?: string;
}) {
  // The marks circle the print only; the pick's words sit under it.
  const print = (
    <span className="relative block">
      <span className="relative block w-full overflow-hidden rounded-media border border-rule bg-seamless" style={{ aspectRatio: aspect }}>
        {src ? (
          <img src={src} alt={alt} className="develop absolute inset-0 size-full object-contain" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center p-3 text-center text-control text-on-seamless">{children}</span>
        )}
      </span>
      {picked && <GreaseCircle seed={seed} />}
      {rejected && <GreaseStrike />}
    </span>
  );
  // Every pick says so in words: the mark is only 2.4:1 on light Studio grey
  // (spec: Signature: grease-pencil marks).
  const selected = picked && <SelectedLabel />;
  if (!onPick) {
    return (
      <figure className={cn("relative", className)}>
        {print}
        {selected}
      </figure>
    );
  }
  return (
    <button type="button" onClick={onPick} aria-pressed={picked} aria-label={pickLabel ?? alt} className={cn("relative block w-full rounded-media text-left", className)}>
      {print}
      {selected}
    </button>
  );
}

export function SelectedLabel() {
  return <span className="mt-3 inline-flex rounded-control bg-proof px-2 py-0.5 text-control font-semibold text-ink">✓ Selected</span>;
}

const BAND_TEXT: Record<Band, { label: string; className: string }> = {
  match: { label: "Strong match", className: "text-match" },
  check: { label: "Check", className: "text-check" },
  drift: { label: "Drift", className: "text-drift" },
};

// An identity score, coloured by band. It sits in its own proof chip, since
// the band colours only reach their contrast targets on proof, not on Studio grey.
const chip = "inline-flex items-baseline gap-2 rounded-control bg-proof px-2 py-0.5";

export function ScoreBadge({ score, note }: { score: number | null | undefined; note?: string }) {
  if (score === undefined) return <span className={cn(chip, "text-control text-ink-muted")}>Scoring</span>;
  if (score === null) return <span className={cn(chip, "text-control text-ink-muted")}>{note ?? "No face found to score"}</span>;
  const b = BAND_TEXT[band(score)];
  return (
    <span className={chip}>
      <span className={cn("font-display text-panel font-extrabold", b.className)}>{score}</span>
      <span className={cn("text-control font-semibold", b.className)}>{b.label}</span>
    </span>
  );
}
