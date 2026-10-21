import { useRef, useState } from "react";
import { posterUrl, thumbnailUrl } from "@/lib/presets/load";
import type { Preset } from "@/lib/presets/schema";
import { cn } from "@/lib/utils";

// Preset tiles (spec: Decisions, October 21, item 10): each preset as its
// thumbnail and title. A video thumbnail is a short muted loop that plays on
// hover and on focus (not under reduced motion). A preset without a
// thumbnail shows its title on Studio grey.
function Tile({ preset, picked, onPick, className }: { preset: Preset; picked: boolean; onPick: () => void; className?: string }) {
  const url = thumbnailUrl(preset);
  const video = useRef<HTMLVideoElement>(null);
  const isVideo = url?.endsWith(".mp4") ?? false;
  const play = () => {
    if (!video.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    void video.current.play().catch(() => undefined);
  };
  const stop = () => {
    if (!video.current) return;
    video.current.pause();
    video.current.currentTime = 0;
  };
  return (
    <button
      type="button"
      aria-pressed={picked}
      onClick={onPick}
      onMouseEnter={play}
      onMouseLeave={stop}
      onFocus={play}
      onBlur={stop}
      className={cn("group grid content-start gap-1 rounded-control p-1 text-left", picked ? "bg-tint-active" : "hover:bg-tint-hover", className)}
    >
      <span className={cn("relative block aspect-square overflow-hidden rounded-media border bg-seamless", picked ? "border-accent outline-2 outline-accent" : "border-rule")}>
        {url && isVideo && <video ref={video} src={`${url}#t=0.1`} poster={posterUrl(preset)} muted loop playsInline preload="metadata" aria-hidden className="size-full object-cover" />}
        {url && !isVideo && <img src={url} alt="" loading="lazy" className="size-full object-cover" />}
        {!url && <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-control font-semibold text-on-seamless">{preset.title}</span>}
      </span>
      <span className={cn("line-clamp-2 text-control leading-tight", picked ? "font-semibold text-ink" : "text-ink-muted group-hover:text-ink")} title={preset.title}>
        {preset.title}
      </span>
    </button>
  );
}

// Two rows before "Show all": three across in the call sheet, four across on a
// phone, where the call sheet is the whole width and three would be large.
const FIRST = 6;
const FIRST_PHONE = 8;

export function PresetTiles({
  presets,
  value,
  onPick,
  label = "Presets",
  clearable = true,
}: {
  presets: readonly Preset[];
  value: string | undefined;
  onPick: (preset: Preset | undefined) => void;
  label?: string;
  clearable?: boolean; // picking the picked tile again clears it
}) {
  const [all, setAll] = useState(false);
  // The picked one always shows, even past the first two rows.
  const pickedIndex = presets.findIndex((p) => p.id === value);
  const folded = !all && presets.length > FIRST + 1;
  const shown = folded ? presets.filter((_, i) => i < FIRST_PHONE || i === pickedIndex) : presets;
  // Tiles past the first six show only on a phone, unless picked.
  const phoneOnly = (i: number) => folded && i >= FIRST && i !== pickedIndex;
  return (
    <div className="grid gap-2">
      <div role="group" aria-label={label} className="grid grid-cols-4 gap-1 md:grid-cols-3">
        {shown.map((p) => (
          <Tile
            key={p.id}
            preset={p}
            picked={p.id === value}
            onPick={() => onPick(clearable && p.id === value ? undefined : p)}
            className={phoneOnly(presets.indexOf(p)) ? "md:hidden" : undefined}
          />
        ))}
      </div>
      {folded && (
        <button type="button" onClick={() => setAll(true)} className="justify-self-start text-control font-semibold text-accent-text underline underline-offset-4">
          Show all {presets.length}
        </button>
      )}
    </div>
  );
}
