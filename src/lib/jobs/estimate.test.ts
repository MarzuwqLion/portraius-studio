// The static price table (spec: Decisions, October 21, item 2): Comfy's
// published rates turned into dollars, checked against what Router billed.
import { describe, expect, it } from "vitest";
import seedanceDraft from "../../../test/fixtures/seedance-2.5.draft.result.json";
import seedanceFinal from "../../../test/fixtures/seedance-2.5.final.result.json";
import nanoFixture from "../../../test/fixtures/nano-banana-2.1.result.json";
import { MODEL_IDS } from "@/lib/registry/models";
import { addEstimates, CREDITS_PER_DOLLAR, estimateLabel, NANO_TOKENS, perSecondLabel, SEEDANCE_FRAME, seedanceFinalCredits, staticCredits, staticEstimate, withPrice } from "./estimate";

const dollars = (credits: number | undefined) => (credits === undefined ? undefined : Math.round((credits / CREDITS_PER_DOLLAR) * 100) / 100);
const seedanceTokens = (seconds: number, [w, h]: readonly [number, number]) => (seconds * w * h * 24) / 1024;

describe("the static price table", () => {
  it("prices a Nano Banana still by size and quality", () => {
    expect(dollars(staticCredits(MODEL_IDS.nanoBanana, { size: "1K", quality: "fast", references: [] }))).toBe(0.05);
    expect(dollars(staticCredits(MODEL_IDS.nanoBanana, { size: "2K", quality: "best", references: [] }))).toBe(0.08);
    expect(dollars(staticCredits(MODEL_IDS.nanoBanana, { size: "4K", quality: "best", references: [] }))).toBe(0.12);
  });

  it("uses the image token count Router billed for a 1K still", () => {
    const billed = nanoFixture.usageMetadata.candidatesTokensDetails.find((d) => d.modality === "IMAGE")!.tokenCount;
    expect(NANO_TOKENS.image["1K"]).toBe(billed);
  });

  it("prices a Seedance draft by Comfy's token formula, within 1% of what Router billed", () => {
    const draft = seedanceTokens(seedanceDraft.duration, SEEDANCE_FRAME["480p"]);
    expect(Math.abs(draft - seedanceDraft.usage.total_tokens) / seedanceDraft.usage.total_tokens).toBeLessThan(0.01);
    const final = seedanceTokens(seedanceFinal.duration, SEEDANCE_FRAME["1080p"]);
    expect(Math.abs(final - seedanceFinal.usage.total_tokens) / seedanceFinal.usage.total_tokens).toBeLessThan(0.02);
    expect(dollars(staticCredits(MODEL_IDS.seedance, { stage: "draft", durationSec: 4 }))).toBe(0.59);
    expect(dollars(seedanceFinalCredits(4))).toBe(3.25);
  });

  it("prices MiniMax H3 per second, with reference images past the fifth extra", () => {
    expect(dollars(staticCredits(MODEL_IDS.minimaxH3, { stage: "generate", durationSec: 5, resolution: "768P" }))).toBe(0.64);
    expect(dollars(staticCredits(MODEL_IDS.minimaxH3, { stage: "generate", durationSec: 5, resolution: "2K" }))).toBe(0.93);
    const seven = Array.from({ length: 7 }, () => "x");
    expect(staticCredits(MODEL_IDS.minimaxH3, { stage: "generate", durationSec: 5, referenceImages: seven })).toBeCloseTo(5 * 27.16 + 2 * 12.07);
  });

  it("prices a video edit by the clip's length, which the request body doesn't carry", () => {
    expect(staticCredits(MODEL_IDS.happyHorseEdit, { prompt: "p", videoUrl: "u" })).toBeUndefined();
    expect(dollars(staticCredits(MODEL_IDS.happyHorseEdit, { prompt: "p", videoUrl: "u" }, { durationSec: 6 }))).toBe(0.84);
  });

  it("prices a Kling one-take by its shots' total length", () => {
    const shots = [{ prompt: "a", durationSec: 4 }, { prompt: "b", durationSec: 5 }];
    expect(staticCredits(MODEL_IDS.klingOmni, { prompt: "", shots, quality: "std" })).toBeCloseTo(9 * 17.72);
    expect(staticCredits(MODEL_IDS.klingOmni, { prompt: "", shots, quality: "std", sound: true })).toBeCloseTo(9 * 23.63);
  });

  it("prices the skin pass per run and a spoken line per character", () => {
    expect(dollars(staticCredits(MODEL_IDS.freepikSkin, {}))).toBe(0.37);
    expect(staticCredits(MODEL_IDS.elevenLabs, { lines: [{ text: "x".repeat(500), voiceId: "v" }] })).toBeCloseTo(12.07);
  });

  it("shows no price for a model Comfy publishes none for", () => {
    expect(staticEstimate(MODEL_IDS.sync3, { videoUrl: "a", audioUrl: "b" })).toEqual({ source: "unknown" });
    expect(staticEstimate(MODEL_IDS.wanVideoEdit, {})).toEqual({ source: "unknown" });
  });
});

describe("price labels", () => {
  it("marks a static figure as an estimate, and an exact one plainly", () => {
    expect(estimateLabel(staticEstimate(MODEL_IDS.minimaxH3, { stage: "generate", durationSec: 5, resolution: "768P" }))).toBe("≈ $0.64");
    expect(estimateLabel({ source: "exact", amountCents: 24 })).toBe("$0.24");
    expect(estimateLabel({ source: "estimated", minCents: 20, maxCents: 30 })).toBe("$0.20 to $0.30");
    expect(estimateLabel({ source: "unknown" })).toBeUndefined();
  });

  it("adds a still and its clip, and multiplies takes; any unknown part hides the price", () => {
    const still = staticEstimate(MODEL_IDS.nanoBanana, { size: "2K", quality: "best", references: [] });
    const clip = staticEstimate(MODEL_IDS.minimaxH3, { stage: "generate", durationSec: 5, resolution: "768P" });
    expect(estimateLabel(addEstimates([still, clip]))).toBe("≈ $0.72");
    expect(estimateLabel(addEstimates([still], 4))).toBe("≈ $0.32");
    expect(estimateLabel(addEstimates([still, { source: "unknown" }]))).toBeUndefined();
  });

  it("gives a clip-priced model's rate before there's a clip", () => {
    expect(perSecondLabel(MODEL_IDS.minimaxH3)).toBe("≈ $0.13 a second");
    expect(perSecondLabel(MODEL_IDS.minimaxH3, "2K")).toBe("≈ $0.19 a second");
    expect(perSecondLabel(MODEL_IDS.happyHorseEdit)).toBe("≈ $0.14 a second");
    expect(perSecondLabel(MODEL_IDS.nanoBanana)).toBeUndefined();
  });

  it("never says credits, free or local", () => {
    for (const label of [estimateLabel({ source: "exact", amountCents: 1 }), withPrice("Generate", "≈ $0.05"), withPrice("Generate", undefined)]) {
      expect(label).not.toMatch(/credit|free|local/i);
    }
    expect(withPrice("Generate", undefined)).toBe("Generate");
  });
});
