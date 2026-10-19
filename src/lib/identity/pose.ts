// Head pose and eye openness from face-api's 68 landmarks, for the consent
// check's prompts. Plain geometry on 2D points, so it runs on any frame and
// tests without a browser.
//
// Landmark indices: 0 to 16 jaw (8 is the chin), 30 nose tip, 36 to 41 the
// eye on the image's left, 42 to 47 the eye on the image's right.

export interface Point {
  x: number;
  y: number;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function at(points: readonly Point[], i: number): Point {
  const p = points[i];
  if (!p) throw new RangeError(`Expected 68 landmarks, got ${points.length}.`);
  return p;
}

// About 0 facing the camera, moving towards +-0.5 as the head turns. The sign
// says which jaw edge the nose has moved towards (+ is the image's right).
export function yaw(points: readonly Point[]): number {
  const nose = at(points, 30);
  const toLeftJaw = dist(nose, at(points, 0));
  const toRightJaw = dist(nose, at(points, 16));
  return (toLeftJaw - toRightJaw) / (toLeftJaw + toRightJaw);
}

// Nose tip's height between the eyes and the chin. Tilting the head back or
// forward moves it; only the size of the change is used.
export function pitch(points: readonly Point[]): number {
  const eyes = mid(eyeCentre(points, 36), eyeCentre(points, 42));
  return dist(eyes, at(points, 30)) / dist(eyes, at(points, 8));
}

function eyeCentre(points: readonly Point[], first: number): Point {
  let x = 0;
  let y = 0;
  for (let i = first; i < first + 6; i++) {
    x += at(points, i).x / 6;
    y += at(points, i).y / 6;
  }
  return { x, y };
}

// Eye aspect ratio, averaged over both eyes: about 0.3 open, under 0.2 closed.
export function eyeOpenness(points: readonly Point[]): number {
  const ear = (f: number) =>
    (dist(at(points, f + 1), at(points, f + 5)) + dist(at(points, f + 2), at(points, f + 4))) / (2 * dist(at(points, f), at(points, f + 3)));
  return (ear(36) + ear(42)) / 2;
}
