// Cost before every run (spec: Rules for every call, 4; Decisions, October
// 21, item 2): the price from Router's /estimate when it gives one, otherwise
// a static table built from Comfy's published Partner Nodes pricing, shown as
// "≈ $0.12". A model with no published price shows no price at all. Every
// rate below cites its row in docs/notes/u1-notes.md.
import { requestBody } from "@/lib/registry/adapters";
import type { GenerateImageInput, GenerateVideoInput, H3Input, KlingInput, SpeechInput } from "@/lib/registry/inputs";
import { MODEL_IDS } from "@/lib/registry/models";
import { estimate } from "@/lib/router/client";
import type { JobEstimate } from "@/lib/types/jobs";

// "How credits work in Comfy": $1 = 211 credits.
export const CREDITS_PER_DOLLAR = 211;

// Comfy's published rates, in credits.
export const RATES = {
  // Image: Nano Banana, per 1K tokens.
  nanoBanana: { input: 0.4526, textOutput: 2.263, imageOutput: 9.05 },
  // Video: Seedance 2.5, per 1K tokens, without a reference video.
  seedance: { "480p": 3.229, "720p": 3.229, "1080p": 3.53 },
  // MiniMax H3, per second; reference images past the fifth cost extra.
  minimaxH3: { "768P": 27.16, "2K": 39.22, extraImage: 12.07, includedImages: 5 },
  // HappyHorse 1.0 video edit, per second of output (the input clip's length).
  happyHorseEdit: { "720P": 29.54, "1080P": 50.64 },
  // Kling V3 Omni generation, per second (std is 720p, pro 1080p).
  klingOmni: { std: { silent: 17.72, sound: 23.63 }, pro: { silent: 23.63, sound: 29.54 } },
  // Magnific Image Skin Enhancer (faithful), per run: Freepik's skin enhancer.
  freepikSkin: 78.07,
  // ElevenLabs Text to Dialogue (eleven_v4), per 1K characters.
  elevenLabs: 24.14,
  // Anthropic Sonnet 5.5, per 1K tokens.
  directorAgent: { input: 0.603, output: 3.017 },
} as const;

// Token counts the rates multiply. Output image tokens per size are Google's
// published figures for Nano Banana 2; the app's own 1K runs billed exactly
// 1,120. Thinking and prompt sizes are from the recorded fixtures.
export const NANO_TOKENS = {
  image: { "1K": 1120, "2K": 1680, "4K": 2520 },
  thinking: { fast: 0, best: 1000 },
  promptText: 400,
  referenceImage: 1120,
} as const;

// Seedance bills (input video + output) seconds × width × height × fps ÷ 1024
// tokens. The 16:9 frame stands in for every ratio (the others are within a
// few per cent of its pixel count).
export const SEEDANCE_FRAME = { "480p": [864, 480], "720p": [1280, 720], "1080p": [1920, 1080] } as const;
const SEEDANCE_FPS = 24;

// The Director agent's typical exchange: the scene card in, 3 to 6 shots out.
const AGENT_TOKENS = { input: 2500, output: 1500 };

type Credits = number | undefined;

function nanoCredits(input: Partial<GenerateImageInput>): Credits {
  const size = input.size ?? "1K";
  const quality = input.quality ?? "best";
  const references = (input.references?.length ?? 0) + (input.source ? 1 : 0);
  const inputTokens = NANO_TOKENS.promptText + references * NANO_TOKENS.referenceImage;
  return (
    (NANO_TOKENS.image[size] * RATES.nanoBanana.imageOutput +
      NANO_TOKENS.thinking[quality] * RATES.nanoBanana.textOutput +
      inputTokens * RATES.nanoBanana.input) /
    1000
  );
}

function seedanceCredits(input: Partial<GenerateVideoInput>): Credits {
  if (input.stage !== "draft" || typeof input.durationSec !== "number") return undefined;
  const [w, h] = SEEDANCE_FRAME["480p"];
  return ((input.durationSec * w * h * SEEDANCE_FPS) / 1024 / 1000) * RATES.seedance["480p"];
}

// A Seedance final from a draft: the same clip again at 1080p.
export function seedanceFinalCredits(durationSec: number): number {
  const [w, h] = SEEDANCE_FRAME["1080p"];
  return ((durationSec * w * h * SEEDANCE_FPS) / 1024 / 1000) * RATES.seedance["1080p"];
}

function h3Credits(input: Partial<H3Input>): Credits {
  if (typeof input.durationSec !== "number") return undefined;
  const images = input.referenceImages?.length ?? 0;
  const extra = Math.max(0, images - RATES.minimaxH3.includedImages) * RATES.minimaxH3.extraImage;
  return input.durationSec * RATES.minimaxH3[input.resolution ?? "768P"] + extra;
}

