import { describe, expect, it } from "vitest";
import recorded from "../../../test/fixtures/freepik-skin.result.json";
import { DEFAULT_STRENGTH, freepikSkin, type FreepikSkinResult } from "./freepik-skin";

const image = { mime: "image/png" as const, base64: "U1RJTEw=" };

describe("freepikSkin.buildBody", () => {
  it("gives the spec's defaults at the default strength", () => {
    expect(freepikSkin.buildBody({ image, strength: DEFAULT_STRENGTH })).toEqual({ image: "U1RJTEw=", skin_detail: 80, sharpen: 10, smart_grain: 4 });
  });

  it("scales every setting with strength and clamps it to 0 to 100", () => {
    expect(freepikSkin.buildBody({ image, strength: 40 })).toEqual({ image: "U1RJTEw=", skin_detail: 40, sharpen: 5, smart_grain: 2 });
    expect(freepikSkin.buildBody({ image, strength: 140 })).toMatchObject({ skin_detail: 100 });
    expect(freepikSkin.buildBody({ image, strength: -5 })).toMatchObject({ skin_detail: 0, sharpen: 0, smart_grain: 0 });
  });

  it("refuses an empty image", () => {
    expect(() => freepikSkin.buildBody({ image: { mime: "image/png", base64: "" }, strength: 80 })).toThrow(RangeError);
  });
});

describe("freepikSkin.extractAssets", () => {
  it("reads Freepik's generated links from the recorded result", () => {
    const assets = freepikSkin.extractAssets(recorded as FreepikSkinResult);
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({ kind: "image" });
    expect(new URL(assets[0]!.url!).hostname).toBe("ai-statics.magnific.com");
  });
});
