// Changes to a saved character: redrawing one view, export and import
// (spec: Character vault, Turnaround sheet and Import and export).
import { blobToBase64, makeThumb, toInlineImage } from "@/lib/media/image-prep";
import { startJob } from "@/lib/jobs/runner";
import { MODEL_IDS } from "@/lib/registry/models";
import type { InlineImage } from "@/lib/registry/inputs";
import { isUsable, loadBundle, saveCharacter } from "@/lib/store/characters";
import { db } from "@/lib/store/db";
import type { CharacterBundle, CharacterRecord } from "@/lib/types/records";
import { jobImage } from "./create";
import { THUMB, exportCharacter, importCharacter, type ImportSummary } from "./format";
import { elementViewInput } from "./element-sheet";
import { SHEET_PATHS, viewInput, type SheetView } from "./sheet";

async function requireBundle(id: string): Promise<CharacterBundle> {
  const bundle = await loadBundle(id);
  if (!bundle) throw new Error("This character isn't in your vault any more.");
  return bundle;
}

function requireFile(bundle: CharacterBundle, path: string): Blob {
  const file = bundle.files.get(path);
  if (!file) throw new Error(`${path} is missing from this character.`);
  return file;
}

// A view is redrawn from the photos (or, for a designed character, the front
// view) plus the composite, like the wizard draws it.
export async function startRedraw(record: CharacterRecord, view: SheetView): Promise<string> {
  if (!isUsable(record)) throw new Error("This character was imported without a consent record, so it can't be used in any generation.");
  const bundle = await requireBundle(record.id);
  const references: InlineImage[] =
    record.file.origin === "photos" && record.file.photos.length
      ? await Promise.all(record.file.photos.map(async (p) => ({ mime: "image/jpeg" as const, base64: await blobToBase64(requireFile(bundle, p.path)) })))
      : [await toInlineImage(requireFile(bundle, record.file.sheet.views.front))];
  const composite = await toInlineImage(requireFile(bundle, record.file.sheet.composite));
  const job = await startJob({
    kind: "sheet",
    modelId: MODEL_IDS.nanoBanana,
    input: {
      model: record.kind === "element" ? elementViewInput(elementType(record), view, references, composite) : viewInput(view, references, composite),
      // An element has no face to score.
      characterIds: record.kind === "person" ? [record.id] : [],
      prompt: `Redraw ${view} view of ${record.name}`,
    },
  });
  return job.id;
}

function elementType(record: CharacterRecord) {
  const type = record.file.elementType;
  return type === "outfit" || type === "location" ? type : "prop";
}

// Puts a finished redraw into the character in place of the old view.
export async function applyRedraw(record: CharacterRecord, view: SheetView, jobId: string): Promise<void> {
  const image = await jobImage(jobId);
  if (!image) throw new Error("That take isn't ready yet.");
  const bundle = await requireBundle(record.id);
  bundle.files.set(SHEET_PATHS[view], image);
  if (view === "front") bundle.files.set(THUMB, await makeThumb(image));
  await saveCharacter({ file: { ...bundle.file, updatedAt: new Date().toISOString() }, files: bundle.files }, { locked: record.locked });
}

export async function exportFile(record: CharacterRecord, options: { includeClip: boolean }): Promise<{ blob: Blob; filename: string }> {
  const blob = await exportCharacter(await requireBundle(record.id), options);
  const slug = record.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "character";
  return { blob, filename: `${slug}.portraius` };
}

export interface PendingImport {
  bundle: CharacterBundle;
  summary: ImportSummary;
  replaces?: string; // the name of the vault character with the same ID
}

export async function readImport(file: Blob): Promise<PendingImport> {
  const { bundle, summary } = await importCharacter(file);
  const existing = await db.characters.get(bundle.file.id);
  return { bundle, summary, ...(existing ? { replaces: existing.name } : {}) };
}

export async function addImport(pending: PendingImport): Promise<CharacterRecord> {
  return saveCharacter(pending.bundle, { locked: pending.summary.locked });
}
