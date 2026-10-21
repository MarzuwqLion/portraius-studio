import { posterUrl, thumbnailUrl } from "@/lib/presets/load";
import type { Preset } from "@/lib/presets/schema";

// Every thumbnail is made with the Tour's designed character (spec: Presets
// and recipes, Contribution flow).
export const THUMBNAIL_CAST = "Walt Harmon";

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// A preset's thumbnail at full size: a still, or its loop playing muted (its
// poster under reduced motion).
export function PresetExample({ preset, className }: { preset: Preset; className?: string }) {
  const url = thumbnailUrl(preset);
  if (!url) return null;
  const poster = posterUrl(preset);
  // Under reduced motion a loop shows as its poster.
  if (!url.endsWith(".mp4") || (reducedMotion() && poster)) return <img src={url.endsWith(".mp4") ? poster : url} alt={`Example of ${preset.title}`} className={className} />;
  return <video src={url} poster={poster} muted loop playsInline autoPlay preload="auto" aria-label={`Example of ${preset.title}`} className={className} />;
}

// The empty set (Decisions, October 21, U5, item 7): the picked preset as an
// example, or with none picked, the first three to pick from.
export function EmptyExample({ presets, value, onPick }: { presets: readonly Preset[]; value: string | undefined; onPick: (preset: Preset) => void }) {
  const picked = presets.find((p) => p.id === value);
  if (picked && thumbnailUrl(picked)) {
    return (
      <figure className="mx-auto grid h-full max-w-2xl content-center justify-items-center gap-3">
        <PresetExample preset={picked} className="develop max-h-[60vh] w-auto max-w-full rounded-media border border-rule bg-seamless object-contain" />
        <figcaption className="text-center text-body">
          Example: {picked.title} with {THUMBNAIL_CAST}, a designed character. Your takes appear here.
        </figcaption>
      </figure>
    );
  }
  const first = presets.filter((p) => thumbnailUrl(p)).slice(0, 3);
  return (
    <div className="mx-auto grid h-full max-w-4xl content-center gap-4">
      <p className="text-center text-body">Your takes appear here. Start from a preset, or write your own prompt.</p>
      <div role="group" aria-label="Start from a preset" className="grid grid-cols-3 gap-4">
        {first.map((p) => (
          <button key={p.id} type="button" onClick={() => onPick(p)} className="group grid content-start gap-2 rounded-control p-1 text-left">
            <span className="block aspect-square overflow-hidden rounded-media border border-rule bg-seamless group-hover:border-on-seamless">
              <PresetExample preset={p} className="size-full object-cover" />
            </span>
            <span className="text-body font-semibold">{p.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
