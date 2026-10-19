import { describe, expect, it } from "vitest";
import { syntheticFace } from "../../../test/helpers/synthetic-face";
import { eyeOpenness, pitch, yaw } from "./pose";
import { band, bestDistance, distance, meanDescriptor, median, scoreFromDistance } from "./score";

describe("score", () => {
  it("maps 0.35 or less to 100 and 0.75 or more to 0, linearly between", () => {
    expect(scoreFromDistance(0.2)).toBe(100);
    expect(scoreFromDistance(0.35)).toBe(100);
    expect(scoreFromDistance(0.55)).toBe(50);
    expect(scoreFromDistance(0.75)).toBe(0);
    expect(scoreFromDistance(1.2)).toBe(0);
  });

  it("bands scores at 80 and 60", () => {
    expect([band(100), band(80), band(79), band(60), band(59)]).toEqual(["match", "match", "check", "check", "drift"]);
  });

  it("measures Euclidean distance and finds the nearest reference", () => {
    expect(distance([0, 0], [3, 4])).toBe(5);
    expect(bestDistance([0, 0], [[3, 4], [1, 0], [0, 2]])).toBe(1);
    expect(() => distance([0], [0, 1])).toThrow(RangeError);
  });

  it("averages descriptors and takes medians", () => {
    expect(meanDescriptor([[0, 2], [2, 4]])).toEqual([1, 3]);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("pose", () => {
  it("reads a frontal face as no yaw, and a turn as yaw in the turn's direction", () => {
    expect(Math.abs(yaw(syntheticFace()))).toBeLessThan(0.02);
    expect(yaw(syntheticFace({ turn: 0.6 }))).toBeGreaterThan(0.2);
    expect(yaw(syntheticFace({ turn: -0.6 }))).toBeLessThan(-0.2);
  });

  it("changes pitch when the head tilts", () => {
    expect(Math.abs(pitch(syntheticFace({ tilt: 1 })) - pitch(syntheticFace()))).toBeGreaterThan(0.05);
  });

  it("reads open and closed eyes", () => {
    expect(eyeOpenness(syntheticFace())).toBeGreaterThan(0.3);
    expect(eyeOpenness(syntheticFace({ blink: 0.9 }))).toBeLessThan(0.1);
  });

  it("refuses a landmark set that isn't 68 points", () => {
    expect(() => yaw([{ x: 0, y: 0 }])).toThrow(RangeError);
  });
});
