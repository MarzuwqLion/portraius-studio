import { describe, expect, it } from "vitest";
import { adapterFor } from "@/lib/registry/adapters";
import type { GenerateImageInput, InlineImage, WanInput } from "@/lib/registry/inputs";
import { LOCAL_INPUT, type LocalBody, type LocalResult } from "@/lib/registry/local-body";
import { MODEL_IDS, REGISTRY } from "@/lib/registry/models";
import { frameCount, frameSize, localAssets, localText } from "./graph";
import { localSamples } from "./samples";

const JPEG: InlineImage = { mime: "image/jpeg", base64: "/9j/4AAQSkZJRgABAQ" };
const OTHER: InlineImage = { mime: "image/png", base64: "iVBORw0KGgoAAAANSUhEUg" };
const body = (modelId: string, input: unknown) => adapterFor(modelId).buildBody(input) as LocalBody;
const nodes = (b: LocalBody, type: string) => Object.values(b.prompt).filter((n) => n.class_type === type);

const image = (extra: Partial<GenerateImageInput> = {}): GenerateImageInput => ({ prompt: "p", references: [JPEG], aspectRatio: "16:9", size: "1K", quality: "fast", seed: 3, ...extra });
const wan = (extra: Partial<WanInput> = {}): WanInput => ({ stage: "generate", prompt: "p", durationSec: 5, aspect: 16 / 9, seed: 3, ...extra });

describe("local registry", () => {
  it("runs every local model on the ComfyUI's queue, under a local/ ID", () => {
    const local = REGISTRY.filter((e) => e.backend === "local");
    expect(local.length).toBe(7);
    for (const entry of local) {
      expect(entry.id.startsWith("local/")).toBe(true);
      expect(entry.delivery).toBe("queue");
    }
    expect(REGISTRY.filter((e) => e.id.startsWith("local/")).every((e) => e.backend === "local")).toBe(true);
  });
});

describe("Qwen-Image-Edit-2511", () => {
  it("sends each image once, named by its bytes, and takes three at most", () => {
    const b = body(MODEL_IDS.localQwenEdit, image({ references: [JPEG, OTHER, JPEG] }));
    expect(b.uploads.map((u) => u.name)).toEqual([expect.stringMatching(/^portraius-[0-9a-f]{16}\.jpg$/), expect.stringMatching(/\.png$/)]);
    expect(nodes(b, "LoadImage")).toHaveLength(3);
    expect(() => body(MODEL_IDS.localQwenEdit, image({ references: [JPEG, OTHER, JPEG], source: OTHER }))).toThrow(/3 images at most/);
  });

  it("uses the 4-step LoRA for Fast and the 8-step one for Best", () => {
    const steps = (quality: GenerateImageInput["quality"]) => {
      const b = body(MODEL_IDS.localQwenEdit, image({ quality }));
      return [nodes(b, "LoraLoaderModelOnly")[0]!.inputs.lora_name, nodes(b, "KSampler")[0]!.inputs.steps];
    };
    expect(steps("fast")).toEqual(["Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors", 4]);
    expect(steps("best")).toEqual(["Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors", 8]);
  });

  it("draws a new image at the asked shape, and an edit at its source's", () => {
    const fresh = body(MODEL_IDS.localQwenEdit, image({ aspectRatio: "4:5" }));
    expect(nodes(fresh, "EmptySD3LatentImage")[0]!.inputs).toMatchObject({ width: 912, height: 1152 });
    const edit = body(MODEL_IDS.localQwenEdit, image({ references: [], source: OTHER }));
    expect(nodes(edit, "EmptySD3LatentImage")).toHaveLength(0);
    expect(nodes(edit, "VAEEncode")).toHaveLength(1);
  });
});

