import { describe, expect, it } from "vitest";
import recorded from "../../../test/fixtures/nano-banana-2.1.result.json";
import type { GenerateImageInput } from "@/lib/registry/inputs";
import { nanoBanana, type NanoBananaResult } from "./nano-banana";

const input: GenerateImageInput = {
  prompt: "Image 1 is the reference sheet for LEAD. Keep LEAD's exact face. LEAD reading in a coffee shop.",
  references: [
    { mime: "image/png", base64: "U0hFRVQ=" },
    { mime: "image/jpeg", base64: "UEhPVE8=" },
  ],
  aspectRatio: "4:5",
  size: "2K",
  quality: "best",
};

describe("nanoBanana.buildBody", () => {
  it("matches the spec's request body: text, then references, then generationConfig", () => {
    expect(nanoBanana.buildBody(input)).toEqual({
      contents: [
        {
          role: "user",
          parts: [
            { text: input.prompt },
            { inlineData: { mimeType: "image/png", data: "U0hFRVQ=" } },
            { inlineData: { mimeType: "image/jpeg", data: "UEhPVE8=" } },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: "4:5", imageSize: "2K" },
        thinkingConfig: { thinkingLevel: "HIGH" },
      },
    });
  });

  it("maps Fast to MINIMAL thinking", () => {
    const body = nanoBanana.buildBody({ ...input, quality: "fast" }) as { generationConfig: { thinkingConfig: unknown } };
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "MINIMAL" });
  });

  it("puts the source image first in edit mode", () => {
    const body = nanoBanana.buildBody({ ...input, source: { mime: "image/jpeg", base64: "U09VUkNF" } }) as {
      contents: { parts: { inlineData?: { data: string } }[] }[];
    };
    expect(body.contents[0]!.parts.map((p) => p.inlineData?.data)).toEqual([undefined, "U09VUkNF", "U0hFRVQ=", "UEhPVE8="]);
  });

  it("sends plain text-to-image with no references", () => {
    const body = nanoBanana.buildBody({ ...input, references: [] }) as { contents: { parts: unknown[] }[] };
    expect(body.contents[0]!.parts).toEqual([{ text: input.prompt }]);
  });
});

describe("nanoBanana.extractAssets", () => {
  it("returns only the final image from a recorded result, skipping the thought image", () => {
    const assets = nanoBanana.extractAssets(recorded as NanoBananaResult);
    expect(assets).toEqual([{ kind: "image", base64: "<base64 stripped: 2099612 chars>", mime: "image/png" }]);
  });

  it("reads fileData links when a partner serves the image", () => {
    const raw: NanoBananaResult = {
      candidates: [{ content: { parts: [{ text: "Here you go." }, { fileData: { mimeType: "image/png", fileUri: "https://example.com/a.png" } }] } }],
    };
    expect(nanoBanana.extractAssets(raw)).toEqual([{ kind: "image", url: "https://example.com/a.png", mime: "image/png" }]);
  });

  it("returns nothing when the model answered with text only", () => {
    expect(nanoBanana.extractAssets({ candidates: [{ content: { parts: [{ text: "I can't make that." }] }, finishReason: "STOP" }] })).toEqual([]);
    expect(nanoBanana.extractAssets({})).toEqual([]);
  });
});
