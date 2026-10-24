// Recast (spec: Recast): a clip the user owns keeps its motion and camera,
// and either a vault character takes over as the performer (Motion Transfer),
// one thing in the shot is replaced (Object Swap), or the look changes (style).
//
// Engines differ from the spec: Seedance 2.5 refuses photoreal people in any
// input (M3 notes, and a person reference video in M4), so Motion Transfer and
// style run on MiniMax H3, which kept motion, timing and camera in M4's test.
// Object Swap runs on HappyHorse 1.0 video edit, the A/B winner over Kling
// (which retimes the clip), Wan 2.7 and BFL (docs/notes/recast-ab.md).
// On the visitor's ComfyUI (spec: Local engine), Motion Transfer runs in two
// steps: Qwen draws the performer into the clip's first frame, in the preset's
// setting, and Wan Animate 2 moves that still through the clip. Wan Animate
// copies its reference's framing and background and ignores the prompt's (4090
// run, October 23), so the still is the set. The other modes stay on Comfy.
import { onJobDone, onRestart, startJob, type JobInput } from "@/lib/jobs/runner";
import { prepareImage, toInlineImage } from "@/lib/media/image-prep";
import { loadFfmpeg, type ClipInfo } from "@/lib/media/video-prep";
import { preset as findPreset } from "@/lib/presets/load";
import type { Preset } from "@/lib/presets/schema";
import { compileVideoPrompt } from "@/lib/prompts/compile";
import type { AnimateInput, H3Input, VideoEditInput, VideoRatio } from "@/lib/registry/inputs";
import { LOCAL_INPUT } from "@/lib/registry/local-body";
import { MODEL_IDS, isLocalModel } from "@/lib/registry/models";
import { uploadAsset, uploadLocalInput } from "@/lib/router/client";
import { ANIMATE_DURATION } from "@/lib/adapters/local/wan-animate";
import { db } from "@/lib/store/db";
import type { Job } from "@/lib/types/jobs";
import { buildCast, dataUri, describeCast, type CastPick } from "./cast";
import { stageStillInput } from "./recast-stage";

export type RecastMode = "motion" | "swap" | "style";

export const MODE_LABEL: Record<RecastMode, string> = { motion: "Motion transfer", swap: "Object swap", style: "Style swap" };

// How the screen groups presets. A swap of the background changes the place,
// not a thing in it, so it gets its own Setting group (Decisions, October 21).
export type PresetGroup = RecastMode | "setting";
export const GROUP_LABEL: Record<PresetGroup, string> = { motion: "Motion transfer", swap: "Object swap", setting: "Setting", style: "Style swap" };
export const GROUP_ORDER: PresetGroup[] = ["motion", "swap", "setting", "style"];

export function groupOf(p: Preset): PresetGroup {
  const mode = modeOf(p);
  return mode === "swap" && p.recipe.params?.target === "background" ? "setting" : mode;
}

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

// Wan Animate 2 on the visitor's GPU: motion transfer only.
const LOCAL_MOTION: ClipLimits = { minSec: ANIMATE_DURATION[0], maxSec: ANIMATE_DURATION[1], maxHeight: 1080 };

export function recastLimits(mode: RecastMode, local: boolean): ClipLimits {
  return local && mode === "motion" ? LOCAL_MOTION : LIMITS[mode];
}

// Why a mode can't run on the visitor's GPU, or undefined.
export function localUnsupported(mode: RecastMode): string | undefined {
  return mode === "motion" ? undefined : `${MODE_LABEL[mode]} needs Comfy credits. On your GPU, Recast does motion transfer.`;
}

export function modeOf(p: Preset): RecastMode {
  const mode = p.recipe.params?.mode;
  return mode === "swap" || mode === "style" ? mode : "motion";
}

// A trimmed clip, and the frame rate it was resampled to, if it was.
export interface PreparedClip {
  blobId: string;
  info: ClipInfo;
  fps?: number;
}

// Whether a clip prepared for one mode can go to another as it is, so
// switching presets only asks for a new one when the limits differ.
export function fitsLimits(clip: Pick<PreparedClip, "info" | "fps">, limits: ClipLimits): boolean {
  const { durationSec, height } = clip.info;
  return (
    durationSec >= limits.minSec - 0.05 &&
    durationSec <= limits.maxSec + 0.05 &&
    height <= limits.maxHeight &&
    (limits.minHeight === undefined || height >= limits.minHeight) &&
    (limits.fps === undefined || clip.fps === limits.fps)
  );
}

// The part of a clip Recast uses until the visitor trims (spec: Recast,
// Input): the whole clip, or its first allowed seconds when it's longer.
export function defaultRange(durationSec: number, limits: ClipLimits): [number, number] {
  return [0, Math.min(durationSec, limits.maxSec)];
}