function klingCredits(input: Partial<KlingInput>): Credits {
  const seconds = input.shots ? input.shots.reduce((sum, s) => sum + s.durationSec, 0) : input.durationSec;
  if (typeof seconds !== "number" || input.video) return undefined;
  return seconds * RATES.klingOmni[input.quality ?? "std"][input.sound ? "sound" : "silent"];
}

// Inputs that change the price but aren't in the request body, such as a
// video edit's length (the output matches the clip).
export interface PriceHints {
  durationSec?: number;
}

// The static price for one run, in credits; undefined when Comfy publishes
// no price for this model or the input doesn't say enough.
export function staticCredits(modelId: string, input: unknown, hints: PriceHints = {}): Credits {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (modelId) {
    case MODEL_IDS.nanoBanana:
      return nanoCredits(i as Partial<GenerateImageInput>);
    case MODEL_IDS.seedance:
      return seedanceCredits(i as Partial<GenerateVideoInput>);
    case MODEL_IDS.minimaxH3:
      return h3Credits(i as Partial<H3Input>);
    case MODEL_IDS.happyHorseEdit:
      return hints.durationSec === undefined ? undefined : hints.durationSec * RATES.happyHorseEdit["720P"];
    case MODEL_IDS.klingOmni:
      return klingCredits(i as Partial<KlingInput>);
    case MODEL_IDS.freepikSkin:
      return RATES.freepikSkin;
    case MODEL_IDS.elevenLabs: {
      const chars = ((i as Partial<SpeechInput>).lines ?? []).reduce((sum, l) => sum + l.text.length, 0);
      return chars ? (chars / 1000) * RATES.elevenLabs : undefined;
    }
    case MODEL_IDS.directorAgent:
      return (AGENT_TOKENS.input * RATES.directorAgent.input + AGENT_TOKENS.output * RATES.directorAgent.output) / 1000;
    default:
      // Sync-3 and the rest: no published price, so none is shown.
      return undefined;
  }
}

export const creditsToCents = (credits: number) => Math.max(1, Math.round((credits / CREDITS_PER_DOLLAR) * 100));

// The static table as an estimate: one figure, marked as an estimate.
export function staticEstimate(modelId: string, input: unknown, hints?: PriceHints): JobEstimate {
  const credits = staticCredits(modelId, input, hints);
  if (credits === undefined) return { source: "unknown" };
  const cents = creditsToCents(credits);
  return { source: "estimated", amountCents: cents, minCents: cents, maxCents: cents };
}

// Several estimates added together (Image, then animate: the still and the
// clip), or one multiplied (four takes). Unknown if any part is unknown.
export function addEstimates(parts: JobEstimate[], times = 1): JobEstimate {
  if (!parts.length || parts.some((p) => p.source === "unknown")) return { source: "unknown" };
  const low = (p: JobEstimate) => p.minCents ?? p.amountCents ?? 0;
  const high = (p: JobEstimate) => p.maxCents ?? p.amountCents ?? 0;
  const min = parts.reduce((sum, p) => sum + low(p), 0) * times;
  const max = parts.reduce((sum, p) => sum + high(p), 0) * times;
  const exact = parts.every((p) => p.source === "exact");
  return exact ? { source: "exact", amountCents: min } : { source: "estimated", ...(min === max ? { amountCents: min } : {}), minCents: min, maxCents: max };
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// "$0.24" for Router's exact price, "≈ $0.24" for one estimated figure,
// "$0.20 to $0.30" for a range; undefined when there is no price.
export function estimateLabel(e: JobEstimate | undefined): string | undefined {
  if (e?.source === "exact" && e.amountCents !== undefined) return dollars(e.amountCents);
  if (e?.source === "estimated") {
    const min = e.minCents ?? e.amountCents;
    const max = e.maxCents ?? e.amountCents;
    if (min === undefined || max === undefined) return undefined;
    return min === max ? `≈ ${dollars(min)}` : `${dollars(min)} to ${dollars(max)}`;
  }
  return undefined;
}

// "Make it real · $0.37", or just "Make it real" when there's no price.
export const withPrice = (text: string, price: string | undefined) => (price ? `${text} · ${price}` : text);

// Never throws: Router's price when it has one, else the static table.
export async function estimateRun(modelId: string, input: unknown, hints?: PriceHints): Promise<JobEstimate> {
  try {
    const res = await estimate(modelId, requestBody(modelId, input));
    if (res.estimate.source !== "unknown") return res.estimate;
  } catch {
    // No key yet, or /estimate isn't enabled for it: fall through to the table.
  }
  return staticEstimate(modelId, input, hints);
}
