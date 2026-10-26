// "Export 9:16" on a finished clip (spec: Remix links, Social export; Recast,
// Result view). A Recast exports its original and result in one frame, so
// the swap reads on a phone; anything else is one clip on Studio grey. The
// end card is on unless the user turns it off.
import type { JobInput } from "@/lib/jobs/runner";
import { fileName } from "@/lib/library/library";
import { drawEndCard, drawLabels, ffmpegColour, tokenColour, type CardLikeness } from "@/lib/media/social-card";
import { exportSocial, socialLayout, type SocialSource } from "@/lib/media/social";
import { clipInfo } from "@/lib/media/video-prep";
import { db } from "@/lib/store/db";
import type { Generation } from "@/lib/types/records";
import type { RecastRequest } from "./recast";

async function source(blob: Blob): Promise<SocialSource & { durationSec: number }> {
  const info = await clipInfo(blob);
  return { blob, width: info.width, height: info.height, durationSec: info.durationSec };
}

// The likeness to put on the end card: the clip's score and the people in it.
async function cardLikeness(generation: Generation): Promise<CardLikeness | undefined> {
  if (generation.identityScore === undefined || generation.scoreNote === "stylised") return undefined;
  const people = (await db.characters.bulkGet(generation.characterIds)).filter((c) => c?.kind === "person");
  return { score: generation.identityScore, names: people.map((c) => c!.name) };
}

export async function socialExport(generationId: string, options: { endCard: boolean; likeness?: boolean }, onProgress?: (share: number) => void): Promise<{ blob: Blob; name: string }> {
  const generation = await db.generations.get(generationId);
  const asset = generation?.assets.find((a) => a.kind === "video");
  const video = asset ? (await db.blobs.get(asset.blobId))?.blob : undefined;
  if (!generation || !asset || !video) throw new Error("That clip isn't in your library any more.");
  const result = await source(video);

  let sources = [result];
  let labels: string[] | undefined;
  if (generation.type === "recast") {
    const job = await db.jobs.get(generation.jobId);
    const clipId = (job?.input as (JobInput & { request?: RecastRequest }) | undefined)?.request?.clipBlobId;
    const original = clipId ? (await db.blobs.get(clipId))?.blob : undefined;
    if (original) {
      sources = [await source(original), result];
      labels = ["Original", "Recast"];
    }
  }

  const layout = socialLayout(sources);
  const likeness = options.endCard && options.likeness ? await cardLikeness(generation) : undefined;
  const blob = await exportSocial(
    sources,
    {
      durationSec: result.durationSec,
      background: ffmpegColour(tokenColour("--seamless")),
      ...(labels ? { overlay: await drawLabels(layout.cells, layout.clips, labels) } : {}),
      ...(options.endCard ? { endCard: await drawEndCard(likeness) } : {}),
      // A recast keeps its own sound, or the original's when it has none.
      audioOrder: sources.length === 2 ? [1, 0] : [0],
    },
    onProgress,
  );
  return { blob, name: fileName(generation, 0, "video", "video/mp4").replace(/\.mp4$/, "-9x16.mp4") };
}