export function tooShort(lengthSec: number, limits: ClipLimits): boolean {
  return lengthSec < limits.minSec - 0.05;
}

export interface RecastForm {
  mode: RecastMode;
  local?: boolean;           // runs on the visitor's ComfyUI
  hasClip: boolean;
  tooShort: boolean;         // the clip, or its trim, is shorter than the mode allows
  preparing?: number;        // share done while the clip prepares
  prepared?: PreparedClip;   // the clip as prepared for the current trim
  needsPerformer: boolean;
  hasPerformer: boolean;
  hasReplacement: boolean;
  rights: boolean;           // ticked, or the bundled sample, which needs no check
}

// The first thing the Recast button is waiting for, in call-sheet order, or
// undefined when it can run. The screen shows it under the button. The clip
// prepares on its own, so the only clip step left to the visitor is a length.
export function recastNeeds(form: RecastForm): string | undefined {
  const limits = recastLimits(form.mode, form.local === true);
  if (form.local && localUnsupported(form.mode)) return localUnsupported(form.mode);
  if (!form.hasClip) return "Upload a clip";
  if (form.tooShort) return `Recast needs a ${limits.minSec} to ${limits.maxSec} s clip`;
  if (form.preparing !== undefined || !form.prepared || !fitsLimits(form.prepared, limits)) {
    return form.preparing ? `Preparing the clip, ${Math.round(form.preparing * 100)}%` : "Preparing the clip";
  }
  if (form.needsPerformer && !form.hasPerformer) return "Pick a performer";
  if (form.mode === "swap" && !form.hasReplacement) return "Upload a replacement image";
  if (!form.rights) return "Confirm you filmed the clip or have the rights to use it";
  return undefined;
}

// H3 needs a concrete ratio with reference media; pick the nearest it supports.
// (Each is an image ratio too, for the local still.)
export function nearestRatio(width: number, height: number): Exclude<VideoRatio, "9:21"> {
  const options: [Exclude<VideoRatio, "9:21">, number][] = [["16:9", 16 / 9], ["4:3", 4 / 3], ["1:1", 1], ["3:4", 3 / 4], ["9:16", 9 / 16], ["21:9", 21 / 9]];
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
  animateStep?: boolean;     // local: Wan Animate on the first step's still
  modelId?: string;          // a local model; Comfy's per-mode engines when unset
}

// Wan Animate's prompt: who the performer is and where, with no motion words
// (those go in the motion prompt).
export function animatePrompt(name: string, description: string | undefined, setting: string | undefined, direction: string): string {
  const who = `Character appearance description: ${name}, exactly as in the reference image, with the same face, hair, skin and build.${description ? ` ${description.trim()}` : ""}`;
  const where = `Background description: ${setting ?? "the same kind of place as the driving video, with the same light"}.`;
  return [who, where, direction.trim()].filter(Boolean).join("\n");
}

const settingOf = (p: Preset) => (typeof p.recipe.params?.setting === "string" ? p.recipe.params.setting : undefined);

// Step one: Qwen draws the still (recast-stage.ts). Step two starts when it's saved (afterRecast).
async function startLocalRecast(request: RecastRequest, p: Preset, clip: Blob, parentJobId?: string): Promise<string> {
  const unsupported = localUnsupported(modeOf(p));
  if (unsupported) throw new Error(unsupported);
  const cast = await buildCast(request.cast.slice(0, 1), { compact: true, view: "fullBody" });
  if (!cast.members[0] || !cast.images[0]) throw new Error("Pick who performs.");
  const { firstFrame } = await import("@/lib/media/video-frames");
  const frame = await toInlineImage((await firstFrame(clip)).jpeg);
  const { animateStep: _step, ...first } = request;
  const description = cast.members[0].description;
  const job = await startJob({
    kind: "recast",
    modelId: MODEL_IDS.localQwenEdit,
    input: {
      model: stageStillInput(cast.images[0], frame, {
        setting: settingOf(p),
        direction: request.direction ?? "",
        ...(description ? { description } : {}),
        aspectRatio: nearestRatio(request.clipWidth, request.clipHeight),
        seed: request.seed,
      }),
      characterIds: cast.characterIds,
      prompt: p.title,
      request: first,
    } satisfies RecastJobInput,
    ...(parentJobId ? { parentJobId } : {}),
  });
  return job.id;
}

