// The Video studio's work (spec: Video studio): Seedance 2.5 drafts then
// finals, MiniMax H3 as the selectable second model, Wan 2.2 on the visitor's
// ComfyUI (spec: Local engine), Still first chaining, Continue, and the last
// frame when a final has none (Unknowns row 9).
import { hasFace } from "@/lib/identity/embed";
import { onJobDone, retryJob, startJob, type JobInput } from "@/lib/jobs/runner";
import { blobToBase64, drawToCanvas, prepareImage } from "@/lib/media/image-prep";
import { lastFrame } from "@/lib/media/video-frames";
import { isStylised, type CameraSelection } from "@/lib/prompts/camera";
import { compileImagePrompt, compileVideoPrompt } from "@/lib/prompts/compile";
import type { GenerateVideoInput, H3Input, ImageAspectRatio, RenderFinalInput, VideoRatio, WanInput } from "@/lib/registry/inputs";
import { DEFAULT_VIDEO_MODEL, MODEL_IDS, PEOPLE_VIDEO_MODEL, isLocalModel } from "@/lib/registry/models";
import { WAN_BEST_DURATION, WAN_FAST_DURATION } from "@/lib/adapters/local/wan";
import { ratioValue } from "@/lib/adapters/local/graph";
import { db } from "@/lib/store/db";
import { getSettings } from "@/lib/store/settings";
import type { Job } from "@/lib/types/jobs";
import type { GenerationAsset } from "@/lib/types/records";
import { buildCast, castIsAnimated, dataUri, type CastPick } from "./cast";
import { imageModel, isCompact, randomSeed, tooManyImages } from "./image";

export type VideoMode = "text" | "still" | "references" | "image";
export type VideoModel = typeof MODEL_IDS.seedance | typeof MODEL_IDS.minimaxH3 | typeof MODEL_IDS.localWanBest | typeof MODEL_IDS.localWanFast;

// H3's resolutions as the screen names them: "768p", though the request says 768P.
export const resolutionLabel = (r: H3Input["resolution"]) => (r === "768P" ? "768p" : r);
export const H3_RESOLUTIONS = (["768P", "2K"] as const).map((value) => ({ value, label: resolutionLabel(value) }));

export const VIDEO_MODELS: { id: VideoModel; label: string; duration: [number, number]; draft: boolean }[] = [
  { id: MODEL_IDS.seedance, label: "Seedance 2.5", duration: [4, 30], draft: true },
  { id: MODEL_IDS.minimaxH3, label: "MiniMax H3", duration: [4, 15], draft: false },
  { id: MODEL_IDS.localWanBest, label: "Wan 2.2 14B", duration: WAN_BEST_DURATION, draft: false },
  { id: MODEL_IDS.localWanFast, label: "Wan 2.2 5B (fast)", duration: WAN_FAST_DURATION, draft: false },
];

// Use references needs a model that takes reference images; Wan doesn't.
export const takesReferences = (model: string) => !isLocalModel(model);
export const DEFAULT_MODEL: VideoModel = DEFAULT_VIDEO_MODEL;

export interface VideoRequest {
  mode: VideoMode;
  model: VideoModel;
  scene: string;
  cast: CastPick[];
  sourceBlobId?: string;  // "image" mode: the first frame
  durationSec: number;
  ratio: VideoRatio;      // text and references modes
  audio: boolean;         // Seedance only
  seed: number;
  h3Resolution: H3Input["resolution"];
  camera: CameraSelection;
  remixOf?: string;       // a remix: the source recipe's hash (lib/recipes/share.ts)
  stillModel?: string;    // Image, then animate: what draws the still (Nano Banana 2.1 when unset)
}

// final: a local final, which is a new render on Wan 14B rather than the
// draft's own final (spec: Local engine, Models).
type VideoJobInput = JobInput & { request: VideoRequest; final?: true };

// ---- Which model ----

