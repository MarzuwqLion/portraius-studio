// The Image studio's work (spec: Image studio): build a Nano Banana 2.1
// request from the scene, cast, source image and camera, start Count jobs, and
// retry once automatically when a result drifts.
import { CHECK_SCORE } from "@/lib/identity/score";
import { onJobDone, startJob, type JobInput } from "@/lib/jobs/runner";
import { toInlineImage } from "@/lib/media/image-prep";
import { isStylised, type CameraSelection } from "@/lib/prompts/camera";
import { compileImagePrompt } from "@/lib/prompts/compile";
import type { GenerateImageInput, ImageAspectRatio } from "@/lib/registry/inputs";
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
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export async function compileImageRequest(request: ImageRequest, options: { withFront?: boolean } = {}): Promise<{ input: GenerateImageInput; prompt: string; characterIds: string[] }> {
  const cast = await buildCast(request.cast, options);
  const prompt =
    request.promptOverride?.trim() ||
    compileImagePrompt({ scene: request.scene, cast: cast.members, camera: request.camera, modelId: MODEL_IDS.nanoBanana, editing: Boolean(request.sourceBlobId) });
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
    const job = await startJob({ kind: "image", modelId: MODEL_IDS.nanoBanana, input: jobInput(request, compiled, randomSeed()) });
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
  await startJob({ kind: "image", modelId: MODEL_IDS.nanoBanana, input: jobInput(request, compiled, randomSeed()), parentJobId: job.id });
}

export function registerImageStudio(): () => void {
  return onJobDone(retryIfDrifted);
}
