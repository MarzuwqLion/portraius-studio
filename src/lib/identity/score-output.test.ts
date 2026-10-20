import { describe, expect, it } from "vitest";
import { videoScores } from "./score-output";

describe("videoScores", () => {
  it("skips frames where a cast member's face can't be seen", () => {
    const frames = [{ walt: 90 }, { walt: null }, { walt: 80 }, { walt: 86 }, { walt: null }];
    expect(videoScores(frames, ["walt"])).toEqual({ identityScores: { walt: 86 }, identityScore: 86, worstScore: 80 });
  });

  it("reports the weakest member and the worst seen frame", () => {
    const frames = [{ a: 90, b: 70 }, { a: 88, b: null }, { a: 92, b: 64 }];
    expect(videoScores(frames, ["a", "b"])).toEqual({ identityScores: { a: 90, b: 67 }, identityScore: 67, worstScore: 64 });
  });

  it("leaves the score unset when no frame shows anyone", () => {
    expect(videoScores([{ walt: null }, { walt: null }], ["walt"])).toEqual({ identityScores: { walt: null } });
  });
});
