// The create wizard's work, apart from React (spec: Character vault). Photos
// are prepped and checked in the browser, sheet images come from Nano Banana
// 2.1 jobs on the runner, and saving assembles a .portraius bundle.
import { FACE_MODEL, checkPhoto, detectFaces } from "@/lib/identity/embed";
import { CONSENT_MAX_DISTANCE, bestDistance, meanDescriptor, scoreFromDistance } from "@/lib/identity/score";
import { startJob } from "@/lib/jobs/runner";
import { blobToBase64, drawToCanvas, makeThumb, prepareImage, toInlineImage } from "@/lib/media/image-prep";
import { MODEL_IDS } from "@/lib/registry/models";
import type { InlineImage } from "@/lib/registry/inputs";
import { saveCharacter } from "@/lib/store/characters";
import { db } from "@/lib/store/db";
import type { CharacterFile, CharacterRecord } from "@/lib/types/records";
import { CONSENT_CLIP, THUMB, isLocked } from "./format";
import { clearDraft, putDraftBlob, type DraftPhoto, type WizardDraft } from "./draft";
import { CANDIDATE_COUNT, SHEET_PATHS, SHEET_VIEWS, candidateInput, compositeInput, viewInput, type SheetView } from "./sheet";

export const MIN_PHOTOS = 3;
export const MAX_PHOTOS = 10;

// ---- Photos ----

export async function addPhoto(draft: WizardDraft, source: Blob): Promise<DraftPhoto> {
  const prepared = await prepareImage(source);
  const check = await checkPhoto(await drawToCanvas(prepared.blob));
  const blobId = await putDraftBlob(draft.path, `photo-${crypto.randomUUID()}`, prepared.blob);
  return { blobId, width: prepared.width, height: prepared.height, quality: check.quality, ...(check.descriptor ? { descriptor: check.descriptor } : {}) };
}

export function goodPhotos(draft: WizardDraft): DraftPhoto[] {
  return draft.photos.filter((p) => p.quality === "good");
}

async function blob(id: string): Promise<Blob> {
  const row = await db.blobs.get(id);
  if (!row) throw new Error("A photo for this character is missing. Add it again.");
  return row.blob;
}

// ---- Job results ----

export async function jobImage(jobId: string): Promise<Blob | undefined> {
  const job = await db.jobs.get(jobId);
  const generationId = job?.status === "done" ? job.generationIds[0] : undefined;
  if (!generationId) return undefined;
  const generation = await db.generations.get(generationId);
  const asset = generation?.assets.find((a) => a.kind === "image");
  return asset ? (await db.blobs.get(asset.blobId))?.blob : undefined;
}

async function requireJobImage(jobId: string | undefined, what: string): Promise<Blob> {
  const image = jobId ? await jobImage(jobId) : undefined;
  if (!image) throw new Error(`The ${what} isn't ready yet.`);
  return image;
}

// ---- Sheet ----

// What the sheet is drawn from: the photos, or the picked candidate face.
async function sheetReferences(draft: WizardDraft): Promise<InlineImage[]> {
  if (draft.path === "text") return [await toInlineImage(await requireJobImage(draft.pickedCandidateJobId, "picked face"))];
  // Photos are already prepped JPEGs.
  return Promise.all(goodPhotos(draft).map(async (p) => ({ mime: "image/jpeg" as const, base64: await blobToBase64(await blob(p.blobId)) })));
}

function sheetJob(input: ReturnType<typeof compositeInput>, prompt: string): Promise<string> {
  return startJob({ kind: "sheet", modelId: MODEL_IDS.nanoBanana, input: { model: input, characterIds: [], prompt } }).then((job) => job.id);
}

export async function compositeInputFor(draft: WizardDraft): Promise<ReturnType<typeof compositeInput>> {
  return compositeInput(await sheetReferences(draft));
}

export async function startComposite(draft: WizardDraft): Promise<string> {
  return sheetJob(await compositeInputFor(draft), "Turnaround sheet");
}

