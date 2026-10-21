import { describe, expect, it } from "vitest";
import { IMAGE_PRESETS } from "@/lib/presets/load";
import { validateRecipe } from "@/lib/recipes/share";
import { MODEL_IDS } from "@/lib/registry/models";
import type { Job } from "@/lib/types/jobs";
import type { ImageRequest } from "./image";
import { matchingPreset, recipeFromJob } from "./remix";
import type { VideoRequest } from "./video";

const kinds = new Map<string, "person" | "element">([
  ["walt", "person"],
  ["coat", "element"],
]);

const imageRequest: ImageRequest = {
  scene: "{lead} in {outfit} at a rainy bus stop",
  cast: [
    { slot: "lead", characterId: "walt" },
    { slot: "outfit", characterId: "coat" },
  ],
  aspectRatio: "4:5",
  size: "2K",
  quality: "best",
  count: 2,
  camera: { size: "MS", lens: undefined as unknown as string, look: "warm-film" },
};

const job = (kind: Job["kind"], modelId: string, input: object) => ({ id: "j", kind, modelId, input }) as unknown as Job;

describe("recipeFromJob", () => {
  it("turns an image into a recipe with slots, never characters", () => {
    const r = recipeFromJob(job("image", MODEL_IDS.nanoBanana, { model: { seed: 42 }, characterIds: ["walt", "coat"], request: imageRequest }), kinds)!;
    expect(validateRecipe(r)).toEqual(r);
    expect(r).toMatchObject({
      capability: "image.generate",
      slots: [
        { slot: "lead", kind: "person" },
        { slot: "outfit", kind: "element" },
      ],
      prompt: imageRequest.scene,
      camera: { size: "MS", look: "warm-film" },
      params: { aspectRatio: "4:5", size: "2K", quality: "best" },
      seed: 42,
    });
    expect(JSON.stringify(r)).not.toMatch(/walt|coat/);
  });

  it("won't share an edit or an advanced prompt, which carry the person's own image or description", () => {
    expect(recipeFromJob(job("image", MODEL_IDS.nanoBanana, { model: {}, characterIds: [], request: { ...imageRequest, sourceBlobId: "upload:1" } }), kinds)).toBeUndefined();
    expect(recipeFromJob(job("image", MODEL_IDS.nanoBanana, { model: {}, characterIds: [], request: { ...imageRequest, promptOverride: "Walt Harmon, retired..." } }), kinds)).toBeUndefined();
    expect(recipeFromJob(job("image", MODEL_IDS.nanoBanana, { model: {}, characterIds: [] }), kinds)).toBeUndefined();
  });

  it("shares text, Still first and References videos, not first-frame ones", () => {
    const request: VideoRequest = { mode: "still", model: MODEL_IDS.seedance, scene: "{lead} walks out into the rain", cast: [{ slot: "lead", characterId: "walt" }], durationSec: 8, ratio: "9:16", audio: true, seed: 7, h3Resolution: "768P", camera: { movement: "slow-push-in" } };
    const r = recipeFromJob(job("video", MODEL_IDS.minimaxH3, { model: {}, characterIds: ["walt"], request }), kinds)!;
    expect(validateRecipe(r)).toEqual(r);
    expect(r).toMatchObject({ capability: "video.generate", model: MODEL_IDS.seedance, params: { mode: "still", durationSec: 8, ratio: "9:16" }, seed: 7 });
    expect(recipeFromJob(job("video", MODEL_IDS.seedance, { model: {}, characterIds: [], request: { ...request, mode: "image", sourceBlobId: "x" } }), kinds)).toBeUndefined();
  });

  it("leaves Recast and sheets out", () => {
    expect(recipeFromJob(job("recast", MODEL_IDS.minimaxH3, { model: {}, characterIds: [], request: {} }), kinds)).toBeUndefined();
    expect(recipeFromJob(job("sheet", MODEL_IDS.nanoBanana, { model: {}, characterIds: [], request: imageRequest }), kinds)).toBeUndefined();
  });
});

describe("matchingPreset", () => {
  const yearbook = IMAGE_PRESETS.find((p) => p.id === "yearbook-1996")!;
  const recipe = { model: yearbook.recipe.model, prompt: yearbook.recipe.prompt, params: { ...yearbook.recipe.params } };

  it("finds the shipped preset with the same model, prompt and params", () => {
    expect(matchingPreset(recipe, IMAGE_PRESETS)?.id).toBe("yearbook-1996");
  });

  it("allows params the preset doesn't set, like size and count", () => {
    expect(matchingPreset({ ...recipe, params: { ...recipe.params, size: "2K", count: 2 } }, IMAGE_PRESETS)?.id).toBe("yearbook-1996");
  });

  it("finds nothing when the prompt, model or a preset param differs", () => {
    expect(matchingPreset({ ...recipe, prompt: `${recipe.prompt} At night.` }, IMAGE_PRESETS)).toBeUndefined();
    expect(matchingPreset({ ...recipe, model: MODEL_IDS.seedance }, IMAGE_PRESETS)).toBeUndefined();
    expect(matchingPreset({ ...recipe, params: { ...recipe.params, aspectRatio: "21:9" } }, IMAGE_PRESETS)).toBeUndefined();
  });
});
