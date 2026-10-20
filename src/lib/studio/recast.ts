// Recast (spec: Recast): a clip the user owns keeps its motion and camera,
// and either a vault character takes over as the performer (Motion Transfer),
// one thing in the shot is replaced (Object Swap), or the look changes (style).
//
// Engines differ from the spec: Seedance 2.5 refuses photoreal people in any
// input (M3 notes, and a person reference video in M4), so Motion Transfer and
// style run on MiniMax H3, which kept motion, timing and camera in M4's test.
// Object Swap runs on HappyHorse 1.0 video edit, the A/B winner over Kling
// (which retimes the clip), Wan 2.7 and BFL (docs/notes/recast-ab.md).
import { onJobDone, startJob, type JobInput } from "@/lib/jobs/runner";
import { prepareImage } from "@/lib/media/image-prep";
import { loadFfmpeg } from "@/lib/media/video-prep";
import { preset as findPreset } from "@/lib/presets/load";
import type { Preset } from "@/lib/presets/schema";
import { compileVideoPrompt } from "@/lib/prompts/compile";
import type { H3Input, VideoEditInput, VideoRatio } from "@/lib/registry/inputs";
import { MODEL_IDS } from "@/lib/registry/models";
import { uploadAsset } from "@/lib/router/client";
import { db } from "@/lib/store/db";
import type { Job } from "@/lib/types/jobs";
import { buildCast, dataUri, type CastPick } from "./cast";

export type RecastMode = "motion" | "swap" | "style";

export interface ClipLimits {
  minSec: number;
  maxSec: number;
  minHeight?: number;
  maxHeight: number;
  fps?: number;
}

// H3 renders 4 to 15 s. Object Swap keeps the spec's 3 to 10 s (Kling's edit
// limits), which the A/B clips sat inside; HappyHorse edits at 720P.
export const LIMITS: Record<RecastMode, ClipLimits> = {
  motion: { minSec: 4, maxSec: 15, maxHeight: 1080 },
  style: { minSec: 4, maxSec: 15, maxHeight: 1080 },
  swap: { minSec: 3, maxSec: 10, maxHeight: 1080, fps: 30 },
};

export function modeOf(p: Preset): RecastMode {
  const mode = p.recipe.params?.mode;
  return mode === "swap" || mode === "style" ? mode : "motion";
}

// H3 needs a concrete ratio with reference media; pick the nearest it supports.
export function nearestRatio(width: number, height: number): VideoRatio {
  const options: [VideoRatio, number][] = [["16:9", 16 / 9], ["4:3", 4 / 3], ["1:1", 1], ["3:4", 3 / 4], ["9:16", 9 / 16], ["21:9", 21 / 9]];
  const r = width / height;
  return options.reduce((best, o) => (Math.abs(Math.log(o[1] / r)) < Math.abs(Math.log(best[1] / r)) ? o : best))[0];
}

export interface RecastRequest {
  presetId: string;
  clipBlobId: string;        // the prepared clip
  clipDurationSec: number;
  clipWidth: number;
  clipHeight: number;
  cast: CastPick[];          // Motion Transfer: the performer
  swapImageBlobId?: string;  // Object Swap: the replacement
  direction?: string;        // extra words from the user
  h3Resolution: H3Input["resolution"];
  seed: number;
  settingStep?: boolean;     // the second step of a setting-change preset
}

// A recast job whose result is the first of two steps (a setting change follows).
export function isFirstOfTwo(job: Job): boolean {
  const request = (job.input as Partial<RecastJobInput>).request;
  return Boolean(request && !request.settingStep && typeof findPreset(request.presetId)?.recipe.params?.setting === "string");
}

type RecastJobInput = JobInput & { request: RecastRequest };

async function requireBlob(id: string | undefined, what: string): Promise<Blob> {
  const row = id ? await db.blobs.get(id) : undefined;
  if (!row) throw new Error(`The ${what} is gone. Add it again.`);
  return row.blob;
}

export async function startRecast(request: RecastRequest): Promise<string> {
  const p = findPreset(request.presetId);
  if (!p) throw new Error("That preset isn't available.");
  const mode = modeOf(p);
  const limits = LIMITS[mode];
  if (request.clipDurationSec < limits.minSec - 0.05 || request.clipDurationSec > limits.maxSec + 0.05) {
    throw new RangeError(`This mode takes a ${limits.minSec} to ${limits.maxSec} s clip.`);
  }
  const clip = await requireBlob(request.clipBlobId, "clip");
  const direction = request.direction?.trim() ? ` ${request.direction.trim()}` : "";
  const stylised = p.recipe.params?.stylised === true;

  let modelId: typeof MODEL_IDS.minimaxH3 | typeof MODEL_IDS.happyHorseEdit;
  let model: H3Input | VideoEditInput;
  let characterIds: string[] = [];
  const swapImage = mode === "swap" ? (await prepareImage(await requireBlob(request.swapImageBlobId, "replacement image"))).blob : undefined;

  // Upload last, so a refused input never leaves a file behind.
  const hosted = await uploadAsset(new Blob([clip], { type: "video/mp4" }), { filePath: "recast.mp4", contentType: "video/mp4" });
  const uploads = [hosted.id];

  if (mode === "swap") {
    modelId = MODEL_IDS.happyHorseEdit;
    const reference = await uploadAsset(swapImage!, { filePath: "replacement.jpg", contentType: "image/jpeg" });
    uploads.push(reference.id);
    const target = String(p.recipe.slots[0]?.slot ?? "replacement");
    model = {
      prompt: p.recipe.prompt.replace(/\{([a-z][a-z0-9_-]*)\}/g, () => target) + direction,
      videoUrl: hosted.url,
      referenceImageUrl: reference.url,
      keepAudio: true,
    };
  } else {
    modelId = MODEL_IDS.minimaxH3;
    const cast = await buildCast(request.cast);
    characterIds = cast.characterIds;
    if (mode === "motion" && !cast.members.length) throw new Error("Pick who performs.");
    const prompt = compileVideoPrompt({ scene: p.recipe.prompt + direction, cast: cast.members, camera: {}, modelId, withReferences: true });
    model = {
      stage: "generate",
      prompt,
      ...(cast.images.length ? { referenceImages: cast.images.map(dataUri) } : {}),
      referenceVideos: [hosted.url],
      durationSec: Math.min(limits.maxSec, Math.max(limits.minSec, Math.round(request.clipDurationSec))),
      ratio: nearestRatio(request.clipWidth, request.clipHeight),
      resolution: request.h3Resolution,
      seed: request.seed,
    };
  }

  const job = await startJob({
    kind: "recast",
    modelId,
    uploads,
    input: { model, characterIds, prompt: p.title, stylised, request } satisfies RecastJobInput,
  });
  return job.id;
}

