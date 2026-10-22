// "Make it real" (spec: Finishing, Realism pass): the Freepik skin enhancer on
// one still, or SeedVR2 on the visitor's ComfyUI (spec: Local engine), then the
// same identity score again, so the before and after can be compared side by
// side.
import { DEFAULT_STRENGTH } from "@/lib/adapters/freepik-skin";
import { startJob, type JobInput } from "@/lib/jobs/runner";
import { toInlineImage } from "@/lib/media/image-prep";
import type { EnhanceImageInput } from "@/lib/registry/inputs";
import { MODEL_IDS } from "@/lib/registry/models";
import { db } from "@/lib/store/db";
import type { Job } from "@/lib/types/jobs";

export { DEFAULT_STRENGTH };

export interface RealismRequest {
  sourceGenerationId: string;
  strength: number;
}

export type RealismJobInput = JobInput<EnhanceImageInput> & { request: RealismRequest };

export async function startRealism(sourceGenerationId: string, strength = DEFAULT_STRENGTH, modelId: string = MODEL_IDS.freepikSkin): Promise<Job> {
  const source = await db.generations.get(sourceGenerationId);
  const asset = source?.assets.find((a) => a.kind === "image");
  const blob = asset ? (await db.blobs.get(asset.blobId))?.blob : undefined;
  if (!source || !blob) throw new Error("That still isn't in your library any more.");
  const input: RealismJobInput = {
    model: { image: await toInlineImage(blob), strength },
    // The same cast as the still, so the pass is scored against the same people.
    characterIds: source.characterIds,
    ...(source.prompt ? { prompt: source.prompt } : {}),
    ...(source.scoreNote === "stylised" ? { stylised: true } : {}),
    request: { sourceGenerationId, strength },
  };
  return startJob({ kind: "enhance", modelId, input });
}

// The still a realism pass started from, for the before/after view.
export function realismSource(job: Pick<Job, "kind" | "input"> | undefined): string | undefined {
  if (job?.kind !== "enhance") return undefined;
  return (job.input as Partial<RealismJobInput>).request?.sourceGenerationId;
}
