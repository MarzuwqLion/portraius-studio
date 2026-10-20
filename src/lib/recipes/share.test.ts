import { describe, expect, it } from "vitest";
import { canonicalJson, decodeRecipe, encodeRecipe, recipeHash, recipeToPreset, remixLink, validateRecipe, type RecipeFile } from "./share";

const recipe: RecipeFile = {
  format: "portraius.recipe",
  version: 1,
  capability: "video.generate",
  model: "byteplus/dreamina-seedance-2-5-260628",
  slots: [{ slot: "lead", kind: "person" }],
  prompt: "{lead} walks out of a neon-lit diner, rain on the pavement",
  camera: { movement: "slow-push-in", lens: "35mm" },
  params: { mode: "still", durationSec: 8, ratio: "9:16", audio: true },
  seed: 1234,
};

describe("remix links", () => {
  it("round-trip a recipe through the URL fragment", async () => {
    const link = await remixLink(recipe, "https://example.github.io/portraius-studio/");
    expect(link).toMatch(/^https:\/\/example\.github\.io\/portraius-studio\/#\/remix\?r=[A-Za-z0-9_-]+$/);
    const param = new URL(link.replace("#/remix", "/remix")).searchParams.get("r")!;
    expect(await decodeRecipe(param)).toEqual(recipe);
  });

  it("hash the same recipe the same way whatever the key order", async () => {
    const shuffled = { seed: 1234, params: { audio: true, ratio: "9:16", durationSec: 8, mode: "still" }, ...recipe } as RecipeFile;
    expect(canonicalJson(shuffled)).toBe(canonicalJson(recipe));
    expect(await recipeHash(shuffled)).toBe(await recipeHash(recipe));
    expect(await recipeHash({ ...recipe, seed: 1 })).not.toBe(await recipeHash(recipe));
  });

  it("refuse damaged links and recipes the app can't run", async () => {
    await expect(decodeRecipe("not-a-recipe")).rejects.toThrow(/damaged/);
    expect(() => validateRecipe({ ...recipe, model: "higgsfield/soul" })).toThrow(/doesn't allow/);
    expect(() => validateRecipe({ ...recipe, capability: "video.edit" })).toThrow(/can't be remixed/);
    expect(() => validateRecipe({ ...recipe, prompt: "{lead} and {second}" })).toThrow(/doesn't declare/);
    expect(() => validateRecipe({ ...recipe, version: 2 })).toThrow(/can read/);
  });

  it("never carry anything but the recipe", async () => {
    const withFace = { ...recipe, descriptor: [0.1, 0.2], photo: "data:image/jpeg;base64,AAAA" };
    const param = await encodeRecipe(validateRecipe(withFace));
    const decoded = await decodeRecipe(param);
    expect(decoded).not.toHaveProperty("descriptor");
    expect(decoded).not.toHaveProperty("photo");
  });

  it("turn into a preset file ready for a pull request", () => {
    const preset = recipeToPreset(recipe, "Neon diner exit!");
    expect(preset).toMatchObject({ format: "portraius.preset", id: "neon-diner-exit", type: "video", title: "Neon diner exit!", license: "CC0-1.0" });
    expect(preset.recipe).not.toHaveProperty("seed");
    expect(preset.recipe.prompt).toBe(recipe.prompt);
  });
});
