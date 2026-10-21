import { describe, expect, it } from "vitest";
import { RECAST_PRESETS } from "@/lib/presets/load";
import type { Job } from "@/lib/types/jobs";
import { LIMITS, defaultRange, fitsLimits, isFirstOfTwo, modeOf, nearestRatio, recastNeeds, settingPrompt, tooShort, type RecastForm } from "./recast";

const recastJob = (request: object): Job => ({ id: "j", kind: "recast", input: { request } }) as unknown as Job;

describe("nearestRatio", () => {
  it("picks the closest ratio H3 supports", () => {
    expect(nearestRatio(1920, 1080)).toBe("16:9");
    expect(nearestRatio(768, 960)).toBe("3:4");
    expect(nearestRatio(1080, 1920)).toBe("9:16");
    expect(nearestRatio(1000, 1000)).toBe("1:1");
  });
});

describe("fitsLimits", () => {
  const clip = (durationSec: number, fps?: number) => ({ info: { durationSec, width: 1920, height: 1080 }, ...(fps ? { fps } : {}) });

  it("keeps a clip prepared for Object Swap when the preset moves to Motion Transfer", () => {
    expect(fitsLimits(clip(5, 30), LIMITS.swap)).toBe(true);
    expect(fitsLimits(clip(5, 30), LIMITS.motion)).toBe(true);
  });

  it("asks again when the new mode is shorter or resamples", () => {
    expect(fitsLimits(clip(12), LIMITS.swap)).toBe(false);
    expect(fitsLimits(clip(5), LIMITS.swap)).toBe(false); // not resampled to 30 fps
    expect(fitsLimits(clip(3.5, 30), LIMITS.motion)).toBe(false);
  });

  it("allows the same rounding as startRecast", () => {
    expect(fitsLimits(clip(10.04, 30), LIMITS.swap)).toBe(true);
    expect(fitsLimits(clip(3.96), LIMITS.style)).toBe(true);
  });
});

describe("defaultRange", () => {
  it("uses the whole clip when it fits", () => {
    expect(defaultRange(8, LIMITS.motion)).toEqual([0, 8]);
    expect(defaultRange(3.5, LIMITS.motion)).toEqual([0, 3.5]);
  });

  it("uses the first allowed seconds of a longer clip", () => {
    expect(defaultRange(22, LIMITS.motion)).toEqual([0, 15]);
    expect(defaultRange(12, LIMITS.swap)).toEqual([0, 10]);
  });

  it("calls a clip short only past startRecast's rounding", () => {
    expect(tooShort(3.5, LIMITS.motion)).toBe(true);
    expect(tooShort(3.96, LIMITS.motion)).toBe(false);
    expect(tooShort(3.5, LIMITS.swap)).toBe(false);
  });
});

describe("recastNeeds", () => {
  const done: RecastForm = {
    mode: "motion",
    hasClip: true,
    tooShort: false,
    prepared: { blobId: "b", info: { durationSec: 6, width: 1920, height: 1080 } },
    needsPerformer: true,
    hasPerformer: true,
    hasReplacement: false,
    rights: true,
  };

  it("is nothing once the call sheet is complete", () => {
    expect(recastNeeds(done)).toBeUndefined();
  });

  it("names the first missing step, in call-sheet order", () => {
    expect(recastNeeds({ ...done, hasClip: false, rights: false })).toBe("Upload a clip");
    expect(recastNeeds({ ...done, tooShort: true, prepared: undefined })).toBe("Recast needs a 4 to 15 s clip");
    expect(recastNeeds({ ...done, prepared: undefined, hasPerformer: false })).toBe("Preparing the clip");
    expect(recastNeeds({ ...done, hasPerformer: false, rights: false })).toBe("Pick a performer");
    expect(recastNeeds({ ...done, rights: false })).toMatch(/rights/);
  });

  it("never asks the visitor to prepare or trim", () => {
    const forms: RecastForm[] = [{ ...done, prepared: undefined }, { ...done, preparing: 0 }, { ...done, mode: "swap", needsPerformer: false }];
    for (const form of forms) expect(recastNeeds(form)).not.toMatch(/prepare it|Prepare|Trim/);
  });

  it("shows how far the clip has prepared", () => {
    expect(recastNeeds({ ...done, preparing: 0 })).toBe("Preparing the clip");
    expect(recastNeeds({ ...done, preparing: 0.4 })).toBe("Preparing the clip, 40%");
  });

  it("waits for the clip again when a preset in another mode can't take it", () => {
    expect(recastNeeds({ ...done, mode: "swap", needsPerformer: false })).toBe("Preparing the clip");
  });

  it("names the mode's own limits when the clip is too short", () => {
    expect(recastNeeds({ ...done, mode: "swap", needsPerformer: false, tooShort: true })).toBe("Recast needs a 3 to 10 s clip");
  });

  it("wants a replacement image only for Object Swap", () => {
    const swap: RecastForm = { ...done, mode: "swap", needsPerformer: false, prepared: { blobId: "b", info: { durationSec: 6, width: 1920, height: 1080 }, fps: 30 } };
    expect(recastNeeds(swap)).toBe("Upload a replacement image");
    expect(recastNeeds({ ...swap, hasReplacement: true })).toBeUndefined();
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
