// The webcam consent check (spec: Character vault, Consent check). The webcam
// component samples frames with face-api; everything that decides pass or fail
// lives here as plain functions over those samples.
import { version } from "../../../package.json";
import type { ConsentRecord } from "@/lib/types/records";
import { CONSENT_MAX_DISTANCE, median, scoreFromDistance } from "@/lib/identity/score";

export type Challenge = "turn-left" | "turn-right" | "look-up" | "smile" | "blink-twice";

export const CHALLENGE_POOL: readonly Challenge[] = ["turn-left", "turn-right", "look-up", "smile", "blink-twice"];
const TURNS: readonly Challenge[] = ["turn-left", "turn-right"];

export const CHALLENGE_TEXT: Record<Challenge, string> = {
  "turn-left": "Turn your head to your left",
  "turn-right": "Turn your head to your right",
  "look-up": "Look up",
  smile: "Smile",
  "blink-twice": "Blink twice",
};

// The exact text the subject accepts (spec: Character vault; Security: 18+).
export const CONSENT_STATEMENT =
  "I am the person in these photos, and I consent to a character of me being created in this app. I am 18 or older.";

export const BASELINE_MS = 1500;
export const CHALLENGE_MS = 4000;

// Tuned on synthetic landmarks; Unknowns row 12 checks yaw in real light.
export const THRESHOLDS = {
  presentShare: 0.5,  // share of a prompt's frames with exactly one face
  yawChange: 0.18,
  pitchChange: 0.05,
  smile: 0.7,         // face-api "happy" probability
  smileRise: 0.3,     // above the baseline's, so a smiling photo held up to the camera doesn't count
  blinkClosed: 0.75,  // eye openness under this share of the baseline counts as closed
  blinkOpen: 0.9,     // and back over this share as open again
  minMatchSamples: 3,
} as const;

// One analysed webcam frame.
export interface FrameSample {
  atMs: number;
  faceCount: number;
  yaw?: number;
  pitch?: number;
  eyeOpenness?: number;
  happy?: number;
  // Best distance to the photos' descriptors, on frames where one was computed.
  distance?: number;
}

export interface ChallengeResult {
  challenge: Challenge;
  passed: boolean;
  reason?: string;
}

// Three distinct prompts in random order, with at least one turn: a printed
// photo can smile in a poster but can't turn its head. Since one prompt is
// enough to pass (checkPassed), the turn is offered, not required, and a
// smile counts only when it starts on the prompt.
export function pickChallenges(random: () => number = Math.random): Challenge[] {
  const pool = [...CHALLENGE_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const picked = pool.slice(0, 3);
  if (!picked.some((c) => TURNS.includes(c))) picked[0] = TURNS[Math.floor(random() * TURNS.length)]!;
  return picked;
}

type Measure = "yaw" | "pitch" | "eyeOpenness" | "happy";

const values = (frames: readonly FrameSample[], key: Measure) =>
  frames.map((f) => f[key]).filter((v): v is number => typeof v === "number");

function baselineOf(frames: readonly FrameSample[], key: Measure): number | undefined {
  const v = values(frames, key);
  return v.length ? median(v) : undefined;
}

function countBlinks(frames: readonly FrameSample[], open: number): number {
  let blinks = 0;
  let closed = false;
  for (const value of values(frames, "eyeOpenness")) {
    if (!closed && value < open * THRESHOLDS.blinkClosed) closed = true;
    else if (closed && value > open * THRESHOLDS.blinkOpen) {
      closed = false;
      blinks++;
    }
  }
  return blinks;
}

export function verifyChallenge(challenge: Challenge, baseline: readonly FrameSample[], window: readonly FrameSample[]): ChallengeResult {
  const fail = (reason: string): ChallengeResult => ({ challenge, passed: false, reason });
  if (window.some((f) => f.faceCount > 1)) return fail("Someone else came into the frame. Only you should be on camera.");
  const present = window.filter((f) => f.faceCount === 1).length;
  if (!window.length || present / window.length < THRESHOLDS.presentShare) return fail("Your face wasn't in view. Stay centred in the frame.");

  switch (challenge) {
    case "turn-left":
    case "turn-right": {
      const base = baselineOf(baseline, "yaw") ?? 0;
      const turned = Math.max(0, ...values(window, "yaw").map((v) => Math.abs(v - base)));
      return turned >= THRESHOLDS.yawChange ? { challenge, passed: true } : fail("We didn't see your head turn. Turn it further and hold for a moment.");
    }
    case "look-up": {
      const base = baselineOf(baseline, "pitch");
      if (base === undefined) return fail("We couldn't see your face clearly before the prompt.");
      const moved = Math.max(0, ...values(window, "pitch").map((v) => Math.abs(v - base)));
      return moved >= THRESHOLDS.pitchChange ? { challenge, passed: true } : fail("We didn't see you look up. Tilt your head back a little further.");
    }
    // The smile has to start on the prompt: a face already smiling during
    // "Look at the camera" (a photo, say) doesn't count.
    case "smile": {
      const base = baselineOf(baseline, "happy");
      if (base === undefined) return fail("We couldn't see your face clearly before the prompt.");
      const peak = Math.max(0, ...values(window, "happy"));
      if (peak < THRESHOLDS.smile) return fail("We didn't see a smile.");
      return peak - base >= THRESHOLDS.smileRise ? { challenge, passed: true } : fail("You were already smiling before the prompt. Start with a neutral face, then smile.");
    }
    case "blink-twice": {
      const open = baselineOf(baseline, "eyeOpenness");
      if (open === undefined) return fail("We couldn't see your eyes clearly before the prompt.");
      return countBlinks(window, open) >= 2 ? { challenge, passed: true } : fail("We didn't catch two blinks. Blink slowly, twice.");
    }
  }
}

export interface MatchResult {
  passed: boolean;
  distance?: number;
  score?: number;
  reason?: string;
}

// The face on camera against the photos: the median of every frame's best distance.
export function verifyMatch(frames: readonly FrameSample[]): MatchResult {
  const distances = frames.map((f) => f.distance).filter((d): d is number => typeof d === "number");
  if (distances.length < THRESHOLDS.minMatchSamples) return { passed: false, reason: "We couldn't get a clear enough look at your face." };
  const d = median(distances);
  const score = scoreFromDistance(d);
  return d < CONSENT_MAX_DISTANCE
    ? { passed: true, distance: d, score }
    : { passed: false, distance: d, score, reason: "The face on camera doesn't match the photos." };
}

// A check passes on 2 of its 4 parts, one of them the face match: the face
// has to be the photos' (that's what consent rests on), and any one prompt
// shows a live person turning, looking up, smiling or blinking. Tries are
// unlimited (Marzuwq, October 27: three prompts out of three, three tries,
// turned away people who were plainly themselves).
export const PROMPTS_TO_PASS = 1;

export function checkPassed(results: readonly ChallengeResult[], match: MatchResult): boolean {
  return match.passed && results.filter((r) => r.passed).length >= PROMPTS_TO_PASS;
}

export function consentRecord(fields: { subjectName: string; challenge: Challenge[]; matchScore: number; keepClip: boolean }, now = new Date()): ConsentRecord {
  return {
    subjectName: fields.subjectName.trim(),
    method: "self-check",
    statement: CONSENT_STATEMENT,
    acceptedAt: now.toISOString(),
    challenge: fields.challenge,
    ...(fields.keepClip ? { checkClip: "consent/check.webm" } : {}),
    matchScore: fields.matchScore,
    appVersion: version,
  };
}
