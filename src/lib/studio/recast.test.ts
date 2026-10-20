import { describe, expect, it } from "vitest";
import { RECAST_PRESETS } from "@/lib/presets/load";
import type { Job } from "@/lib/types/jobs";
import { isFirstOfTwo, modeOf, nearestRatio, settingPrompt } from "./recast";

const recastJob = (request: object): Job => ({ id: "j", kind: "recast", input: { request } }) as unknown as Job;

describe("nearestRatio", () => {
  it("picks the closest ratio H3 supports", () => {
    expect(nearestRatio(1920, 1080)).toBe("16:9");
    expect(nearestRatio(768, 960)).toBe("3:4");
    expect(nearestRatio(1080, 1920)).toBe("9:16");
    expect(nearestRatio(1000, 1000)).toBe("1:1");
  });
});

describe("setting-change presets", () => {
  const withSetting = RECAST_PRESETS.filter((p) => typeof p.recipe.params?.setting === "string");

  it("are the three Motion Transfer presets that move the performer", () => {
    expect(withSetting.map((p) => p.id).sort()).toEqual(["concert-stage", "neon-performance", "same-move-new-city"]);
    for (const p of withSetting) expect(modeOf(p)).toBe("motion");
  });

  it("run as two steps: H3 first, then the setting edit", () => {
    expect(isFirstOfTwo(recastJob({ presetId: "same-move-new-city" }))).toBe(true);
    expect(isFirstOfTwo(recastJob({ presetId: "same-move-new-city", settingStep: true }))).toBe(false);
    expect(isFirstOfTwo(recastJob({ presetId: "outfit-change" }))).toBe(false);
    expect(isFirstOfTwo(({ id: "j", kind: "recast", input: {} }) as unknown as Job)).toBe(false);
  });

  it("names the whole surroundings, not just the background", () => {
    const prompt = settingPrompt("a large concert stage");
    expect(prompt).toContain("a large concert stage");
    expect(prompt).toMatch(/walls, windows, furniture and props/);
    expect(prompt).toMatch(/motion exactly as they are/);
  });
});
