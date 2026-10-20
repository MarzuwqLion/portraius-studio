// An unfinished create wizard, kept in IndexedDB so it resumes after a reload
// (Contracts: #/characters/new). The Contracts schema has no table for drafts,
// so the draft is a JSON blob in the blobs table, beside its photos.
import { db } from "@/lib/store/db";
import type { ConsentRecord } from "@/lib/types/records";
import type { ElementType } from "./element-sheet";
import type { SheetView } from "./sheet";

// A person from photos, a person designed from text, or an element (an
// outfit, prop or location) from photos.
export type CreatePath = "photos" | "text" | "element";

export type PhotoQuality = "good" | "no-face" | "several-faces" | "small-face" | "blurry";

export interface DraftPhoto {
  blobId: string;
  width: number;
  height: number;
  quality: PhotoQuality;
  descriptor?: number[];
}

export interface WizardDraft {
  id: string;                    // the character's ID once saved
  path: CreatePath;
  step: number;
  elementType?: ElementType;     // element path only
  photos: DraftPhoto[];
  consent?: ConsentRecord;
  consentClipBlobId?: string;
  consentFailures: number;
  personDescription: string;     // design from text: what the candidates are drawn from
  candidateJobIds: string[];
  pickedCandidateJobId?: string;
  candidateDescriptor?: number[];  // the picked face: a designed character's identity reference
  compositeJobIds: string[];     // every take of the composite; the last is current
  viewJobIds: Record<SheetView, string[]>;
  pickedViewJobIds: Partial<Record<SheetView, string>>;
  scores: Record<string, number | null>;  // identity score per finished take (job ID); null when no face was found
  name: string;
  description: string;
  tags: string[];
  updatedAt: number;
}

const draftId = (path: CreatePath) => `wizard:${path}`;
export const draftBlobId = (path: CreatePath, name: string) => `wizard:${path}:${name}`;

export function newDraft(path: CreatePath): WizardDraft {
  return {
    id: crypto.randomUUID(),
    path,
    step: 0,
    ...(path === "element" ? { elementType: "outfit" as const } : {}),
    photos: [],
    consentFailures: 0,
    personDescription: "",
    candidateJobIds: [],
    compositeJobIds: [],
    viewJobIds: { front: [], threeQuarter: [], profile: [], fullBody: [] },
    pickedViewJobIds: {},
    scores: {},
    name: "",
    description: "",
    tags: [],
    updatedAt: Date.now(),
  };
}

export async function loadDraft(path: CreatePath): Promise<WizardDraft | undefined> {
  const row = await db.blobs.get(draftId(path));
  if (!row) return undefined;
  try {
    return JSON.parse(await row.blob.text()) as WizardDraft;
  } catch {
    return undefined;
  }
}

export async function saveDraft(draft: WizardDraft): Promise<WizardDraft> {
  const next = { ...draft, updatedAt: Date.now() };
  const blob = new Blob([JSON.stringify(next)], { type: "application/json" });
  await db.blobs.put({ id: draftId(draft.path), blob, mime: blob.type, bytes: blob.size });
  return next;
}

export async function putDraftBlob(path: CreatePath, name: string, blob: Blob): Promise<string> {
  const id = draftBlobId(path, name);
  await db.blobs.put({ id, blob, mime: blob.type, bytes: blob.size });
  return id;
}

// Removes the draft and every blob it stored (photos, consent clip).
export async function clearDraft(path: CreatePath): Promise<void> {
  const prefix = `${draftId(path)}`;
  await db.blobs.where("id").startsWith(prefix).delete();
}

export async function deleteDraftBlob(id: string): Promise<void> {
  if (id.startsWith("wizard:")) await db.blobs.delete(id);
}
