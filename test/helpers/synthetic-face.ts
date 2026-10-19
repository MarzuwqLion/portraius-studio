import type { Point } from "@/lib/identity/pose";

// A frontal synthetic face in 68-landmark order. turn moves the nose and eyes
// sideways, tilt moves the nose up, blink closes the eyes.
export function syntheticFace({ turn = 0, tilt = 0, blink = 0 } = {}): Point[] {
  const p: Point[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI * (i / 16);
    p.push({ x: 100 - 60 * Math.cos(a), y: 100 + 70 * Math.sin(a) }); // jaw, 8 is the chin at (100, 170)
  }
  for (let i = 17; i < 27; i++) p.push({ x: 60 + (i - 17) * 9, y: 70 }); // brows
  for (let i = 27; i < 36; i++) p.push({ x: 100 + turn * 40, y: 80 + (i - 27) * 4 - tilt * 12 }); // nose, 30 is the tip
  const eye = (cx: number): Point[] => {
    const h = 4 * (1 - blink);
    return [
      { x: cx - 10, y: 90 }, { x: cx - 4, y: 90 - h }, { x: cx + 4, y: 90 - h },
      { x: cx + 10, y: 90 }, { x: cx + 4, y: 90 + h }, { x: cx - 4, y: 90 + h },
    ].map((q) => ({ x: q.x + turn * 15, y: q.y }));
  };
  p.push(...eye(78), ...eye(122));
  for (let i = 48; i < 68; i++) p.push({ x: 85 + ((i - 48) % 10) * 3, y: 140 });
  return p;
}