// Seedance refuses photoreal people as input images, so anything with a
// person goes to H3: a cast (Still first, References) or a face in the first
// frame. Text to video keeps the chosen model, and so does a local model:
// Wan refuses nobody. A cast whose people are all animated keeps the chosen
// model too, Seedance by default, and a face in its first frame is theirs
// (Marzuwq's decision, October 26); H3 stays one pick away.
export function modelFor(request: Pick<VideoRequest, "mode" | "cast" | "model">, firstFrameHasPerson: boolean, animatedCast = false): VideoModel {
  if (isLocalModel(request.model)) return request.model;
  if (animatedCast && request.cast.length) return request.model;
  if ((request.mode === "still" || request.mode === "references") && request.cast.length) return PEOPLE_VIDEO_MODEL;
  if (request.mode === "image" && firstFrameHasPerson) return PEOPLE_VIDEO_MODEL;
  return request.model;
}

export async function blobHasPerson(blobId: string | undefined): Promise<boolean> {
  const row = blobId ? await db.blobs.get(blobId) : undefined;
  return row ? hasFace(await drawToCanvas(row.blob, 1024)) : false;
}

function routed(request: VideoRequest, person: boolean, animatedCast: boolean): VideoRequest {
  const model = modelFor(request, person, animatedCast);
  const [min, max] = VIDEO_MODELS.find((m) => m.id === model)!.duration;
  return { ...request, model, durationSec: Math.min(max, Math.max(min, request.durationSec)) };
}

// A frame for a video request: prepped JPEG as a data URI.
async function frameUri(blob: Blob): Promise<string> {
  const { blob: jpeg } = await prepareImage(blob);
  return `data:image/jpeg;base64,${await blobToBase64(jpeg)}`;
}

// A first frame's width / height, for a model that sizes its clip from it.
async function frameAspect(dataUriOrBlob: string): Promise<number> {
  const bitmap = await createImageBitmap(await (await fetch(dataUriOrBlob)).blob());
  const aspect = bitmap.width / bitmap.height;
  bitmap.close();
  return aspect;
}

async function videoModelInput(request: VideoRequest, firstFrame?: string): Promise<{ input: GenerateVideoInput | H3Input | WanInput; characterIds: string[] }> {
  const withReferences = request.mode === "references";
  if (withReferences && !takesReferences(request.model)) throw new Error("Use references needs Comfy credits: Wan can't take reference images. Try Image, then animate.");
  const cast = await buildCast(request.cast);
  const prompt = compileVideoPrompt({ scene: request.scene, cast: cast.members, camera: request.camera, modelId: request.model, withReferences });
  if (isLocalModel(request.model)) {
    const input: WanInput = {
      stage: "generate",
      prompt,
      ...(firstFrame ? { firstFrame } : {}),
      durationSec: request.durationSec,
      aspect: firstFrame ? await frameAspect(firstFrame) : ratioValue(request.ratio),
      seed: request.seed,
    };
    return { input, characterIds: cast.characterIds };
  }
  const referenceImages = withReferences ? cast.images.map(dataUri) : undefined;
  if (request.model === MODEL_IDS.minimaxH3) {
    const input: H3Input = {
      stage: "generate",
      prompt,
      ...(firstFrame ? { firstFrame } : { ratio: request.ratio }),
      ...(referenceImages ? { referenceImages } : {}),
      durationSec: request.durationSec,
      resolution: request.h3Resolution,
      seed: request.seed,
    };
    return { input, characterIds: cast.characterIds };
  }
  const input: GenerateVideoInput = {
    stage: "draft",
    prompt,
    ...(firstFrame ? { firstFrame } : { ratio: request.ratio }),
    ...(referenceImages ? { referenceImages } : {}),
    durationSec: request.durationSec,
    generateAudio: request.audio,
    seed: request.seed,
  };
  return { input, characterIds: cast.characterIds };
}

