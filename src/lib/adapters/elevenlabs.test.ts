import { describe, expect, it } from "vitest";
import { MAX_LINE_CHARS, elevenLabs } from "./elevenlabs";

describe("elevenLabs.buildBody", () => {
  it("sends each line with its voice, trimmed", () => {
    expect(elevenLabs.buildBody({ lines: [{ text: " I never sent it. ", voiceId: "JBFqnCBsd6RMkjVDRZzb" }], seed: 7 })).toEqual({
      inputs: [{ text: "I never sent it.", voice_id: "JBFqnCBsd6RMkjVDRZzb" }],
      seed: 7,
    });
  });

  it("makes a two-voice exchange one request", () => {
    const body = elevenLabs.buildBody({
      lines: [
        { text: "You kept it?", voiceId: "a" },
        { text: "Forty years.", voiceId: "b" },
      ],
    }) as { inputs: unknown[] };
    expect(body.inputs).toHaveLength(2);
    expect(body).not.toHaveProperty("seed");
  });

  it("refuses what the route refuses, or what can't be lip-synced", () => {
    expect(() => elevenLabs.buildBody({ lines: [] })).toThrow(/Write a line/);
    expect(() => elevenLabs.buildBody({ lines: [{ text: "  ", voiceId: "a" }] })).toThrow(/empty/);
    expect(() => elevenLabs.buildBody({ lines: [{ text: "Hi", voiceId: "" }] })).toThrow(/voice/);
    expect(() => elevenLabs.buildBody({ lines: [{ text: "x".repeat(MAX_LINE_CHARS + 1), voiceId: "a" }] })).toThrow(/under/);
    const eleven = Array.from({ length: 11 }, (_, i) => ({ text: "Hi.", voiceId: `v${i}` }));
    expect(() => elevenLabs.buildBody({ lines: eleven })).toThrow(/10 voices/);
  });
});

describe("elevenLabs.extractAssets", () => {
  it("hands the audio back inline with its type", () => {
    const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04]);
    expect(elevenLabs.extractAssets({ bytes, contentType: "audio/mpeg" })).toEqual([{ kind: "audio", mime: "audio/mpeg", base64: "SUQzBA==" }]);
    expect(elevenLabs.extractAssets({ bytes, contentType: "" })[0]!.mime).toBe("audio/mpeg");
    expect(elevenLabs.extractAssets({ bytes: new Uint8Array(), contentType: "audio/mpeg" })).toEqual([]);
  });
});
