// The Image studio's work (spec: Image studio): build a request for the
// picked model (Nano Banana 2.1, or Qwen-Image-Edit on the visitor's ComfyUI)
// from the scene, cast, source image and camera, start Count jobs, and retry
// once automatically when a result drifts.
import { CHECK_SCORE } from "@/lib/identity/score";
import { onJobDone, startJob, type JobInput } from "@/lib/jobs/runner";
import { toInlineImage } from "@/lib/media/image-prep";
import { isStylised, type CameraSelection } from "@/lib/prompts/camera";
import { compileImagePrompt } from "@/lib/prompts/compile";
import type { GenerateImageInput, ImageAspectRatio } from "@/lib/registry/inputs";
import { adapterFor } from "@/lib/registry/adapters";
import { MODEL_IDS } from "@/lib/registry/models";
import { db } from "@/lib/store/db";
import { getSettings } from "@/lib/store/settings";
import type { Job } from "@/lib/types/jobs";
import { buildCast, type CastPick } from "./cast";

// Everything needed to rebuild the request, kept on each job for retries and
// recipes. Images are referenced by blob ID, never stored inline.
export interface ImageRequest {
  scene: string;
  cast: CastPick[];
  sourceBlobId?: string;     // edit mode
  aspectRatio: ImageAspectRatio;
  size: GenerateImageInput["size"];
  quality: GenerateImageInput["quality"];
  count: number;
  camera: CameraSelection;
  promptOverride?: string;   // advanced mode: the compiled prompt, edited
  remixOf?: string;          // a remix: the source recipe's hash (lib/recipes/share.ts)
  modelId?: string;          // Nano Banana 2.1 when unset (requests from before the local engine)
}

export const imageModel = (request: Pick<ImageRequest, "modelId">) => request.modelId ?? MODEL_IDS.nanoBanana;

// A model that takes few images gets one per cast member (lib/studio/cast.ts).
export function isCompact(modelId: string): boolean {
  const max = adapterFor(modelId).limits.maxRefImages;
  return max !== undefined && max <= 3;
}

// Why a request asks more images than its model takes, or undefined.
export function tooManyImages(modelId: string, castSize: number, editing: boolean): string | undefined {
  const max = adapterFor(modelId).limits.maxRefImages;
  if (!isCompact(modelId) || max === undefined || castSize + (editing ? 1 : 0) <= max) return undefined;
  return editing ? `Qwen on your GPU takes ${max} images: the source and ${max - 1} cast members at most.` : `Qwen on your GPU takes ${max} cast members at most.`;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export async function compileImageRequest(request: ImageRequest, options: { withFront?: boolean } = {}): Promise<{ input: GenerateImageInput; prompt: string; characterIds: string[] }> {
  const modelId = imageModel(request);
  const tooMany = tooManyImages(modelId, request.cast.length, Boolean(request.sourceBlobId));
  if (tooMany) throw new Error(tooMany);
  const cast = await buildCast(request.cast, { ...options, compact: isCompact(modelId) });
  const prompt =
    request.promptOverride?.trim() ||
    compileImagePrompt({ scene: request.scene, cast: cast.members, camera: request.camera, modelId, editing: Boolean(request.sourceBlobId) });
  let source;
  if (request.sourceBlobId) {
    const row = await db.blobs.get(request.sourceBlobId);
    if (!row) throw new Error("The source image is gone. Pick it again.");
    source = await toInlineImage(row.blob);
  }
  return {
    prompt,
    characterIds: cast.characterIds,
    input: { prompt, references: cast.images, ...(source ? { source } : {}), aspectRatio: request.aspectRatio, size: request.size, quality: request.quality },
  };
}

function jobInput(request: ImageRequest, compiled: Awaited<ReturnType<typeof compileImageRequest>>, seed: number): JobInput<GenerateImageInput> & { request: ImageRequest } {
  return {
    model: { ...compiled.input, seed },
    characterIds: compiled.characterIds,
    prompt: request.scene,
    stylised: isStylised(request.camera),
    request,
  };
}

// Count runs as that many separate jobs (Router queues them one at a time).
export async function startImages(request: ImageRequest): Promise<string[]> {
  const compiled = await compileImageRequest(request);
  const ids: string[] = [];
  for (let i = 0; i < request.count; i++) {
    const job = await startJob({ kind: "image", modelId: imageModel(request), input: jobInput(request, compiled, randomSeed()) });
    ids.push(job.id);
  }
  return ids;
}

// Spec: Bands and actions. Under 60 on an image gets one automatic retry with
// a new seed and the front view added to the references; both results stay.
async function retryIfDrifted(job: Job): Promise<void> {
  if (job.kind !== "image" || job.parentJobId) return;
  const input = job.input as JobInput & { request?: ImageRequest };
  if (!input.request || !input.characterIds.length || input.stylised) return;
  const generation = await db.generations.get(job.generationIds[0] ?? "");
  if (generation?.identityScore === undefined || generation.identityScore >= CHECK_SCORE) return;
  if (!(await getSettings()).autoRetry) return;
  const request = { ...input.request, count: 1 };
  const compiled = await compileImageRequest(request, { withFront: true });
  await startJob({ kind: "image", modelId: job.modelId, input: jobInput(request, compiled, randomSeed()), parentJobId: job.id });
}

export function registerImageStudio(): () => void {
  return onJobDone(retryIfDrifted);
}