async function startVideoJob(request: VideoRequest, firstFrame?: string, parentJobId?: string, final?: true): Promise<string> {
  const { input, characterIds } = await videoModelInput(request, firstFrame);
  const job = await startJob({
    kind: "video",
    modelId: request.model,
    input: { model: input, characterIds, prompt: request.scene, stylised: isStylised(request.camera), request, ...(final ? { final } : {}) } satisfies VideoJobInput,
    ...(parentJobId ? { parentJobId } : {}),
  });
  return job.id;
}

// The opening still for Still first: the cast drawn into the scene with the
// shot settings (no movement: it's a still).
function stillAspect(ratio: VideoRatio): ImageAspectRatio {
  return ratio === "9:21" ? "9:16" : ratio;
}

export async function startVideo(asked: VideoRequest): Promise<string> {
  const animatedCast = await castIsAnimated(asked.cast);
  const request = routed(asked, !animatedCast && asked.mode === "image" && (await blobHasPerson(asked.sourceBlobId)), animatedCast);
  if (request.mode === "still") {
    const stillModel = imageModel({ modelId: request.stillModel });
    const tooMany = tooManyImages(stillModel, request.cast.length, false);
    if (tooMany) throw new Error(tooMany);
    const cast = await buildCast(request.cast, { compact: isCompact(stillModel) });
    const { movement: _still, ...camera } = request.camera;
    const prompt = compileImagePrompt({ scene: request.scene, cast: cast.members, camera, modelId: stillModel });
    const job = await startJob({
      kind: "image",
      modelId: stillModel,
      input: {
        model: { prompt, references: cast.images, aspectRatio: stillAspect(request.ratio), size: "2K", quality: "best", seed: request.seed },
        characterIds: cast.characterIds,
        prompt: request.scene,
        stylised: isStylised(request.camera),
        next: { video: request },
      },
    });
    return job.id;
  }
  if (request.mode === "image") {
    const row = request.sourceBlobId ? await db.blobs.get(request.sourceBlobId) : undefined;
    if (!row) throw new Error("Pick the image to start from.");
    return startVideoJob(request, await frameUri(row.blob));
  }
  return startVideoJob(request);
}

// Re-roll (spec: Identity match score, Bands and actions): a drifted clip
// again, same request and same first frame, with a new seed. A clip that
// started from a still keeps that still; only the motion is redrawn.
export async function rerollClip(jobId: string): Promise<string> {
  const job = await db.jobs.get(jobId);
  const input = job?.input as VideoJobInput | undefined;
  if (!job || !input?.request) throw new Error("This clip can't be re-rolled.");
  const firstFrame = (input.model as { firstFrame?: string }).firstFrame;
  return startVideoJob({ ...input.request, seed: randomSeed() }, firstFrame);
}

// ---- Draft, then final ----

// A local clip on the fast Wan model is a draft too: its final renders on 14B.
export function isDraft(job: Job): boolean {
  if (job.modelId === MODEL_IDS.localWanFast) return !(job.input as VideoJobInput).final;
  return job.modelId === MODEL_IDS.seedance && (job.input as JobInput<GenerateVideoInput | RenderFinalInput>).model.stage === "draft";
}

export function isFinal(job: Job): boolean {
  return (job.input as JobInput<GenerateVideoInput | RenderFinalInput>).model?.stage === "final" || (job.input as VideoJobInput).final === true;
}

// Render final submits only the draft's ID (spec: Draft, then final, step 3).
// A local draft's final is the same request again on Wan 14B, same seed and
// first frame: a new render, which can differ from the draft.
export async function renderFinal(draftJobId: string): Promise<string> {
  const draft = await db.jobs.get(draftJobId);
  if (draft?.modelId === MODEL_IDS.localWanFast) {
    const input = draft.input as VideoJobInput;
    const firstFrame = (input.model as WanInput).firstFrame;
    const durationSec = Math.min(WAN_BEST_DURATION[1], input.request.durationSec);
    return startVideoJob({ ...input.request, model: MODEL_IDS.localWanBest, durationSec }, firstFrame, draft.id, true);
  }
  if (!draft?.draftTaskId) throw new Error("This draft has no task ID to render from.");
  const input = draft.input as VideoJobInput;
  const job = await startJob({
    kind: "video",
    modelId: MODEL_IDS.seedance,
    input: { model: { stage: "final", draftTaskId: draft.draftTaskId } satisfies RenderFinalInput, characterIds: input.characterIds, prompt: input.prompt, stylised: input.stylised, request: input.request },
    parentJobId: draft.id,
  });
  return job.id;
}

