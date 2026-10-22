// The create wizard's work, apart from React (spec: Character vault). Photos
// are prepped and checked in the browser, sheet images come from jobs on the
// runner (Nano Banana 2.1, or Qwen-Image-Edit on the visitor's ComfyUI: spec,
// Local engine), and saving assembles a .portraius bundle.
import { FACE_MODEL, checkPhoto, detectFaces } from "@/lib/identity/embed";
import { CONSENT_MAX_DISTANCE, bestDistance, meanDescriptor, scoreFromDistance } from "@/lib/identity/score";
import { startJob } from "@/lib/jobs/runner";
import { blobToBase64, drawToCanvas, makeThumb, prepareImage, toInlineImage } from "@/lib/media/image-prep";
import { voice } from "@/lib/presets/load";
import { adapterFor } from "@/lib/registry/adapters";
import type { InlineImage } from "@/lib/registry/inputs";
import { saveCharacter } from "@/lib/store/characters";
import { db } from "@/lib/store/db";
import type { CharacterFile, CharacterRecord } from "@/lib/types/records";
import { CONSENT_CLIP, THUMB, isLocked } from "./format";
import { clearDraft, loadDraft, newDraft, putDraftBlob, saveDraft, type CreatePath, type DraftPhoto, type WizardDraft } from "./draft";
import { MAX_ELEMENT_PHOTOS, MIN_ELEMENT_PHOTOS, elementCompositeInput, elementViewInput } from "./element-sheet";
import { CANDIDATE_COUNT, SHEET_PATHS, SHEET_VIEWS, candidateInput, compositeInput, viewInput, type SheetView } from "./sheet";

export const MIN_PHOTOS = 3;
export const MAX_PHOTOS = 10;

export function photoLimits(path: CreatePath): { min: number; max: number } {
  return path === "element" ? { min: MIN_ELEMENT_PHOTOS, max: MAX_ELEMENT_PHOTOS } : { min: MIN_PHOTOS, max: MAX_PHOTOS };
}

// ---- Photos ----

export async function addPhoto(draft: WizardDraft, source: Blob): Promise<DraftPhoto> {
  const prepared = await prepareImage(source);
  // An element has no face to check.
  if (draft.path === "element") {
    const blobId = await putDraftBlob(draft.path, `photo-${crypto.randomUUID()}`, prepared.blob);
    return { blobId, width: prepared.width, height: prepared.height, quality: "good" };
  }
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

// "Save as element" on a still: it joins the element being made (from its
// first step, so the sheet is drawn with it), or starts a new one.
export async function addStillToElement(image: Blob): Promise<void> {
  const draft = (await loadDraft("element")) ?? newDraft("element");
  if (draft.photos.length >= MAX_ELEMENT_PHOTOS) throw new Error(`The element you're making already has ${MAX_ELEMENT_PHOTOS} photos. Finish or start it over first.`);
  const photo = await addPhoto(draft, image);
  await saveDraft({ ...draft, step: 0, photos: [...draft.photos, photo] });
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

function sheetJob(modelId: string, input: ReturnType<typeof compositeInput>, prompt: string): Promise<string> {
  return startJob({ kind: "sheet", modelId, input: { model: input, characterIds: [], prompt } }).then((job) => job.id);
}

// The photos a model can take beside `others` more images. Qwen on the
// visitor's ComfyUI takes 3 in all, so it gets the first good photos.
function fitPhotos(modelId: string, photos: InlineImage[], others: number): InlineImage[] {
  const max = adapterFor(modelId).limits.maxRefImages;
  return max ? photos.slice(0, Math.max(1, max - others)) : photos;
}

export async function compositeInputFor(draft: WizardDraft, modelId: string): Promise<ReturnType<typeof compositeInput>> {
  const references = fitPhotos(modelId, await sheetReferences(draft), 0);
  return draft.path === "element" ? elementCompositeInput(draft.elementType ?? "prop", references) : compositeInput(references);
}

export async function startComposite(draft: WizardDraft, modelId: string): Promise<string> {
  return sheetJob(modelId, await compositeInputFor(draft, modelId), "Turnaround sheet");
}

// The model that drew the latest composite, which draws the views too.
async function compositeModel(draft: WizardDraft): Promise<string> {
  const job = await db.jobs.get(draft.compositeJobIds.at(-1) ?? "");
  if (!job) throw new Error("The turnaround sheet isn't ready yet.");
  return job.modelId;
}

export async function startView(draft: WizardDraft, view: SheetView): Promise<string> {
  const modelId = await compositeModel(draft);
  const composite = await toInlineImage(await requireJobImage(draft.compositeJobIds.at(-1), "turnaround sheet"));
  const references = fitPhotos(modelId, await sheetReferences(draft), 1);
  const input = draft.path === "element" ? elementViewInput(draft.elementType ?? "prop", view, references, composite) : viewInput(view, references, composite);
  return sheetJob(modelId, input, `Sheet view: ${view}`);
}

export async function startCandidates(description: string, modelId: string): Promise<string[]> {
  const input = candidateInput(description);
  const ids: string[] = [];
  for (let i = 0; i < CANDIDATE_COUNT; i++) ids.push(await sheetJob(modelId, { ...input, seed: Math.floor(Math.random() * 2 ** 31) }, "Candidate face"));
  return ids;
}

// ---- Identity ----

export async function referenceDescriptors(draft: WizardDraft): Promise<number[][]> {
  if (draft.path === "element") return [];
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

// The stock voice picked in the Describe step, as the file stores it.
function voiceOf(draft: WizardDraft): CharacterFile["voice"] {
  const picked = draft.path === "element" ? undefined : voice(draft.voiceId);
  return picked ? { provider: "elevenlabs", voiceId: picked.id, label: picked.label } : undefined;
}

export async function saveFromDraft(draft: WizardDraft): Promise<CharacterRecord> {
  const views = pickedViews(draft);
  if (!views) throw new Error("Pick a take for every view first.");
  const now = new Date().toISOString();
  const files = new Map<string, Blob>();

  const photos = draft.path === "text" ? [] : goodPhotos(draft);
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
    kind: draft.path === "element" ? "element" : "person",
    ...(draft.path === "element" ? { elementType: draft.elementType ?? "prop" } : {}),
    origin: draft.path === "text" ? "designed" : "photos",
    name: draft.name.trim(),
    description: draft.description.trim(),
    createdAt: now,
    updatedAt: now,
    photos: photoEntries,
    sheet: {
      composite: SHEET_PATHS.composite,
      views: { front: SHEET_PATHS.front, threeQuarter: SHEET_PATHS.threeQuarter, profile: SHEET_PATHS.profile, fullBody: SHEET_PATHS.fullBody },
      model: await compositeModel(draft),
    },
    ...(descriptors.length ? { identity: { descriptors, mean: meanDescriptor(descriptors), model: FACE_MODEL, threshold: CONSENT_MAX_DISTANCE } } : {}),
    ...(draft.consent ? { consent: draft.consent } : {}),
    ...(voiceOf(draft) ? { voice: voiceOf(draft) } : {}),
    tags: draft.tags,
  };
  const record = await saveCharacter({ file, files }, { locked: isLocked(file) });
  await clearDraft(draft.path);
  return record;
}
