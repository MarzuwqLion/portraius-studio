import { describe, expect, it } from "vitest";
import { preset } from "@/lib/presets/load";
import { TRY_WITH } from "@/lib/tour/tour";
import { launchOf } from "./launch";

describe("Try this with Walt", () => {
  it("names only presets that exist, in the studio it opens", () => {
    for (const [chapter, target] of Object.entries(TRY_WITH)) {
      if (!target.presetId) continue;
      const p = preset(target.presetId);
      expect(p, chapter).toBeDefined();
      expect(`/${p!.type}`, chapter).toBe(target.to);
      expect(p!.recipe.slots.some((s) => s.slot === "lead" && s.kind === "person"), chapter).toBe(true);
    }
  });
});

describe("launchOf", () => {
  it("reads a preset, a cast and the sample clip from router state", () => {
    expect(launchOf({ presetId: "film-still", cast: [{ slot: "lead", characterId: "w" }], sampleClip: true })).toEqual({ presetId: "film-still", cast: [{ slot: "lead", characterId: "w" }], sampleClip: true });
  });

  it("ignores anything else", () => {
    expect(launchOf(null)).toBeUndefined();
    expect(launchOf({ usr: 1 })).toBeUndefined();
    expect(launchOf({ cast: [{ slot: 3 }], presetId: 7 })).toBeUndefined();
  });
});
