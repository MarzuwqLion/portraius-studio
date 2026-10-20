// Identity scores for finished outputs (spec: Identity match score). The
// runner calls this for every job with a cast member in it. Images score every
// detected face; videos score one frame a second (up to 10) and report the
// median plus the worst frame. A video frame where someone's face can't be
// seen (turned away, too small) is skipped for them instead of scoring 0; an
// image without their face scores 0, since they should be in it.
import type { JobInput } from "@/lib/jobs/runner";
import { drawToCanvas } from "@/lib/media/image-prep";
import { sampleFrames } from "@/lib/media/video-frames";
import { db } from "@/lib/store/db";
import type { Job } from "@/lib/types/jobs";
import type { Generation } from "@/lib/types/records";
import { assignFaces, type CastReference } from "./assign";
import { detectFaces } from "./embed";
import { median, scoreFromDistance } from "./score";

async function castFor(characterIds: string[]): Promise<CastReference[]> {
  const records = await db.characters.bulkGet(characterIds);
  return records.flatMap((r) => (r?.kind === "person" && r.file.identity?.descriptors.length ? [{ id: r.id, references: r.file.identity.descriptors }] : []));
}

// Each cast member's score in one picture; null when their face isn't in it.
async function scoreCanvas(canvas: HTMLCanvasElement, cast: CastReference[]): Promise<Record<string, number | null>> {
  const faces = await detectFaces(canvas, 80);
  const distances = assignFaces(faces.map((f) => f.descriptor), cast);
  return Object.fromEntries(Object.entries(distances).map(([id, d]) => [id, d === null ? null : scoreFromDistance(d)]));
}

export function videoScores(perFrame: Record<string, number | null>[], castIds: string[]): Pick<Generation, "identityScores" | "identityScore" | "worstScore"> {
  const seen = (values: (number | null | undefined)[]) => values.filter((v): v is number => typeof v === "number");
  const identityScores = Object.fromEntries(castIds.map((id) => {
    const frames = seen(perFrame.map((f) => f[id]));
    return [id, frames.length ? median(frames) : null];
  }));
  const known = seen(Object.values(identityScores));
  if (!known.length) return { identityScores };
  return { identityScores, identityScore: Math.min(...known), worstScore: Math.min(...seen(perFrame.flatMap((f) => Object.values(f)))) };
}

export async function scoreJobOutputs(job: Job, generationIds: string[]): Promise<void> {
  const input = job.input as JobInput;
  for (const id of generationIds) {
    const generation = await db.generations.get(id);
    if (!generation) continue;
    if (input.stylised) {
      await db.generations.update(id, { scoreNote: "stylised" });
      continue;
    }
    const cast = await castFor(generation.characterIds);
    if (!cast.length) continue;
    const asset = generation.assets.find((a) => a.kind === "image") ?? generation.assets.find((a) => a.kind === "video");
    const blob = asset ? (await db.blobs.get(asset.blobId))?.blob : undefined;
    if (!asset || !blob) continue;

    if (asset.kind === "image") {
      const found = await scoreCanvas(await drawToCanvas(blob), cast);
      const scores = Object.fromEntries(Object.entries(found).map(([member, s]) => [member, s ?? 0]));
      await db.generations.update(id, { identityScores: scores, identityScore: Math.min(...Object.values(scores)) });
      continue;
    }

    const frames = await sampleFrames(blob);
    const perFrame: Record<string, number | null>[] = [];
    for (const frame of frames) perFrame.push(await scoreCanvas(frame.canvas, cast));
    await db.generations.update(id, videoScores(perFrame, cast.map((m) => m.id)));
  }
}