// ---- Original audio (the music-video presets) ----

export async function muxAudio(video: Blob, audioSource: Blob): Promise<Blob> {
  const ffmpeg = await loadFfmpeg();
  const id = crypto.randomUUID();
  await ffmpeg.writeFile(`v-${id}.mp4`, new Uint8Array(await video.arrayBuffer()));
  await ffmpeg.writeFile(`a-${id}.mp4`, new Uint8Array(await audioSource.arrayBuffer()));
  try {
    const code = await ffmpeg.exec(["-i", `v-${id}.mp4`, "-i", `a-${id}.mp4`, "-map", "0:v:0", "-map", "1:a:0?", "-c:v", "copy", "-c:a", "aac", "-shortest", "-movflags", "+faststart", `o-${id}.mp4`]);
    if (code !== 0) throw new Error("The original audio couldn't be added.");
    return new Blob([(await ffmpeg.readFile(`o-${id}.mp4`)) as Uint8Array<ArrayBuffer>], { type: "video/mp4" });
  } finally {
    for (const f of [`v-${id}.mp4`, `a-${id}.mp4`, `o-${id}.mp4`]) await ffmpeg.deleteFile(f).catch(() => undefined);
  }
}

// H3 keeps the reference video's setting, so presets that move the performer
// somewhere new run a second step: a text-guided background edit on the H3
// result (docs/notes/recast-ab.md). "Background" alone only changed what was
// seen through a window, so the prompt names the whole surroundings.
export function settingPrompt(setting: string): string {
  return `Move the person to a new location: ${setting}. Replace everything around them, including walls, windows, furniture and props, with that location. Keep the person, their face, their hair, their clothes and their motion exactly as they are.`;
}

async function startSettingStep(job: Job, input: RecastJobInput, setting: string): Promise<void> {
  const generation = await db.generations.get(job.generationIds[0] ?? "");
  const asset = generation?.assets.find((a) => a.kind === "video");
  const video = asset ? await db.blobs.get(asset.blobId) : undefined;
  if (!video) return;
  const hosted = await uploadAsset(video.blob, { filePath: "performer.mp4", contentType: "video/mp4" });
  await startJob({
    kind: "recast",
    modelId: MODEL_IDS.happyHorseEdit,
    uploads: [hosted.id],
    parentJobId: job.id,
    input: {
      model: { prompt: settingPrompt(setting), videoUrl: hosted.url, keepAudio: true } satisfies VideoEditInput,
      characterIds: input.characterIds,
      prompt: input.prompt,
      request: { ...input.request, settingStep: true },
    } satisfies RecastJobInput,
  });
}

async function afterRecast(job: Job): Promise<void> {
  if (job.kind !== "recast") return;
  const input = job.input as RecastJobInput;
  const p = findPreset(input.request?.presetId);
  const setting = p?.recipe.params?.setting;
  if (typeof setting === "string" && !input.request.settingStep) {
    if (!(await db.jobs.where("parentJobId").equals(job.id).count())) await startSettingStep(job, input, setting);
    return;
  }
  if (!p?.recipe.params?.keepAudio) return;
  const generation = await db.generations.get(job.generationIds[0] ?? "");
  const asset = generation?.assets.find((a) => a.kind === "video");
  const [video, source] = await Promise.all([asset ? db.blobs.get(asset.blobId) : undefined, db.blobs.get(input.request.clipBlobId)]);
  if (!asset || !video || !source) return;
  const muxed = await muxAudio(video.blob, source.blob);
  await db.blobs.put({ ...video, blob: muxed, bytes: muxed.size });
  await db.generations.update(generation!.id, { assets: generation!.assets.map((a) => (a === asset ? { ...a, bytes: muxed.size } : a)) });
}

export function registerRecastStudio(): () => void {
  return onJobDone(afterRecast);
}

// "Other people in the clip will still appear" (spec: Input): the most faces
// seen in any of a few sampled frames.
export async function facesInClip(blob: Blob): Promise<number> {
  const [{ sampleFrames }, { detectFaces }] = await Promise.all([import("@/lib/media/video-frames"), import("@/lib/identity/embed")]);
  let most = 0;
  for (const frame of await sampleFrames(blob, 4)) most = Math.max(most, (await detectFaces(frame.canvas, 60)).length);
  return most;
}

// A clip the user brings in, stored as is until it's trimmed.
export async function storeClip(file: Blob): Promise<string> {
  const id = `upload:${crypto.randomUUID()}`;
  await db.blobs.put({ id, blob: file, mime: file.type || "video/mp4", bytes: file.size });
  return id;
}
