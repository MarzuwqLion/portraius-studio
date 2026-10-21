// Remix (spec: Remix links): a finished image or video becomes a recipe, and
// a recipe runs again with the visitor's own characters in its slots.
import { onJobDone, type JobInput } from "@/lib/jobs/runner";
import type { CameraSelection } from "@/lib/prompts/camera";
import type { Preset } from "@/lib/presets/schema";
import { canonicalJson, recipeHash, type RecipeFile } from "@/lib/recipes/share";
import type { GenerateImageInput, ImageAspectRatio, VideoRatio } from "@/lib/registry/inputs";
import { MODEL_IDS } from "@/lib/registry/models";
import { db } from "@/lib/store/db";
import type { Job } from "@/lib/types/jobs";
import type { CastPick } from "./cast";
import { randomSeed, startImages, type ImageRequest } from "./image";
import { DEFAULT_MODEL, VIDEO_MODELS, startVideo, type VideoMode, type VideoModel, type VideoRequest } from "./video";

type Kind = "person" | "element";

function cameraOf(selection: CameraSelection): Record<string, string> {
  return Object.fromEntries(Object.entries(selection).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""));
}

const slotsOf = (cast: CastPick[], kinds: Map<string, Kind>) => cast.map((c) => ({ slot: c.slot, kind: kinds.get(c.characterId) ?? "person" }));

// The recipe behind a job, or nothing when it can't be shared: an edit or an
// "image" video needs the original person's own picture, and an advanced
// prompt override holds the compiled prompt, character descriptions and all.
export function recipeFromJob(job: Job, kinds: Map<string, Kind>): RecipeFile | undefined {
  const input = job.input as JobInput<GenerateImageInput> & { request?: ImageRequest | VideoRequest };
  const request = input.request;
  if (!request) return undefined;
  if (job.kind === "image" && job.modelId === MODEL_IDS.nanoBanana) {
    const r = request as ImageRequest;
    if (r.sourceBlobId || r.promptOverride) return undefined;
    return {
      format: "portraius.recipe",
      version: 1,
      capability: "image.generate",
      model: MODEL_IDS.nanoBanana,
      slots: slotsOf(r.cast, kinds),
      prompt: r.scene,
      camera: cameraOf(r.camera),
      params: { aspectRatio: r.aspectRatio, size: r.size, quality: r.quality },
      ...(typeof input.model?.seed === "number" ? { seed: input.model.seed } : {}),
    };
  }
  if (job.kind === "video") {
    const r = request as VideoRequest;
    if (r.mode === "image") return undefined;
    return {
      format: "portraius.recipe",
      version: 1,
      capability: "video.generate",
      model: r.model,
      slots: slotsOf(r.cast, kinds),
      prompt: r.scene,
      camera: cameraOf(r.camera),
      params: { mode: r.mode, durationSec: r.durationSec, ratio: r.ratio, audio: r.audio, h3Resolution: r.h3Resolution },
      seed: r.seed,
    };
  }
  return undefined;
}

export async function recipeForGeneration(generationId: string): Promise<RecipeFile | undefined> {
  const generation = await db.generations.get(generationId);
  const job = generation ? await db.jobs.get(generation.jobId) : undefined;
  if (!job) return undefined;
  const characters = await db.characters.toArray();
  return recipeFromJob(job, new Map(characters.map((c) => [c.id, c.kind])));
}

const IMAGE_RATIOS: ImageAspectRatio[] = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
const VIDEO_RATIOS: VideoRatio[] = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "9:21"];
const VIDEO_MODES: VideoMode[] = ["text", "still", "references"];

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

// Runs a recipe with the visitor's picks (one per slot). Returns where the
// result will appear.
export async function startRemix(r: RecipeFile, cast: CastPick[]): Promise<"image" | "video"> {
  const remixOf = await recipeHash(r);
  const p = r.params ?? {};
  if (r.capability === "image.generate") {
    await startImages({
      scene: r.prompt,
      cast,
      aspectRatio: pick(p.aspectRatio, IMAGE_RATIOS, "4:5"),
      size: pick(p.size, ["1K", "2K", "4K"] as const, "2K"),
      quality: pick(p.quality, ["fast", "best"] as const, "best"),
      count: 1,
      camera: r.camera ?? {},
      remixOf,
    });
    return "image";
  }
  const model = pick<VideoModel>(r.model, VIDEO_MODELS.map((m) => m.id), DEFAULT_MODEL);
  await startVideo({
    mode: pick(p.mode, VIDEO_MODES, "text"),
    model,
    scene: r.prompt,
    cast,
    durationSec: typeof p.durationSec === "number" ? p.durationSec : 5,
    ratio: pick(p.ratio, VIDEO_RATIOS, "16:9"),
    audio: p.audio !== false,
    seed: r.seed ?? randomSeed(),
    h3Resolution: pick(p.h3Resolution, ["768P", "2K"] as const, "768P"),
    camera: r.camera ?? {},
    remixOf,
  });
  return "video";
}

// A remixed generation records remixOf for attribution in the library.
async function markRemix(job: Job): Promise<void> {
  const remixOf = (job.input as { request?: { remixOf?: unknown } }).request?.remixOf;
  if (typeof remixOf !== "string") return;
  for (const id of job.generationIds) await db.generations.update(id, { remixOf });
}

export function registerRemix(): () => void {
  return onJobDone(markRemix);
}

// The shipped preset a recipe was made from, if any (Decisions, October 21,
// U5, item 11): the same model and prompt, and every param the preset sets
// the same in the recipe. A recipe made from a preset's take carries more
// params (size, quality, count) than the preset sets, so those don't count.
// Only the preset's own thumbnail shows; the link still never carries a face.
export function matchingPreset(recipe: Pick<RecipeFile, "model" | "prompt" | "params">, presets: readonly Preset[]): Preset | undefined {
  return presets.find(
    (p) =>
      p.recipe.model === recipe.model &&
      p.recipe.prompt.trim() === recipe.prompt.trim() &&
      Object.entries(p.recipe.params ?? {}).every(([key, value]) => canonicalJson(recipe.params?.[key]) === canonicalJson(value)),
  );
}
