// Identity scores for finished outputs (spec: Identity match score). The
// runner calls this for every job with a cast member in it. Images score every
// detected face; videos score one frame a second (up to 10) and report the
// median plus the worst frame.
import type { JobInput } from "@/lib/jobs/runner";
import { drawToCanvas } from "@/lib/media/image-prep";
import { sampleFrames } from "@/lib/media/video-frames";
import { db } from "@/lib/store/db";
import type { Job } from "@/lib/types/jobs";
import { assignFaces, type CastReference } from "./assign";
import { detectFaces } from "./embed";
import { median, scoreFromDistance } from "./score";

async function castFor(characterIds: string[]): Promise<CastReference[]> {
  const records = await db.characters.bulkGet(characterIds);
  return records.flatMap((r) => (r?.kind === "person" && r.file.identity?.descriptors.length ? [{ id: r.id, references: r.file.identity.descriptors }] : []));
}

async function scoreCanvas(canvas: HTMLCanvasElement, cast: CastReference[]): Promise<Record<string, number>> {
  const faces = await detectFaces(canvas, 80);
  const distances = assignFaces(faces.map((f) => f.descriptor), cast);
  // A cast member whose face isn't in the frame scores 0.
  return Object.fromEntries(Object.entries(distances).map(([id, d]) => [id, d === null ? 0 : scoreFromDistance(d)]));
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
      const scores = await scoreCanvas(await drawToCanvas(blob), cast);
      await db.generations.update(id, { identityScores: scores, identityScore: Math.min(...Object.values(scores)) });
      continue;
    }

    const frames = await sampleFrames(blob);
    const perFrame: Record<string, number>[] = [];
    for (const frame of frames) perFrame.push(await scoreCanvas(frame.canvas, cast));
    const scores = Object.fromEntries(cast.map((m) => [m.id, median(perFrame.map((f) => f[m.id] ?? 0))]));
    await db.generations.update(id, {
      identityScores: scores,
      identityScore: Math.min(...Object.values(scores)),
      worstScore: Math.min(...perFrame.map((f) => Math.min(...Object.values(f)))),
    });
  }
}
