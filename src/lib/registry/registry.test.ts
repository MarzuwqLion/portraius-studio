import { describe, expect, it } from "vitest";
import freepikRecorded from "../../../test/fixtures/freepik-skin.result.json";
import { adapterFor, allAdapters } from "./adapters";
import { DEFAULT_VIDEO_MODEL, MODEL_IDS, REGISTRY, isAllowedModel, registryEntry } from "./models";

describe("registry", () => {
  it("holds no Higgsfield model and refuses one", () => {
    expect(REGISTRY.some((entry) => entry.id.toLowerCase().startsWith("higgsfield/"))).toBe(false);
    expect(isAllowedModel("higgsfield/seedance-2-5")).toBe(false);
    expect(isAllowedModel("vertexai/gemini-3.1-flash-image")).toBe(false);
  });

  it("uses Nano Banana 2.1 and defaults video to Seedance 2.5", () => {
    expect(MODEL_IDS.nanoBanana).toBe("vertexai/gemini-nano-banana-2.1");
    expect(DEFAULT_VIDEO_MODEL).toBe(MODEL_IDS.seedance);
  });

  it("gives every adapter the capabilities and delivery of its registry entry", () => {
    for (const adapter of allAdapters()) {
      const entry = registryEntry(adapter.id);
      expect(entry, adapter.id).toBeDefined();
      expect(adapter.capabilities).toEqual(entry!.capabilities);
      expect(adapter.delivery).toBe(entry!.delivery);
    }
  });

  it("stubs adapters whose milestone hasn't come", () => {
    expect(() => adapterFor(MODEL_IDS.minimaxH3).buildBody({})).toThrow(/M3/);
    expect(() => adapterFor(MODEL_IDS.sync3).buildBody({})).toThrow(/M7/);
  });

  it("reads a recorded Freepik result already", () => {
    expect(adapterFor(MODEL_IDS.freepikSkin).extractAssets(freepikRecorded)).toEqual([
      { kind: "image", url: freepikRecorded.data.generated[0] },
    ]);
  });
});
