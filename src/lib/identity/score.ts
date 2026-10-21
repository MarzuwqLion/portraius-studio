// Distance to score (spec: Identity match score). face-api descriptors are
// 128 numbers; two faces of the same person sit closer than different people.
// Calibrated on October 19 on generated faces (docs/notes/m5-calibration.md):
// same person 0.27 to 0.55, different people 0.58 and up. 0.50 scores 80 and
// 0.60 scores 60, so the bands fall between the two groups.

export const DISTANCE_PERFECT = 0.4;
export const DISTANCE_ZERO = 0.9;

// Bands: 80 to 100 Strong, 60 to 79 Review, under 60 Drifted.
export const MATCH_SCORE = 80;
export const CHECK_SCORE = 60;

// The webcam face counts as the person in the photos below this distance
// (Consent check). Stricter than face-api's usual 0.6, since a pass unlocks
// generation with that face.
export const CONSENT_MAX_DISTANCE = 0.55;

export type Band = "match" | "check" | "drift";

export function distance(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new RangeError("Descriptors differ in length.");
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i]! - b[i]!) ** 2;
  return Math.sqrt(sum);
}

export function scoreFromDistance(d: number): number {
  const t = (DISTANCE_ZERO - d) / (DISTANCE_ZERO - DISTANCE_PERFECT);
  return Math.round(Math.min(1, Math.max(0, t)) * 100);
}

export function band(score: number): Band {
  if (score >= MATCH_SCORE) return "match";
  if (score >= CHECK_SCORE) return "check";
  return "drift";
}

// The smallest distance from a face to any of a character's references.
export function bestDistance(probe: ArrayLike<number>, references: readonly ArrayLike<number>[]): number {
  if (!references.length) throw new RangeError("No reference descriptors.");
  return Math.min(...references.map((ref) => distance(probe, ref)));
}

export function meanDescriptor(descriptors: readonly ArrayLike<number>[]): number[] {
  if (!descriptors.length) throw new RangeError("No descriptors to average.");
  const mean = new Array<number>(descriptors[0]!.length).fill(0);
  for (const d of descriptors) for (let i = 0; i < mean.length; i++) mean[i]! += d[i]! / descriptors.length;
  return mean;
}

export function median(values: readonly number[]): number {
  if (!values.length) throw new RangeError("No values.");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