export async function startView(draft: WizardDraft, view: SheetView): Promise<string> {
  const composite = await toInlineImage(await requireJobImage(draft.compositeJobIds.at(-1), "turnaround sheet"));
  return sheetJob(viewInput(view, await sheetReferences(draft), composite), `Sheet view: ${view}`);
}

export async function startCandidates(description: string): Promise<string[]> {
  const input = candidateInput(description);
  const ids: string[] = [];
  for (let i = 0; i < CANDIDATE_COUNT; i++) ids.push(await sheetJob(input, "Candidate face"));
  return ids;
}

// ---- Identity ----

export async function referenceDescriptors(draft: WizardDraft): Promise<number[][]> {
  if (draft.path === "text") return draft.candidateDescriptor ? [draft.candidateDescriptor] : [];
  return goodPhotos(draft).flatMap((p) => (p.descriptor ? [p.descriptor] : []));
}

// The largest face in an image, or undefined when there's none.
export async function faceDescriptor(image: Blob): Promise<number[] | undefined> {
  const faces = await detectFaces(await drawToCanvas(image), 80);
  return faces[0]?.descriptor;
}

// 0 to 100 against the references, or null when no face is found. With
// several faces (the composite's panels) the closest one counts.
export async function scoreImage(image: Blob, references: readonly number[][]): Promise<number | null> {
  if (!references.length) return null;
  const faces = await detectFaces(await drawToCanvas(image), 80);
  if (!faces.length) return null;
  return Math.max(...faces.map((f) => scoreFromDistance(bestDistance(f.descriptor, references))));
}

// ---- Save ----

export function pickedViews(draft: WizardDraft): Record<SheetView, string> | undefined {
  const picks = {} as Record<SheetView, string>;
  for (const view of SHEET_VIEWS) {
    const pick = draft.pickedViewJobIds[view];
    if (!pick) return undefined;
    picks[view] = pick;
  }
  return picks;
}

export async function saveFromDraft(draft: WizardDraft): Promise<CharacterRecord> {
  const views = pickedViews(draft);
  if (!views) throw new Error("Pick a take for every view first.");
  const now = new Date().toISOString();
  const files = new Map<string, Blob>();

  const photos = draft.path === "photos" ? goodPhotos(draft) : [];
  const photoEntries = await Promise.all(
    photos.map(async (p, i) => {
      const path = `photos/${String(i + 1).padStart(3, "0")}.jpg`;
      files.set(path, await blob(p.blobId));
      return { path, width: p.width, height: p.height };
    }),
  );

  files.set(SHEET_PATHS.composite, await requireJobImage(draft.compositeJobIds.at(-1), "turnaround sheet"));
  for (const view of SHEET_VIEWS) files.set(SHEET_PATHS[view], await requireJobImage(views[view], `${view} view`));
  files.set(THUMB, await makeThumb(files.get(SHEET_PATHS.front)!));
  if (draft.consent?.checkClip && draft.consentClipBlobId) files.set(CONSENT_CLIP, await blob(draft.consentClipBlobId));

  const descriptors = await referenceDescriptors(draft);
  const file: CharacterFile = {
    format: "portraius.character",
    version: 1,
    id: draft.id,
    kind: "person",
    origin: draft.path === "photos" ? "photos" : "designed",
    name: draft.name.trim(),
    description: draft.description.trim(),
    createdAt: now,
    updatedAt: now,
    photos: photoEntries,
    sheet: {
      composite: SHEET_PATHS.composite,
      views: { front: SHEET_PATHS.front, threeQuarter: SHEET_PATHS.threeQuarter, profile: SHEET_PATHS.profile, fullBody: SHEET_PATHS.fullBody },
      model: MODEL_IDS.nanoBanana,
    },
    ...(descriptors.length ? { identity: { descriptors, mean: meanDescriptor(descriptors), model: FACE_MODEL, threshold: CONSENT_MAX_DISTANCE } } : {}),
    ...(draft.consent ? { consent: draft.consent } : {}),
    tags: draft.tags,
  };
  const record = await saveCharacter({ file, files }, { locked: isLocked(file) });
  await clearDraft(draft.path);
  return record;
}
