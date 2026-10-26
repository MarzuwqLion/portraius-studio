// A person's likeness sheet (contest polish, October 25): their best-scored
// stills and video frames from the library, drawn into one picture.
import { CHECK_SCORE } from "@/lib/identity/score";
import { drawLikenessSheet, SHEET_MAX_SHOTS } from "@/lib/media/likeness-sheet";
import { db } from "@/lib/store/db";
import type { CharacterRecord, Generation } from "@/lib/types/records";

// This person's score in a result: their own when the result has several cast members.
export function scoreFor(generation: Generation, characterId: string): number | undefined {
  if (generation.scoreNote === "stylised") return undefined;
  const own = generation.identityScores?.[characterId];
  return typeof own === "number" ? own : generation.characterIds.length === 1 ? generation.identityScore : undefined;
}

// The best-scored results with a still to show: an image, or a video's saved
// frame. Drifted ones (under 60) stay out: a face turned away scores 0.
export async function sheetPicks(characterId: string, max = SHEET_MAX_SHOTS): Promise<{ blobId: string; score: number }[]> {
  const generations = await db.generations.where("characterIds").equals(characterId).toArray();
  return generations
    .flatMap((g) => {
      const score = scoreFor(g, characterId);
      const still = g.assets.find((a) => a.kind === "image") ?? g.assets.find((a) => a.kind === "frame");
      return score === undefined || score < CHECK_SCORE || !still ? [] : [{ blobId: still.blobId, score }];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

export async function makeLikenessSheet(record: CharacterRecord): Promise<{ blob: Blob; name: string } | undefined> {
  const picks = await sheetPicks(record.id);
  if (!picks.length) return undefined;
  const shots = [];
  for (const pick of picks) {
    const row = await db.blobs.get(pick.blobId);
    if (row) shots.push({ image: await createImageBitmap(row.blob), score: pick.score });
  }
  if (!shots.length) return undefined;
  const blob = await drawLikenessSheet(record.name, shots);
  for (const s of shots) s.image.close();
  return { blob, name: `${record.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-likeness.png` };
}
