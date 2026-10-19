import { describe, expect, it } from "vitest";
import type { H3Input } from "@/lib/registry/inputs";
import { minimaxH3 } from "./minimax-h3";

const FRAME = "data:image/jpeg;base64,RlJBTUU=";
const base: H3Input = { stage: "generate", prompt: "A paper lantern sways at dusk.", durationSec: 6, ratio: "16:9", resolution: "2K", seed: 3 };

describe("minimaxH3.buildBody", () => {
  it("sends text to video with a fixed ratio", () => {
    expect(minimaxH3.buildBody(base)).toEqual({
      content: [{ type: "text", text: "A paper lantern sways at dusk." }],
      duration: 6,
      resolution: "2K",
      ratio: "16:9",
      seed: 3,
    });
  });

  it("goes adaptive with a first frame", () => {
    const body = minimaxH3.buildBody({ ...base, ratio: undefined, firstFrame: FRAME, resolution: "768P" }) as { ratio: string; content: unknown[] };
    expect(body.ratio).toBe("adaptive");
    expect(body.content[1]).toEqual({ type: "image_url", role: "first_frame", image_url: { url: FRAME } });
  });

  it("refuses what H3 refuses", () => {
    expect(() => minimaxH3.buildBody({ ...base, durationSec: 16 })).toThrow(/4 to 15/);
    expect(() => minimaxH3.buildBody({ ...base, durationSec: 3 })).toThrow(RangeError);
    expect(() => minimaxH3.buildBody({ ...base, firstFrame: FRAME, referenceImages: [FRAME] })).toThrow(/not both/);
    expect(() => minimaxH3.buildBody({ ...base, ratio: undefined })).toThrow(/aspect ratio/);
  });
});

describe("minimaxH3.extractAssets", () => {
  it("reads task.content.url", () => {
    expect(minimaxH3.extractAssets({ task: { status: "succeeded", content: { url: "https://cdn.example.com/out.mp4" } } })).toEqual([
      { kind: "video", url: "https://cdn.example.com/out.mp4" },
    ]);
    expect(minimaxH3.extractAssets({ task: { status: "failed" } })).toEqual([]);
  });
});
