// The Video studio's work (spec: Video studio): Seedance 2.5 drafts then
// finals, MiniMax H3 as the selectable second model, Wan 2.2 on the visitor's
// ComfyUI (spec: Local engine), Still first chaining, Continue, and the last
// frame when a final has none (Unknowns row 9).
import { hasFace } from "@/lib/identity/embed";
import { onJobDone, onRestart, retryJob, startJob, type JobInput } from "@/lib/jobs/runner";
import { blobToBase64, drawToCanvas, prepareImage, toInlineImage } from "@/lib/media/image-prep";
import { lastFrame } from "@/lib/media/video-frames";
import { isStylised, type CameraSelection } from "@/lib/prompts/camera";
import { compileImagePrompt, compileVideoPrompt } from "@/lib/prompts/compile";
import type { GenerateVideoInput, H3Input, ImageAspectRatio, InlineImage, RenderFinalInput, VideoRatio, WanInput } from "@/lib/registry/inputs";
import { DEFAULT_VIDEO_MODEL, MODEL_IDS, PEOPLE_VIDEO_MODEL, isLocalModel } from "@/lib/registry/models";
import { WAN_BEST_DURATION, WAN_FAST_DURATION } from "@/lib/adapters/local/wan";
import { ratioValue } from "@/lib/adapters/local/graph";
import { seedanceLibraryAsset, uploadAsset } from "@/lib/router/client";
import { db } from "@/lib/store/db";
import { getSettings } from "@/lib/store/settings";
import type { Job } from "@/lib/types/jobs";
import type { GenerationAsset } from "@/lib/types/records";
import { buildCast, castForSeedance, castIsAnimated, dataUri, type CastPick } from "./cast";
import { nearestRatio } from "./recast";
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

// A reference clip for Use references: a blockout or simple 3D render the
// video follows for camera, timing and blocking (Seedance 2.5 and MiniMax H3
// both take a reference video). Prepared to at most 30 s and 1080p when
// picked; H3 takes its first 15 s.
export interface ReferenceClip {
  blobId: string;
  durationSec: number;
  width: number;
  height: number;
}

export const REFERENCE_CLIP_SEC: [number, number] = [2, 30];

// A clip Seedance 2.5 takes as it is goes without a re-encode, which in the
// browser takes minutes for a long, sharp clip: an MP4 within its 8.3
// megapixels a frame (ComfyUI's Seedance limits) and the Worker's 100 MB.
export const REFERENCE_CLIP_MAX_PIXELS = 8_295_044;
export const REFERENCE_CLIP_MAX_BYTES = 100 * 1024 * 1024;
export function clipUsableAsIs(file: Pick<Blob, "type" | "size">, info: { durationSec: number; width: number; height: number }): boolean {
  return (
    file.type === "video/mp4" &&
    info.durationSec <= REFERENCE_CLIP_SEC[1] + 0.05 &&
    info.width * info.height <= REFERENCE_CLIP_MAX_PIXELS &&
    file.size <= REFERENCE_CLIP_MAX_BYTES
  );
}

// Use references' own photos (October 29): images the visitor adds straight
// to the shot, after the cast's references. Seedance 2.5 takes 30 reference
// images, MiniMax H3 9.
export const MAX_REFERENCE_PHOTOS = 8;
const H3_MAX_IMAGES = 9;
const H3_CLIP_MAX_SEC = 15;

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
  clip?: ReferenceClip;   // "references" mode: what the video follows
  photos?: string[];      // "references" mode: the visitor's own reference photos (blob IDs), after the cast's
  exactPrompt?: boolean;  // "references" mode: send the prompt exactly as written, ComfyUI-style
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
// (Marzuwq's decision, October 26); H3 stays one pick away. In Use
// references, a cast Seedance takes through its library (elements, and
// people from the visitor's own reference sheets: October 29) keeps it too.
export function modelFor(request: Pick<VideoRequest, "mode" | "cast" | "model">, firstFrameHasPerson: boolean, animatedCast = false, seedanceCast = false): VideoModel {
  if (isLocalModel(request.model)) return request.model;
  if (animatedCast && request.cast.length) return request.model;
  if (seedanceCast && request.mode === "references") return request.model;
  if ((request.mode === "still" || request.mode === "references") && request.cast.length) return PEOPLE_VIDEO_MODEL;
  if (request.mode === "image" && firstFrameHasPerson) return PEOPLE_VIDEO_MODEL;
  return request.model;
}

export async function blobHasPerson(blobId: string | undefined): Promise<boolean> {
  const row = blobId ? await db.blobs.get(blobId) : undefined;
  return row ? hasFace(await drawToCanvas(row.blob, 1024)) : false;
}

