import type { ReactNode } from "react";
import { Popover } from "radix-ui";
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
  fit = "contain",
  selectedLabel = true,
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
  fit?: "contain" | "cover"; // cover crops to fill: element cards, whose photos come in any shape
  selectedLabel?: boolean; // false when the caller puts "✓ Selected" in its own row
  children?: ReactNode; // status text while the image isn't ready
  className?: string;
}) {
  // The marks circle the print only; the pick's words sit under it.
  const print = (
    <span className="relative block">
      <span className="relative block w-full overflow-hidden rounded-media border border-rule bg-seamless" style={{ aspectRatio: aspect }}>
        {src ? (
          <img src={src} alt={alt} className={cn("develop absolute inset-0 size-full", fit === "cover" ? "object-cover" : "object-contain")} />
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
  const selected = picked && selectedLabel && <SelectedLabel className="mt-3" />;
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

export function SelectedLabel({ className }: { className?: string }) {
  return <span className={cn("inline-flex rounded-control bg-proof px-2 py-0.5 text-control font-semibold text-ink", className)}>✓ Selected</span>;
}

export const BAND_TEXT: Record<Band, { label: string; className: string }> = {
  match: { label: "Strong", className: "text-match" },
  check: { label: "Review", className: "text-check" },
  drift: { label: "Drifted", className: "text-drift" },
};

export const SCORE_EXPLAINED =
  "Likeness compares the face with this character's own reference photos and sheet. It says nothing about hands, the action or the image as a whole.";

// Likeness (spec: Identity match score, Bands and actions): a whole number,
// coloured by band, in its own proof chip, since the band colours only reach
// their contrast targets on proof. A video adds its lowest frame. The ⓘ says
// what the number measures; leave it out where the badge sits inside a link.
const chip = "inline-flex items-baseline gap-2 rounded-control bg-proof px-2 py-0.5 text-ink";

export function ScoreBadge({ score, lowest, note, info = true }: { score: number | null | undefined; lowest?: number; note?: string; info?: boolean }) {
  if (score === undefined) return <span className={cn(chip, "text-control text-ink-muted")}>Scoring</span>;
  if (score === null) return <span className={cn(chip, "text-control text-ink-muted")}>{note ?? "No face found to score"}</span>;
  const whole = Math.round(score);
  const b = BAND_TEXT[band(whole)];
  return (
    <span className={chip}>
      <span className="text-control">Likeness</span>
      <span className={cn("font-display text-panel font-extrabold", b.className)}>{whole}</span>
      <span className={cn("text-control font-semibold", b.className)}>{b.label}</span>
      {lowest !== undefined && <span className="text-control text-ink-muted">Lowest frame {Math.round(lowest)}</span>}
      {info && <ScoreInfo />}
    </span>
  );
}

function ScoreInfo() {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" aria-label="What Likeness measures" className="self-center rounded-full px-0.5 text-control leading-none text-ink-muted hover:text-ink">
          ⓘ
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" sideOffset={6} className="z-50 max-w-64 rounded-control border border-rule bg-proof p-3 text-control text-ink">
          {SCORE_EXPLAINED}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
