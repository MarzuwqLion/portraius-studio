import { describe, expect, it } from "vitest";
import draft from "../../../test/fixtures/seedance-2.5.draft.result.json";
import referenceVideo from "../../../test/fixtures/seedance-2.5.reference-video.result.json";
import type { GenerateVideoInput } from "@/lib/registry/inputs";
import { seedance, type SeedanceResult } from "./seedance";

const FRAME = "data:image/png;base64,RlJBTUU=";

const base: GenerateVideoInput = {
  stage: "draft",
  prompt: "Slow push-in on a ceramic teapot.",
  durationSec: 8,
  generateAudio: true,
  seed: 1234,
};

describe("seedance.buildBody", () => {
  it("matches the spec's still-first draft body", () => {
    expect(seedance.buildBody({ ...base, firstFrame: FRAME, ratio: "9:16" })).toEqual({
      content: [
        { type: "text", text: "Slow push-in on a ceramic teapot." },
        { type: "image_url", role: "first_frame", image_url: { url: FRAME } },
      ],
      draft: true,
      resolution: "480p",
      duration: 8,
      ratio: "adaptive",
      generate_audio: true,
      return_last_frame: true,
      seed: 1234,
    });
  });

  it("renders a final from the draft ID alone", () => {
    expect(seedance.buildBody({ stage: "final", draftTaskId: "cgt-20261020013238-kgd82" })).toEqual({
      content: [{ type: "draft_task", draft_task: { id: "cgt-20261020013238-kgd82" } }],
      resolution: "1080p",
    });
  });

  it("uses a concrete ratio in text and reference modes", () => {
    const text = seedance.buildBody({ ...base, ratio: "21:9" }) as { ratio: string };
    expect(text.ratio).toBe("21:9");
    const refs = seedance.buildBody({ ...base, referenceImages: [FRAME, "https://example.com/sheet.png"] }) as {
      ratio: string;
      content: { role?: string }[];
    };
    expect(refs.ratio).toBe("16:9");
    expect(refs.content.map((c) => c.role)).toEqual([undefined, "reference_image", "reference_image"]);
  });

  it("sends duration -1 with a reference video, which Seedance needs for video tasks", () => {
    const body = seedance.buildBody({ ...base, referenceVideos: ["https://portraius-proxy.example.workers.dev/m/abc.mp4"] }) as {
      duration: number;
      content: unknown[];
    };
    expect(body.duration).toBe(-1);
    expect(body.content[1]).toEqual({ type: "video_url", role: "reference_video", video_url: { url: "https://portraius-proxy.example.workers.dev/m/abc.mp4" } });
  });

  it("sends -1 for auto duration and omits a missing seed", () => {
    const body = seedance.buildBody({ ...base, durationSec: "auto", seed: undefined }) as Record<string, unknown>;
    expect(body.duration).toBe(-1);
    expect(body).not.toHaveProperty("seed");
  });

  it("refuses inputs Seedance would reject or the spec keeps apart", () => {
    expect(() => seedance.buildBody({ ...base, durationSec: 3 })).toThrow(RangeError);
    expect(() => seedance.buildBody({ ...base, durationSec: 31 })).toThrow(RangeError);
    expect(() => seedance.buildBody({ ...base, lastFrame: FRAME })).toThrow(/first frame/);
    expect(() => seedance.buildBody({ ...base, firstFrame: FRAME, referenceImages: [FRAME] })).toThrow(/not both/);
    expect(() => seedance.buildBody({ ...base, referenceVideos: ["data:video/mp4;base64,AAAA"] })).toThrow(/public URLs/);
  });
});

describe("seedance.extractAssets", () => {
  it("returns the video and last frame from a recorded draft", () => {
    expect(seedance.extractAssets(draft as SeedanceResult)).toEqual([
      { kind: "video", url: draft.content.video_url },
      { kind: "frame", url: draft.content.last_frame_url },
    ]);
  });

  it("returns just the video when there's no last frame", () => {
    expect(seedance.extractAssets(referenceVideo as SeedanceResult)).toEqual([{ kind: "video", url: referenceVideo.content.video_url }]);
  });

  it("returns nothing once BytePlus has cleared the links", () => {
    expect(seedance.extractAssets({ id: "cgt-1", content: null })).toEqual([]);
  });
});

describe("seedance.draftTaskId", () => {
  it("reads the draft's task ID from a recorded draft", () => {
    expect(seedance.draftTaskId!(draft as SeedanceResult)).toBe("cgt-20261020013238-kgd82");
  });

  it("has none for a final", () => {
    expect(seedance.draftTaskId!({ id: "cgt-2", draft: false })).toBeUndefined();
  });
});
