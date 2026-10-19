// Faces to cast members (spec: Identity match score, Image): for each pair of
// detected face and cast member take the smallest distance to any of that
// member's references, then assign greedily by smallest distance, at most one
// face per member. With 3 people at most, greedy is fine.
import { bestDistance } from "./score";

export interface CastReference {
  id: string;
  references: readonly number[][];
}

// Each cast member's matched distance, or null when no face was left for them.
export function assignFaces(faces: readonly number[][], cast: readonly CastReference[]): Record<string, number | null> {
  const pairs: { face: number; member: string; d: number }[] = [];
  faces.forEach((descriptor, face) => {
    for (const member of cast) if (member.references.length) pairs.push({ face, member: member.id, d: bestDistance(descriptor, member.references) });
  });
  pairs.sort((a, b) => a.d - b.d);
  const result: Record<string, number | null> = Object.fromEntries(cast.map((m) => [m.id, null]));
  const usedFaces = new Set<number>();
  for (const { face, member, d } of pairs) {
    if (usedFaces.has(face) || result[member] !== null) continue;
    result[member] = d;
    usedFaces.add(face);
  }
  return result;
}
