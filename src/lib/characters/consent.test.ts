import { describe, expect, it } from "vitest";
import { eyeOpenness, pitch, yaw } from "@/lib/identity/pose";
import { syntheticFace } from "../../../test/helpers/synthetic-face";
import {
  CHALLENGE_POOL,
  CONSENT_STATEMENT,
  checkPassed,
  consentRecord,
  pickChallenges,
  verifyChallenge,
  verifyMatch,
  type FrameSample,
} from "./consent";

// Frames as the webcam component would sample them, from synthetic landmarks.
function frames(count: number, face: Parameters<typeof syntheticFace>[0] = {}, extra: Partial<FrameSample> = {}): FrameSample[] {
  const points = syntheticFace(face);
  return Array.from({ length: count }, (_, i) => ({
    atMs: i * 100,
    faceCount: 1,
    yaw: yaw(points),
    pitch: pitch(points),
    eyeOpenness: eyeOpenness(points),
    happy: 0.05,
    ...extra,
  }));
}

const baseline = frames(15);

describe("pickChallenges", () => {
  it("picks three different prompts from the pool, always including a turn", () => {
    for (let seed = 0; seed < 50; seed++) {
      let state = seed + 1;
      const random = () => ((state = (state * 16807) % 2147483647) / 2147483647);
      const picked = pickChallenges(random);
      expect(picked).toHaveLength(3);
      expect(new Set(picked).size).toBe(3);
      expect(picked.every((c) => CHALLENGE_POOL.includes(c))).toBe(true);
      expect(picked.some((c) => c === "turn-left" || c === "turn-right")).toBe(true);
    }
  });
});

describe("verifyChallenge", () => {
  it("passes a turn when yaw moves away from the baseline", () => {
    const window = [...frames(10), ...frames(10, { turn: 0.6 })];
    expect(verifyChallenge("turn-left", baseline, window).passed).toBe(true);
    expect(verifyChallenge("turn-right", baseline, [...frames(10), ...frames(10, { turn: -0.6 })]).passed).toBe(true);
  });

  it("fails a turn when the head stays still", () => {
    expect(verifyChallenge("turn-left", baseline, frames(30))).toMatchObject({ passed: false, reason: expect.stringContaining("turn") });
  });

  it("passes look-up on a pitch change and fails without one", () => {
    expect(verifyChallenge("look-up", baseline, [...frames(10), ...frames(10, { tilt: 1 })]).passed).toBe(true);
    expect(verifyChallenge("look-up", baseline, frames(20)).passed).toBe(false);
  });

  it("passes a smile on a high happy score", () => {
    expect(verifyChallenge("smile", baseline, [...frames(10), ...frames(5, {}, { happy: 0.92 })]).passed).toBe(true);
    expect(verifyChallenge("smile", baseline, frames(20, {}, { happy: 0.4 })).passed).toBe(false);
  });

  it("counts two blinks, and not one", () => {
    const open = frames(5);
    const shut = frames(2, { blink: 0.9 });
    expect(verifyChallenge("blink-twice", baseline, [...open, ...shut, ...open, ...shut, ...open]).passed).toBe(true);
    expect(verifyChallenge("blink-twice", baseline, [...open, ...shut, ...open]).passed).toBe(false);
  });

  it("fails when the face leaves the frame or someone else appears", () => {
    const gone = frames(20).map((f, i) => (i % 3 ? { ...f, faceCount: 0 } : f));
    expect(verifyChallenge("smile", baseline, gone)).toMatchObject({ passed: false, reason: expect.stringContaining("wasn't in view") });
    const crowd = [...frames(10, {}, { happy: 0.95 }), { atMs: 0, faceCount: 2 }];
    expect(verifyChallenge("smile", baseline, crowd)).toMatchObject({ passed: false, reason: expect.stringContaining("Someone else") });
  });
});

describe("verifyMatch", () => {
  it("passes when the median distance to the photos is under 0.55", () => {
    const samples = [0.41, 0.44, 0.39, 0.62, 0.43].map((distance, i) => ({ atMs: i, faceCount: 1, distance }));
    expect(verifyMatch(samples)).toMatchObject({ passed: true, distance: 0.43, score: 94 });
  });

  it("fails a different person", () => {
    const samples = [0.71, 0.68, 0.74, 0.69].map((distance, i) => ({ atMs: i, faceCount: 1, distance }));
    expect(verifyMatch(samples)).toMatchObject({ passed: false, reason: "The face on camera doesn't match the photos." });
  });

  it("needs at least three readings", () => {
    expect(verifyMatch([{ atMs: 0, faceCount: 1, distance: 0.3 }]).passed).toBe(false);
  });
});

describe("checkPassed", () => {
  const prompt = (passed: boolean) => ({ challenge: "smile" as const, passed });
  const matched = { passed: true, distance: 0.43, score: 94 };
  const stranger = { passed: false, distance: 0.7, score: 40 };

  it("passes on the face match and one prompt: 2 of 4", () => {
    expect(checkPassed([prompt(true), prompt(false), prompt(false)], matched)).toBe(true);
    expect(checkPassed([prompt(true), prompt(true), prompt(true)], matched)).toBe(true);
  });

  it("fails on the face match alone", () => {
    expect(checkPassed([prompt(false), prompt(false), prompt(false)], matched)).toBe(false);
  });

  // Consent rests on the face being the photos', so prompts never make up for it.
  it("fails a face that doesn't match, however many prompts pass", () => {
    expect(checkPassed([prompt(true), prompt(true), prompt(true)], stranger)).toBe(false);
  });
});

describe("consentRecord", () => {
  it("records the exact statement, the prompts and the match", () => {
    const record = consentRecord({ subjectName: "  Ada Lovelace ", challenge: ["turn-left", "smile", "look-up"], matchScore: 86, keepClip: true }, new Date("2026-10-20T10:00:00Z"));
    expect(record).toEqual({
      subjectName: "Ada Lovelace",
      method: "self-check",
      statement: CONSENT_STATEMENT,
      acceptedAt: "2026-10-20T10:00:00.000Z",
      challenge: ["turn-left", "smile", "look-up"],
      checkClip: "consent/check.webm",
      matchScore: 86,
      appVersion: expect.any(String),
    });
    expect(CONSENT_STATEMENT).toContain("I am 18 or older");
  });

  it("leaves out the clip unless the user keeps it", () => {
    expect(consentRecord({ subjectName: "A", challenge: [], matchScore: 90, keepClip: false })).not.toHaveProperty("checkClip");
  });
});
