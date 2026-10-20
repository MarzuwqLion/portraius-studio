import { useRef, useState, type PointerEvent } from "react";

// A still before and after a realism pass in one frame (spec: Finishing,
// Realism pass): a vertical wipe the user drags, Before on the left and After
// on the right, like Recast's split view.
export function BeforeAfter({ before, after, aspect, alt }: { before: string; after: string; aspect: string; alt: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [wipe, setWipe] = useState(50);
  // Fits the frame within 70% of the screen's height, keeping its shape.
  const [w, h] = aspect.split("/").map(Number);
  const maxWidth = w && h ? `calc(70vh * ${w / h})` : undefined;

  function drag(e: PointerEvent) {
    if (!(e.buttons & 1) || !frame.current) return;
    const box = frame.current.getBoundingClientRect();
    setWipe(Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100)));
  }

  return (
    <div className="mx-auto grid w-full gap-2" style={{ maxWidth }}>
      <div className="flex justify-between">
        <span className="font-display text-screen font-extrabold text-on-seamless">Before</span>
        <span className="font-display text-screen font-extrabold text-on-seamless">After</span>
      </div>
      <div
        ref={frame}
        className="relative touch-none overflow-hidden rounded-media border border-rule bg-seamless select-none"
        style={{ aspectRatio: aspect }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          drag(e);
        }}
        onPointerMove={drag}
      >
        <img src={after} alt={`${alt}, after the realism pass`} className="develop absolute inset-0 size-full object-contain" draggable={false} />
        <img
          src={before}
          alt={`${alt}, before`}
          className="absolute inset-0 size-full object-contain"
          style={{ clipPath: `inset(0 ${100 - wipe}% 0 0)` }}
          draggable={false}
        />
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-proof" style={{ left: `${wipe}%` }} />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={wipe}
        onChange={(e) => setWipe(Number(e.target.value))}
        className="w-full accent-ink"
        aria-label="Wipe between before and after"
      />
    </div>
  );
}
