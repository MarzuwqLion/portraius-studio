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

function memberOf(pick: CastPick, record: CharacterRecord): Omit<CastMember, "references"> {
  const { appearance, artStyle } = record.file;
  const animated = record.kind === "person" && appearance === "animated";
  return {
    slot: pick.slot,
    name: record.name,
    kind: record.kind,
    description: record.file.description,
    ...(animated ? { appearance, ...(artStyle ? { artStyle } : {}) } : {}),
  };
}

// A cast of animated people (elements beside them are fine): Seedance takes
// them, since it refuses only photoreal people. A cast with no person, or
// with any real person, isn't.
export function isAnimatedCast(records: readonly (CharacterRecord | undefined)[]): boolean {
  const people = records.filter((r) => r?.kind === "person");
  return people.length > 0 && people.every((r) => r!.file.appearance === "animated");
}

export async function castIsAnimated(picks: readonly CastPick[]): Promise<boolean> {
  return picks.length > 0 && isAnimatedCast(await db.characters.bulkGet(picks.map((p) => p.characterId)));
}

// A cast of elements only (outfits, props, locations): no person for
// Seedance to refuse.
export function hasNoPeople(records: readonly (CharacterRecord | undefined)[]): boolean {
  return records.length > 0 && records.every((r) => r !== undefined && r.kind !== "person");
}

export async function castHasNoPeople(picks: readonly CastPick[]): Promise<boolean> {
  return hasNoPeople(await db.characters.bulkGet(picks.map((p) => p.characterId)));
}

export interface CastBundle {
  members: CastMember[];
  images: InlineImage[];
  characterIds: string[];
}

// Per person: the sheet composite plus the best source photo (or, for a
// designed character, the front view); per element: its sheet. withFront adds
// each person's front view too (the drift retry). compact sends one image per
// member, for a model that takes few (Qwen on the visitor's ComfyUI takes 3):
// a person's front view, an element's sheet.
// compact sends one view per person: the front view, or the one `view` names.
export async function buildCast(picks: readonly CastPick[], options: { withFront?: boolean; compact?: boolean; view?: "front" | "fullBody" } = {}): Promise<CastBundle> {
  const view = options.view ?? "front";
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
    const refs: { kind: ReferenceKind; blob: Blob }[] =
      options.compact && record.kind === "person" ? [{ kind: view, blob: file(record.file.sheet.views[view]) }] : [{ kind: "sheet", blob: file(record.file.sheet.composite) }];
    if (record.kind === "person" && !options.compact) {
      const photo = record.file.photos[0];
      refs.push(photo ? { kind: "photo", blob: file(photo.path) } : { kind: "front", blob: file(record.file.sheet.views.front) });
      if (options.withFront && photo) refs.push({ kind: "front", blob: file(record.file.sheet.views.front) });
    }
    members.push({ ...memberOf(pick, record), references: refs.map((r) => r.kind) });
    for (const ref of refs) images.push(await toInlineImage(ref.blob));
  }
  return { members, images, characterIds: picks.map((p) => p.characterId) };
}

export const dataUri = (image: InlineImage) => `data:${image.mime};base64,${image.base64}`;

// The cast as the compiler sees it, without loading any images: for the
// prompt preview, which updates as the user types.
export async function describeCast(picks: readonly CastPick[], options: { compact?: boolean } = {}): Promise<CastMember[]> {
  const records = await db.characters.bulkGet(picks.map((p) => p.characterId));
  return picks.flatMap((pick, i) => {
    const record = records[i];
    if (!record) return [];
    const references: ReferenceKind[] =
      record.kind !== "person" ? ["sheet"] : options.compact ? ["front"] : ["sheet", record.file.photos.length ? "photo" : "front"];
    return [{ ...memberOf(pick, record), references }];
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
