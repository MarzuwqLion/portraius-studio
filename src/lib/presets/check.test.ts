import { describe, expect, it } from "vitest";
import { checkPresets, type PresetSource } from "./check";

const camera: PresetSource = {
  path: "presets/camera/size.json",
  data: { format: "portraius.camera", version: 1, group: "size", appliesTo: "shot", options: [{ id: "MS", label: "Medium", phrase: "a medium shot" }] },
};

function preset(over: Record<string, unknown> = {}, recipe: Record<string, unknown> = {}, path = "presets/image/headshot.json"): PresetSource {
  return {
    path,
    data: {
      format: "portraius.preset",
      version: 1,
      id: "headshot",
      type: "image",
      title: "Headshot",
      author: "someone",
      license: "CC0-1.0",
      recipe: { capability: "image.generate", model: "vertexai/gemini-nano-banana-2.1", slots: [{ slot: "lead", kind: "person" }], prompt: "{lead} in a studio", camera: { size: "MS" }, ...recipe },
      ...over,
    },
  };
}

const none = () => undefined;

describe("checkPresets", () => {
  it("passes a good preset", () => {
    expect(checkPresets([camera, preset()], none)).toEqual([]);
  });

  it("catches a file in the wrong folder, a wrong name and a duplicate ID", () => {
    const problems = checkPresets([camera, preset({}, {}, "presets/video/headshot.json"), preset({}, {}, "presets/image/other.json")], none);
    expect(problems.some((p) => p.includes('type "image" belongs in presets/image/'))).toBe(true);
    expect(problems.some((p) => p.includes("file name should be headshot.json"))).toBe(true);
    expect(problems.some((p) => p.includes('"headshot" is already used'))).toBe(true);
  });

  it("refuses models the app doesn't allow, Higgsfield included", () => {
    expect(checkPresets([camera, preset({}, { model: "higgsfield/soul" })], none)[0]).toMatch(/isn't a model the app allows/);
  });

  it("needs every prompt slot declared and every camera pick to exist", () => {
    const problems = checkPresets([camera, preset({}, { prompt: "{lead} and {second}", camera: { size: "XXL", wobble: "yes" } })], none);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining("{second}, which isn't in slots"),
        expect.stringContaining('size "XXL" doesn\'t exist'),
        expect.stringContaining('"wobble" isn\'t a camera group'),
      ]),
    );
  });

  it("flags brand and celebrity names as whole words only", () => {
    expect(checkPresets([camera, preset({ title: "Nike ad" })], none)).toEqual([expect.stringContaining('mentions "nike"')]);
    expect(checkPresets([camera, preset({}, { prompt: "{lead} eats a pineapple in a disneyland-free park" })], none)).toEqual([]);
  });

  it("caps thumbnails at 200 KB and needs them to exist", () => {
    const withThumb = preset({ thumbnail: "headshot.webp" });
    expect(checkPresets([camera, withThumb], () => 150 * 1024)).toEqual([]);
    expect(checkPresets([camera, withThumb], () => 300 * 1024)[0]).toMatch(/300 KB/);
    expect(checkPresets([camera, withThumb], none)[0]).toMatch(/missing/);
  });

  it("reports schema errors with the path", () => {
    expect(checkPresets([preset({ version: 2 })], none)[0]).toMatch(/^presets\/image\/headshot.json: version/);
  });
});

describe("checkPresets on presets/voices.json", () => {
  const voices = (list: unknown[]): PresetSource => ({ path: "presets/voices.json", data: { format: "portraius.voices", version: 1, provider: "elevenlabs", voices: list } });
  const george = { id: "JBFqnCBsd6RMkjVDRZzb", label: "George", description: "Mid pitch, warm storyteller, British", preview: "george.mp3" };

  it("passes a voice with its preview", () => {
    expect(checkPresets([voices([george])], (path) => (path === "public/voices/george.mp3" ? 70_000 : undefined))).toEqual([]);
  });

  it("catches a missing or large preview, a repeated voice and a bad ID", () => {
    expect(checkPresets([voices([george])], none)[0]).toMatch(/preview public\/voices\/george.mp3 is missing/);
    expect(checkPresets([voices([george])], () => 200_000)[0]).toMatch(/keep it under 120 KB/);
    expect(checkPresets([voices([george, george])], () => 1)).toEqual([expect.stringContaining("listed twice")]);
    expect(checkPresets([voices([{ ...george, id: "short" }])], () => 1)[0]).toMatch(/voices\.0\.id/);
  });
});