// Step two: Wan Animate moves the still's performer through the clip, keeping the clip's sound.
async function startAnimateStep(still: Job, parentJobId = still.id): Promise<Job | undefined> {
  const input = still.input as RecastJobInput;
  const request = input.request;
  const p = findPreset(request.presetId);
  const generation = await db.generations.get(still.generationIds[0] ?? "");
  const asset = generation?.assets.find((a) => a.kind === "image");
  const [image, clip] = await Promise.all([asset ? db.blobs.get(asset.blobId) : undefined, db.blobs.get(request.clipBlobId)]);
  const [member] = await describeCast(request.cast.slice(0, 1), { compact: true });
  if (!p || !image || !clip || !member || !request.modelId) return undefined;
  const model: AnimateInput = {
    prompt: animatePrompt(member.name, member.description, settingOf(p), request.direction ?? ""),
    motion: p.recipe.prompt.replace(/\{([a-z][a-z0-9_-]*)\}/g, "a person"),
    performer: await toInlineImage(image.blob),
    clip: `${LOCAL_INPUT}${await uploadLocalInput(clip.blob, "mp4")}`,
    durationSec: request.clipDurationSec,
    aspect: request.clipWidth / request.clipHeight,
    seed: request.seed,
  };
  return startJob({
    kind: "recast",
    modelId: request.modelId,
    parentJobId,
    input: { model, characterIds: input.characterIds, prompt: input.prompt, request: { ...request, animateStep: true } } satisfies RecastJobInput,
  });
}

// The still of a local recast, which Wan Animate moves next.
export function isLocalStill(job: Job): boolean {
  return job.kind === "recast" && job.modelId === MODEL_IDS.localQwenEdit;
}

// A recast job whose result is the first of two steps: a local still, or a
// Comfy recast whose setting change follows.
export function isFirstOfTwo(job: Job): boolean {
  if (isLocalStill(job)) return true;
  const request = (job.input as Partial<RecastJobInput>).request;
  return Boolean(request && !isLocalModel(job.modelId) && !request.settingStep && typeof findPreset(request.presetId)?.recipe.params?.setting === "string");
}

type RecastJobInput = JobInput & { request: RecastRequest };

async function requireBlob(id: string | undefined, what: string): Promise<Blob> {
  const row = id ? await db.blobs.get(id) : undefined;
  if (!row) throw new Error(`The ${what} is gone. Add it again.`);
  return row.blob;
}

export async function startRecast(request: RecastRequest, parentJobId?: string): Promise<string> {
  const p = findPreset(request.presetId);
  if (!p) throw new Error("That preset isn't available.");
  const mode = modeOf(p);
  const local = Boolean(request.modelId && isLocalModel(request.modelId));
  const limits = recastLimits(mode, local);
  if (request.clipDurationSec < limits.minSec - 0.05 || request.clipDurationSec > limits.maxSec + 0.05) {
    throw new RangeError(`This mode takes a ${limits.minSec} to ${limits.maxSec} s clip.`);
  }
  const clip = await requireBlob(request.clipBlobId, "clip");
  if (local) return startLocalRecast(request, p, clip, parentJobId);
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
    ...(parentJobId ? { parentJobId } : {}),
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

async function startSettingStep(job: Job, input: RecastJobInput, setting: string): Promise<Job | undefined> {
  const generation = await db.generations.get(job.generationIds[0] ?? "");
  const asset = generation?.assets.find((a) => a.kind === "video");
  const video = asset ? await db.blobs.get(asset.blobId) : undefined;
  if (!video) return undefined;
  const hosted = await uploadAsset(video.blob, { filePath: "performer.mp4", contentType: "video/mp4" });
  return startJob({
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

// Stills whose second step is starting. Done fires when the assets are saved
// and again when the scores are, and the second step uploads the clip first.
const animating = new Set<string>();

async function afterRecast(job: Job): Promise<void> {
  if (job.kind !== "recast") return;
  // A local recast's still goes on to Wan Animate, which keeps the clip's sound itself.
  if (isLocalModel(job.modelId)) {
    if (!isLocalStill(job) || animating.has(job.id)) return;
    animating.add(job.id);
    try {
      if (!(await db.jobs.where("parentJobId").equals(job.id).count())) await startAnimateStep(job);
    } finally {
      animating.delete(job.id);
    }
    return;
  }
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

// Retry: the clip (or, for a setting step, the first step's result) is
// hosted again, since the old links went when the job ended. A local
// animate step runs again on the same still.
async function restartRecast(job: Job): Promise<Job | undefined> {
  if (job.kind !== "recast") return undefined;
  const input = job.input as RecastJobInput;
  if (input.request.animateStep) {
    const still = await db.jobs.get(job.parentJobId ?? "");
    return still ? startAnimateStep(still, job.id) : undefined;
  }
  if (input.request.settingStep) {
    const first = await db.jobs.get(job.parentJobId ?? "");
    const setting = findPreset(input.request.presetId)?.recipe.params?.setting;
    return first && typeof setting === "string" ? startSettingStep(first, first.input as RecastJobInput, setting) : undefined;
  }
  return db.jobs.get(await startRecast(input.request, job.id));
}

export function registerRecastStudio(): () => void {
  const done = onJobDone(afterRecast);
  const restart = onRestart(restartRecast);
  return () => {
    done();
    restart();
  };
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