// Audio refusals: recreate the draft without audio (a final inherits it).
export async function retrySilent(jobId: string): Promise<string> {
  const job = await db.jobs.get(jobId);
  const input = job?.input as VideoJobInput | undefined;
  if (!job || !input?.request) throw new Error("That clip can't be retried.");
  const request = { ...input.request, audio: false };
  const model = { ...(input.model as GenerateVideoInput), generateAudio: false };
  return (await retryJob(jobId, { input: { ...input, model, request } })).id;
}

// Continue: this clip's last frame as a new upload, for the next clip's first frame.
export async function lastFrameBlobId(generationId: string): Promise<string> {
  const generation = await db.generations.get(generationId);
  const frame = generation?.assets.find((a) => a.kind === "frame");
  if (frame) return frame.blobId;
  const video = generation?.assets.find((a) => a.kind === "video");
  const row = video ? await db.blobs.get(video.blobId) : undefined;
  if (!row) throw new Error("This clip's video is missing.");
  return storeFrame(generationId, await lastFrame(row.blob));
}

async function storeFrame(generationId: string, blob: Blob): Promise<string> {
  const blobId = `${generationId}-lastframe`;
  await db.transaction("rw", db.blobs, db.generations, async () => {
    await db.blobs.put({ id: blobId, blob, mime: blob.type, bytes: blob.size });
    const generation = await db.generations.get(generationId);
    if (generation && !generation.assets.some((a) => a.kind === "frame")) {
      const asset: GenerationAsset = { blobId, kind: "frame", mime: blob.type, bytes: blob.size };
      await db.generations.update(generationId, { assets: [...generation.assets, asset] });
    }
  });
  return blobId;
}

// ---- After a job ----

async function afterJob(job: Job): Promise<void> {
  const input = job.input as JobInput;
  // Still first: the still is done, so the draft starts from it.
  const next = input.next as { video?: VideoRequest } | undefined;
  if (job.kind === "image" && next?.video) {
    const children = await db.jobs.where("parentJobId").equals(job.id).count();
    if (children) return;
    const generation = await db.generations.get(job.generationIds[0] ?? "");
    const still = generation?.assets.find((a) => a.kind === "image");
    const row = still ? await db.blobs.get(still.blobId) : undefined;
    if (row) await startVideoJob(next.video, await frameUri(row.blob), job.id);
    return;
  }
  if (job.kind !== "video" || !isFinal(job)) return;
  // A final: make sure it has a last frame, then keep or drop its draft.
  const generationId = job.generationIds[0];
  if (generationId) await lastFrameBlobId(generationId).catch(() => undefined);
  if (!(await getSettings()).keepDrafts && job.parentJobId) {
    const draft = await db.jobs.get(job.parentJobId);
    for (const id of draft?.generationIds ?? []) {
      const generation = await db.generations.get(id);
      await db.transaction("rw", db.generations, db.blobs, async () => {
        await db.blobs.bulkDelete(generation?.assets.map((a) => a.blobId) ?? []);
        await db.generations.delete(id);
      });
    }
  }
}

// Still first chains whose still finished while the page was closed.
export async function resumeChains(): Promise<void> {
  const stills = await db.jobs.filter((j) => j.kind === "image" && j.status === "done" && Boolean((j.input as JobInput).next)).toArray();
  for (const job of stills) await afterJob(job);
}

export function registerVideoStudio(): () => void {
  return onJobDone(afterJob);
}