function routed(request: VideoRequest, person: boolean, animatedCast: boolean, seedanceCast: boolean): VideoRequest {
  const model = modelFor(request, person, animatedCast, seedanceCast);
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

async function photoImages(blobIds: readonly string[]): Promise<InlineImage[]> {
  if (blobIds.length > MAX_REFERENCE_PHOTOS) throw new Error(`Use references takes ${MAX_REFERENCE_PHOTOS} photos of your own at most.`);
  const images: InlineImage[] = [];
  for (const id of blobIds) {
    const row = await db.blobs.get(id);
    if (!row) throw new Error("A reference photo is missing. Add it again.");
    images.push(await toInlineImage(row.blob));
  }
  return images;
}

async function clipBlob(clip: ReferenceClip): Promise<Blob> {
  const row = await db.blobs.get(clip.blobId);
  if (!row) throw new Error("The reference clip is missing. Add it again.");
  return new Blob([row.blob], { type: "video/mp4" });
}

// H3's reference clip: a public link (Router takes no inline video), cut to
// its 15 s and 1080p. Hosted last, after everything that can refuse.
async function hostClipForH3(clip: ReferenceClip): Promise<{ url: string; uploadId: string }> {
  let blob = await clipBlob(clip);
  if (clip.durationSec > H3_CLIP_MAX_SEC + 0.05 || clip.height > 1080) {
    const { trimClip } = await import("@/lib/media/video-prep");
    blob = await trimClip(blob, { startSec: 0, endSec: Math.min(clip.durationSec, H3_CLIP_MAX_SEC), maxHeight: 1080 });
  }
  const hosted = await uploadAsset(blob, { filePath: "reference.mp4", contentType: "video/mp4" });
  return { url: hosted.url, uploadId: hosted.id };
}

// Seedance's references go through its library, the way ComfyUI's Seedance
// 2.5 reference node sends them: a realistic designed character gets through
// there, and the library keeps its copy for the final (Decisions, October 29).
async function seedanceReferences(images: InlineImage[], clip: ReferenceClip | undefined): Promise<{ referenceImages: string[]; referenceVideos?: string[] }> {
  const referenceImages: string[] = [];
  for (const image of images) referenceImages.push(await seedanceLibraryAsset(await (await fetch(dataUri(image))).blob(), "Image"));
  return { referenceImages, ...(clip ? { referenceVideos: [await seedanceLibraryAsset(await clipBlob(clip), "Video")] } : {}) };
}

async function videoModelInput(
  request: VideoRequest,
  firstFrame?: string,
): Promise<{ input: GenerateVideoInput | H3Input | WanInput; characterIds: string[]; uploads?: string[] }> {
  const withReferences = request.mode === "references";
  if (withReferences && !takesReferences(request.model)) throw new Error("Use references needs Comfy credits: Wan can't take reference images. Try Image, then animate.");
  const clip = withReferences ? request.clip : undefined;
  const cast = await buildCast(request.cast);
  const photos = withReferences ? await photoImages(request.photos ?? []) : [];
  const prompt = compileVideoPrompt({
    scene: request.scene,
    cast: cast.members,
    camera: request.camera,
    modelId: request.model,
    withReferences,
    referenceClip: Boolean(clip),
    extraImages: photos.length,
    exact: withReferences && request.exactPrompt === true,
  });
  const images = [...cast.images, ...photos];
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
  const referenceImages = withReferences ? images.map(dataUri) : undefined;
  if (request.model === MODEL_IDS.minimaxH3) {
    if (images.length > H3_MAX_IMAGES) throw new Error(`MiniMax H3 takes ${H3_MAX_IMAGES} reference images; this shot has ${images.length}. Remove some, or render on Seedance.`);
    const hosted = clip ? await hostClipForH3(clip) : undefined;
    const uploads = hosted ? { uploads: [hosted.uploadId] } : {};
    const referenceVideos = hosted ? { referenceVideos: [hosted.url] } : {};
    // With a clip, H3 runs as long as the clip (up to 15 s), at the ratio nearest its shape.
    const input: H3Input = {
      stage: "generate",
      prompt,
      ...(firstFrame ? { firstFrame } : { ratio: clip ? nearestRatio(clip.width, clip.height) : request.ratio }),
      ...(referenceImages ? { referenceImages } : {}),
      ...referenceVideos,
      durationSec: clip ? Math.min(H3_CLIP_MAX_SEC, Math.max(4, Math.round(clip.durationSec))) : request.durationSec,
      resolution: request.h3Resolution,
      seed: request.seed,
    };
    return { input, characterIds: cast.characterIds, ...uploads };
  }
  const input: GenerateVideoInput = {
    stage: "draft",
    prompt,
    ...(firstFrame ? { firstFrame } : { ratio: request.ratio }),
    // With a clip, Seedance takes its length from it (the adapter sends -1).
    ...(withReferences ? await seedanceReferences(images, clip) : {}),
    durationSec: request.durationSec,
    generateAudio: request.audio,
    seed: request.seed,
  };
  return { input, characterIds: cast.characterIds };
}

async function startVideoJob(request: VideoRequest, firstFrame?: string, parentJobId?: string, final?: true): Promise<string> {
  const { input, characterIds, uploads } = await videoModelInput(request, firstFrame);
  const job = await startJob({
    kind: "video",
    modelId: request.model,
    ...(uploads ? { uploads } : {}),
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
  // The visitor's own photos keep the chosen model too (October 29), unless a
  // real person from the vault is in the cast.
  const seedanceCast = asked.cast.length ? await castForSeedance(asked.cast) : Boolean(asked.photos?.length);
  const request = routed(asked, !animatedCast && asked.mode === "image" && (await blobHasPerson(asked.sourceBlobId)), animatedCast, seedanceCast);
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
  // A reference clip's link went with the job, so it's hosted again.
  if (job.uploads?.length) return startVideoJob(request, undefined, job.id);
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

// Retry of a clip with a reference clip: its link went when the job ended,
// so the same request starts again with the clip hosted anew.
async function restartClip(job: Job): Promise<Job | undefined> {
  const request = (job.input as Partial<VideoJobInput>).request;
  if (job.kind !== "video" || !request?.clip) return undefined;
  return db.jobs.get(await startVideoJob(request, undefined, job.id));
}

export function registerVideoStudio(): () => void {
  const done = onJobDone(afterJob);
  const restart = onRestart(restartClip);
  return () => {
    done();
    restart();
  };
}
