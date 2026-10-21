// A generation's cast: characters assigned to prompt slots, turned into the
// compiler's cast list and the reference images that go with it.
import { toInlineImage } from "@/lib/media/image-prep";
import type { CastMember, ReferenceKind } from "@/lib/prompts/compile";
import { slotsIn } from "@/lib/prompts/slots";
import type { InlineImage } from "@/lib/registry/inputs";
import { isUsable, loadBundle } from "@/lib/store/characters";
import { db } from "@/lib/store/db";
import type { CharacterRecord } from "@/lib/types/records";

export interface CastPick {
  slot: string;
  characterId: string;
}

// The UI caps a generation at 3 people and 4 elements (spec: Limits per generation).
export const MAX_PEOPLE = 3;
export const MAX_ELEMENTS = 4;

const PERSON_SLOTS = ["lead", "second", "third"];

export function nextSlot(record: CharacterRecord, used: readonly string[]): string {
  if (record.kind === "person") return PERSON_SLOTS.find((s) => !used.includes(s)) ?? `person${used.length + 1}`;
  const base = record.file.elementType ?? "element";
  if (!used.includes(base)) return base;
  let n = 2;
  while (used.includes(`${base}${n}`)) n++;
  return `${base}${n}`;
}

export interface CastBundle {
  members: CastMember[];
  images: InlineImage[];
  characterIds: string[];
}

// Per person: the sheet composite plus the best source photo (or, for a
// designed character, the front view); per element: its sheet. withFront adds
// each person's front view too (the drift retry).
export async function buildCast(picks: readonly CastPick[], options: { withFront?: boolean } = {}): Promise<CastBundle> {
  const members: CastMember[] = [];
  const images: InlineImage[] = [];
  for (const pick of picks) {
    const record = await db.characters.get(pick.characterId);
    if (!record) throw new Error("A cast member is no longer in your vault.");
    if (!isUsable(record)) throw new Error(`${record.name} was imported without a consent record, so they can't be used in a generation.`);
    const bundle = await loadBundle(record.id);
    const file = (path: string) => {
      const blob = bundle?.files.get(path);
      if (!blob) throw new Error(`${record.name} is missing ${path}.`);
      return blob;
    };
    const refs: { kind: ReferenceKind; blob: Blob }[] = [{ kind: "sheet", blob: file(record.file.sheet.composite) }];
    if (record.kind === "person") {
      const photo = record.file.photos[0];
      refs.push(photo ? { kind: "photo", blob: file(photo.path) } : { kind: "front", blob: file(record.file.sheet.views.front) });
      if (options.withFront && photo) refs.push({ kind: "front", blob: file(record.file.sheet.views.front) });
    }
    members.push({ slot: pick.slot, name: record.name, kind: record.kind, description: record.file.description, references: refs.map((r) => r.kind) });
    for (const ref of refs) images.push(await toInlineImage(ref.blob));
  }
  return { members, images, characterIds: picks.map((p) => p.characterId) };
}

export const dataUri = (image: InlineImage) => `data:${image.mime};base64,${image.base64}`;

// The cast as the compiler sees it, without loading any images: for the
// prompt preview, which updates as the user types.
export async function describeCast(picks: readonly CastPick[]): Promise<CastMember[]> {
  const records = await db.characters.bulkGet(picks.map((p) => p.characterId));
  return picks.flatMap((pick, i) => {
    const record = records[i];
    if (!record) return [];
    const references: ReferenceKind[] = record.kind === "person" ? ["sheet", record.file.photos.length ? "photo" : "front"] : ["sheet"];
    return [{ slot: pick.slot, name: record.name, kind: record.kind, description: record.file.description, references }];
  });
}

// Who played each {slot} of a finished take, for showing its prompt: the
// request's own cast when the job kept it, or, with one character and one
// slot, that one. A slot left out stays "@slot" on screen.
export function castOfTake(prompt: string, characterIds: readonly string[], requestCast?: readonly CastPick[]): Record<string, string> {
  if (requestCast?.length) return Object.fromEntries(requestCast.filter((c) => characterIds.includes(c.characterId)).map((c) => [c.slot, c.characterId]));
  const slots = [...new Set(slotsIn(prompt))];
  return slots.length === 1 && characterIds.length === 1 ? { [slots[0]!]: characterIds[0]! } : {};
}
