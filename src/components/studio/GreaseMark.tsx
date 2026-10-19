import { useLayoutEffect, useRef, useState } from "react";

// The app's one bold element (spec: Visual direction, Signature): a hand-drawn
// grease-pencil circle around a pick, or one diagonal stroke through a
// rejected take. Nothing else uses --grease.
//
// Marks are drawn in the element's own pixels (measured), not a scaled
// viewBox, so the stroke stays 3 px and the draw-on animation has no gaps.

// A small seeded generator, so a mark keeps its shape across renders.
function wobble(seed: number): () => number {
  let state = (seed * 9301 + 49297) % 233280 || 1;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280 - 0.5;
  };
}

function circlePath(seed: number, w: number, h: number): string {
  const rand = wobble(seed);
  const jitter = Math.min(w, h) * 0.035;
  const points: [number, number][] = [];
  // A little more than one turn, so the ends overlap like a real loop.
  const start = -0.4 + rand() * 0.3;
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const a = start + (i / steps) * (Math.PI * 2 + 0.5);
    const shrink = (i / steps) * jitter * 0.6;
    const rx = w / 2 - 3 + rand() * jitter - shrink;
    const ry = h / 2 - 3 + rand() * jitter - shrink;
    points.push([w / 2 + rx * Math.cos(a), h / 2 + ry * Math.sin(a)]);
  }
  const f = (n: number) => n.toFixed(1);
  let d = `M ${f(points[0]![0])} ${f(points[0]![1])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    const next = points[i + 1]!;
    d += ` Q ${f(p[0])} ${f(p[1])} ${f((p[0] + next[0]) / 2)} ${f((p[1] + next[1]) / 2)}`;
  }
  const last = points[points.length - 1]!;
  return `${d} L ${f(last[0])} ${f(last[1])}`;
}

function strikePath(w: number, h: number): string {
  return `M ${(w * 0.08).toFixed(1)} ${(h * 0.92).toFixed(1)} Q ${(w * 0.48).toFixed(1)} ${(h * 0.54).toFixed(1)} ${(w * 0.93).toFixed(1)} ${(h * 0.09).toFixed(1)}`;
}

function Mark({ path }: { path: (w: number, h: number) => string }) {
  const box = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>();
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <svg ref={box} className="pointer-events-none absolute -inset-2 h-[calc(100%+1rem)] w-[calc(100%+1rem)] overflow-visible" aria-hidden>
      {size && size.w > 0 && (
        <path d={path(size.w, size.h)} pathLength={1} className="grease-draw" fill="none" stroke="var(--grease)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

export function GreaseCircle({ seed = 7 }: { seed?: number }) {
  return <Mark path={(w, h) => circlePath(seed, w, h)} />;
}

export function GreaseStrike() {
  return <Mark path={strikePath} />;
}
