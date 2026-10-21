import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

// Recast split view (spec: Visual direction, Recast split view): both clips in
// one frame, a vertical wipe the user drags, Original on the left and Recast on
// the right, and one scrubber driving both.
export function SplitView({ original, recast, aspect, label }: { original: string; recast: string; aspect: string; label?: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLVideoElement>(null);
  const right = useRef<HTMLVideoElement>(null);
  const [wipe, setWipe] = useState(50);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);

  // The recast drives the clock; the original follows it.
  useEffect(() => {
    const r = right.current;
    const l = left.current;
    if (!r || !l) return;
    const sync = () => {
      setTime(r.currentTime);
      if (Math.abs(l.currentTime - r.currentTime) > 0.08) l.currentTime = Math.min(r.currentTime, l.duration || r.currentTime);
    };
    const meta = () => setDuration(r.duration || 0);
    r.addEventListener("timeupdate", sync);
    r.addEventListener("loadedmetadata", meta);
    r.addEventListener("ended", () => setPlaying(false));
    return () => {
      r.removeEventListener("timeupdate", sync);
      r.removeEventListener("loadedmetadata", meta);
    };
  }, [original, recast]);

  function toggle() {
    const r = right.current;
    const l = left.current;
    if (!r || !l) return;
    if (playing) {
      r.pause();
      l.pause();
    } else {
      l.currentTime = r.currentTime;
      void r.play();
      void l.play();
    }
    setPlaying(!playing);
  }

  function seek(seconds: number) {
    if (right.current) right.current.currentTime = seconds;
    if (left.current) left.current.currentTime = seconds;
    setTime(seconds);
  }

  function drag(e: PointerEvent) {
    if (!(e.buttons & 1) || !frame.current) return;
    const box = frame.current.getBoundingClientRect();
    setWipe(Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100)));
  }

  return (
    <div className="grid gap-2">
      <div className="flex justify-between">
        <span className="font-display text-screen font-extrabold text-on-seamless">Original</span>
        {label && <span className="self-end text-control text-on-seamless">{label}</span>}
        <span className="font-display text-screen font-extrabold text-on-seamless">Recast</span>
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
        <video ref={right} src={recast} muted playsInline preload="auto" className="absolute inset-0 size-full object-contain" aria-label="Recast clip" />
        <video
          ref={left}
          src={original}
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 size-full object-contain"
          style={{ clipPath: `inset(0 ${100 - wipe}% 0 0)` }}
          aria-label="Original clip"
        />
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-proof" style={{ left: `${wipe}%` }} />
        <input
          type="range"
          min={0}
          max={100}
          value={wipe}
          onChange={(e) => setWipe(Number(e.target.value))}
          className="sr-only"
          aria-label="Wipe between original and recast"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" size="icon" variant="secondary" className="border-on-seamless text-on-seamless" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause /> : <Play />}
        </Button>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={time}
          onChange={(e) => seek(Number(e.target.value))}
          className="w-full"
          aria-label="Scrub both clips"
        />
      </div>
    </div>
  );
}