describe("Wan 2.2", () => {
  it("picks T2V, I2V or first-last frame from what it's given", () => {
    const text = body(MODEL_IDS.localWanBest, wan());
    expect(nodes(text, "UNETLoader").map((n) => n.inputs.unet_name)).toEqual(["wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors", "wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors"]);
    expect(nodes(text, "EmptyHunyuanLatentVideo")[0]!.inputs).toMatchObject({ width: 1280, height: 720, length: 81 });
    const start = body(MODEL_IDS.localWanBest, wan({ firstFrame: `${LOCAL_INPUT}portraius-frame.jpg` }));
    expect(nodes(start, "WanImageToVideo")).toHaveLength(1);
    expect(start.uploads).toEqual([]);
    expect(nodes(start, "LoadImage")[0]!.inputs.image).toBe("portraius-frame.jpg");
    const both = body(MODEL_IDS.localWanBest, wan({ firstFrame: "data:image/jpeg;base64,AAA", lastFrame: "data:image/png;base64,BBB" }));
    expect(nodes(both, "WanFirstLastFrameToVideo")).toHaveLength(1);
  });

  it("splits the 14B steps between the high- and low-noise models", () => {
    const [high, low] = nodes(body(MODEL_IDS.localWanBest, wan()), "KSamplerAdvanced");
    expect(high!.inputs).toMatchObject({ add_noise: "enable", start_at_step: 0, end_at_step: 2, return_with_leftover_noise: "enable", noise_seed: 3 });
    expect(low!.inputs).toMatchObject({ add_noise: "disable", start_at_step: 2, return_with_leftover_noise: "disable" });
  });

  it("keeps clips within what each model makes", () => {
    expect(() => body(MODEL_IDS.localWanFast, wan({ durationSec: 8 }))).toThrow(/2 to 5 seconds/);
    expect(() => body(MODEL_IDS.localWanFast, wan({ firstFrame: "data:image/jpeg;base64,A", lastFrame: "data:image/jpeg;base64,B" }))).toThrow(/14B/);
    expect(() => body(MODEL_IDS.localWanBest, wan({ firstFrame: "https://example.com/a.jpg" }))).toThrow(/not as links/);
  });
});

describe("the rest", () => {
  const files = { front: JPEG, sheet: OTHER, still: JPEG, clip: `${LOCAL_INPUT}portraius-clip.mp4`, line: "data:audio/wav;base64,UklGRg" };

  it("builds every sample", () => {
    for (const sample of localSamples(files)) expect(Object.keys(body(sample.modelId, sample.input).prompt).length, sample.name).toBeGreaterThan(2);
  });

  it("speaks a line in as many 77-frame chunks as it needs", () => {
    const sample = localSamples(files).find((s) => s.modelId === MODEL_IDS.localWanSpeech)!;
    const long = body(MODEL_IDS.localWanSpeech, { ...(sample.input as object), durationSec: 12 });
    expect(nodes(long, "WanSoundImageToVideoExtend")).toHaveLength(2);
  });

  it("runs a long Recast clip in context windows", () => {
    const sample = localSamples(files).find((s) => s.modelId === MODEL_IDS.localWanAnimate)!;
    expect(nodes(body(MODEL_IDS.localWanAnimate, sample.input), "ContextWindowsManual")).toHaveLength(1);
    expect(nodes(body(MODEL_IDS.localWanAnimate, { ...(sample.input as object), durationSec: 2 }), "ContextWindowsManual")).toHaveLength(0);
  });
});

describe("results and sizes", () => {
  const raw: LocalResult = {
    outputs: {
      "12": { files: [{ filename: "wan_00001_.mp4", subfolder: "portraius", type: "output", url: "http://127.0.0.1:8188/api/view?filename=wan_00001_.mp4" }], text: [] },
      "4": { files: [{ filename: "a_00001_.png", subfolder: "", type: "output", url: "http://127.0.0.1:8188/api/view?filename=a_00001_.png" }], text: ['{"shots":[]}'] },
    },
  };

  it("reads each kind of file and the text", () => {
    expect(localAssets(raw, "video")).toEqual([{ kind: "video", url: "http://127.0.0.1:8188/api/view?filename=wan_00001_.mp4", mime: "video/mp4" }]);
    expect(localAssets(raw, "image")).toHaveLength(1);
    expect(localText(raw)).toBe('{"shots":[]}');
  });

  it("sizes frames by area and counts frames as 4n + 1", () => {
    expect(frameSize(16 / 9, 0.39, 16)).toEqual([848, 480]);
    expect(frameSize(9 / 16, 0.86, 32)).toEqual([704, 1280]);
    expect(frameCount(5, 16)).toBe(81);
    expect(frameCount(5, 24)).toBe(121);
  });
});
