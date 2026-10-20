import { describe, expect, it } from "vitest";
import type { KlingInput } from "@/lib/registry/inputs";
import { klingOmni } from "./kling-omni";

const base: KlingInput = { prompt: "The woman in <<<image_1>>> performs the movement of <<<video_1>>>.", quality: "std", durationSec: 5, ratio: "16:9" };

describe("klingOmni.buildBody", () => {
  it("builds a motion reference with an image and a feature video", () => {
    expect(klingOmni.buildBody({ ...base, referenceImages: ["data:image/jpeg;base64,QUJD"], video: { url: "https://w.example/m/a.mp4", use: "feature" } })).toEqual({
      prompt: base.prompt,
      image_list: [{ image_url: "QUJD" }],
      video_list: [{ video_url: "https://w.example/m/a.mp4", refer_type: "feature", keep_original_sound: "no" }],
      mode: "std",
      duration: "5",
      aspect_ratio: "16:9",
      sound: "off",
    });
  });

  it("edits a clip without a duration or ratio (the clip decides both)", () => {
    const body = klingOmni.buildBody({ prompt: "Swap the mug for a red thermos.", quality: "pro", video: { url: "https://w.example/m/b.mp4", use: "base", keepSound: true } });
    expect(body).toEqual({
      prompt: "Swap the mug for a red thermos.",
      video_list: [{ video_url: "https://w.example/m/b.mp4", refer_type: "base", keep_original_sound: "yes" }],
      mode: "pro",
      sound: "off",
    });
  });

  it("orders first and end frames before references and drops the ratio with a first frame", () => {
    const body = klingOmni.buildBody({ ...base, firstFrame: "Rk9P", endFrame: "RU5E", referenceImages: ["UkVG"] }) as { image_list?: unknown };
    expect(body.image_list).toEqual([{ image_url: "Rk9P", type: "first_frame" }, { image_url: "RU5E", type: "end_frame" }, { image_url: "UkVG" }]);
    expect(body).not.toHaveProperty("aspect_ratio");
  });

  it("shoots a one-take: one prompt per shot, and the clip lasts their sum", () => {
    const body = klingOmni.buildBody({
      prompt: "The Letter",
      quality: "std",
      ratio: "16:9",
      referenceImages: ["data:image/png;base64,U0hFRVQ="],
      shots: [
        { prompt: "LEAD is the person in <<<image_1>>>. LEAD sits down.", durationSec: 4 },
        { prompt: "LEAD looks up.", durationSec: 3 },
      ],
    });
    expect(body).toEqual({
      multi_shot: true,
      shot_type: "customize",
      multi_prompt: [
        { index: 1, prompt: "LEAD is the person in <<<image_1>>>. LEAD sits down.", duration: "4" },
        { index: 2, prompt: "LEAD looks up.", duration: "3" },
      ],
      image_list: [{ image_url: "U0hFRVQ=" }],
      mode: "std",
      duration: "7",
      aspect_ratio: "16:9",
      sound: "off",
    });
    expect(body).not.toHaveProperty("prompt");
  });

  it("refuses a one-take Kling would refuse", () => {
    const shot = { prompt: "A shot.", durationSec: 3 };
    expect(() => klingOmni.buildBody({ ...base, shots: [] })).toThrow(/1 to 6 shots/);
    expect(() => klingOmni.buildBody({ ...base, shots: Array(7).fill(shot) })).toThrow(/1 to 6 shots/);
    expect(() => klingOmni.buildBody({ ...base, shots: [{ prompt: "x".repeat(513), durationSec: 4 }] })).toThrow(/512/);
    expect(() => klingOmni.buildBody({ ...base, shots: [shot, { ...shot, durationSec: 0 }] })).toThrow(/at least 1/);
    expect(() => klingOmni.buildBody({ ...base, shots: [shot, { ...shot, durationSec: 13 }] })).toThrow(/3 to 15/);
  });

  it("refuses what Kling refuses", () => {
    expect(() => klingOmni.buildBody({ ...base, ratio: undefined })).toThrow(/aspect ratio/);
    expect(() => klingOmni.buildBody({ ...base, durationSec: 16 })).toThrow(/3 to 15/);
    expect(() => klingOmni.buildBody({ ...base, endFrame: "RU5E" })).toThrow(/first frame/);
  });
});

describe("klingOmni.extractAssets", () => {
  it("reads every video in task_result", () => {
    expect(klingOmni.extractAssets({ data: { task_status: "succeed", task_result: { videos: [{ url: "https://v15-kling-fdl.klingai.com/a.mp4" }] } } })).toEqual([
      { kind: "video", url: "https://v15-kling-fdl.klingai.com/a.mp4" },
    ]);
  });
});
