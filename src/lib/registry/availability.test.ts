import { describe, expect, it } from "vitest";
import { defaultModel, featureOptions, type Reach } from "./availability";
import { localModelFiles } from "./local-models";
import { MODEL_IDS } from "./models";

const everything = (modelIds: string[]) => {
  const installed: Record<string, string[]> = {};
  for (const id of modelIds) for (const f of localModelFiles(id)) (installed[f.folder] ??= []).push(f.name);
  return installed;
};

const reach = (extra: Partial<Reach> = {}): Reach => ({ hasKey: false, neverSpend: false, localEnabled: false, localInstalled: null, ...extra });
const ids = (r: Reach, feature: Parameters<typeof featureOptions>[0] = "video") => featureOptions(feature, r).map((o) => o.id);

describe("where things run", () => {
  it("shows a first visit today's app: Router models, which prompt for a key", () => {
    expect(ids(reach())).toEqual([MODEL_IDS.seedance, MODEL_IDS.minimaxH3]);
    expect(defaultModel("video", reach())).toBe(MODEL_IDS.seedance);
  });

  it("shows a visitor with only a ComfyUI only their GPU", () => {
    const r = reach({ localEnabled: true, localInstalled: everything([MODEL_IDS.localWanBest, MODEL_IDS.localWanFast]) });
    expect(ids(r)).toEqual([MODEL_IDS.localWanBest, MODEL_IDS.localWanFast]);
    expect(defaultModel("video", r)).toBe(MODEL_IDS.localWanBest);
  });

  it("mixes both with a key, defaulting to Router until a default is saved", () => {
    const r = reach({ hasKey: true, localEnabled: true, localInstalled: everything([MODEL_IDS.localQwenEdit]) });
    expect(ids(r, "image")).toEqual([MODEL_IDS.localQwenEdit, MODEL_IDS.nanoBanana]);
    expect(defaultModel("image", r)).toBe(MODEL_IDS.nanoBanana);
    expect(defaultModel("image", r, MODEL_IDS.localQwenEdit)).toBe(MODEL_IDS.localQwenEdit);
  });

  it("hides every Router model when Never spend is on", () => {
    const r = reach({ hasKey: true, neverSpend: true, localEnabled: true, localInstalled: {} });
    expect(ids(r, "image")).toEqual([MODEL_IDS.localQwenEdit]);
    expect(defaultModel("image", r, MODEL_IDS.nanoBanana)).toBe(MODEL_IDS.localQwenEdit);
  });

  it("says what's missing, or that the ComfyUI didn't answer", () => {
    const missing = featureOptions("enhance", reach({ localEnabled: true, localInstalled: { vae: ["seedvr2_ema_vae_fp16.safetensors"] } }))[0]!;
    expect(missing.blocked).toBe("Missing on your ComfyUI: seedvr2_7b_int8_convrot.safetensors");
    expect(featureOptions("enhance", reach({ localEnabled: true }))[0]!.blocked).toMatch(/isn't reachable/);
    expect(featureOptions("image", reach({ localEnabled: true, localInstalled: {} }))[0]!.blocked).toBe("5 model files are missing on your ComfyUI. Settings lists them.");
  });
});
