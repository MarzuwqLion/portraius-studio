// The library: every saved output, with filters, delete and zip export (spec:
// UI and UX, Library). Outputs are bytes in IndexedDB, never provider links,
// so they keep playing after Router's links expire.
import JSZip from "jszip";
import { band, type Band } from "@/lib/identity/score";
import { modelLabel } from "@/lib/registry/models";
import { db } from "@/lib/store/db";
import type { Generation } from "@/lib/types/records";

export interface LibraryFilter {
  type?: Generation["type"];
  characterId?: string;
  modelId?: string;
  band?: Band | "unscored";
  since?: "day" | "week";
}

const DAY = 24 * 60 * 60 * 1000;

export function matches(generation: Generation, filter: LibraryFilter, now = Date.now()): boolean {
  if (filter.type && generation.type !== filter.type) return false;
  if (filter.characterId && !generation.characterIds.includes(filter.characterId)) return false;
  if (filter.modelId && generation.modelId !== filter.modelId) return false;
  if (filter.since === "day" && generation.createdAt < now - DAY) return false;
  if (filter.since === "week" && generation.createdAt < now - 7 * DAY) return false;
  if (filter.band) {
    const scored = generation.identityScore !== undefined;
    if (filter.band === "unscored" ? scored : !scored || band(generation.identityScore!) !== filter.band) return false;
  }
  return true;
}

// Character sheet draws are working material, not results, so the library
// leaves them out (they live in the character).
export async function libraryGenerations(): Promise<Generation[]> {
  const jobs = await db.jobs.where("status").equals("done").toArray();
  const sheetJobs = new Set(jobs.filter((j) => j.kind === "sheet").map((j) => j.id));
  const all = await db.generations.orderBy("createdAt").reverse().toArray();
  return all.filter((g) => !sheetJobs.has(g.jobId));
}

export async function deleteGeneration(id: string): Promise<void> {
  await db.transaction("rw", db.generations, db.blobs, async () => {
    const generation = await db.generations.get(id);
    if (!generation) return;
    await db.blobs.bulkDelete(generation.assets.map((a) => a.blobId));
    await db.generations.delete(id);
  });
}

const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

export function fileName(generation: Generation, index: number, kind: string, mime: string): string {
  const date = new Date(generation.createdAt).toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `${date}-${generation.type}-${generation.id.slice(0, 8)}${index ? `-${kind}` : ""}.${EXTENSION[mime] ?? "bin"}`;
}

// Selected outputs as one zip, with a manifest of how each was made. No face
// data or consent goes in; characters appear by name only.
export async function exportZip(ids: string[]): Promise<Blob> {
  const zip = new JSZip();
  const manifest: unknown[] = [];
  const names = new Map((await db.characters.toArray()).map((c) => [c.id, c.name]));
  for (const id of ids) {
    const generation = await db.generations.get(id);
    if (!generation) continue;
    const files: string[] = [];
    for (const [i, asset] of generation.assets.entries()) {
      const row = await db.blobs.get(asset.blobId);
      if (!row) continue;
      const name = fileName(generation, i, asset.kind, asset.mime);
      zip.file(name, row.blob, { binary: true, date: new Date(generation.createdAt) });
      files.push(name);
    }
    manifest.push({
      files,
      type: generation.type,
      model: modelLabel(generation.modelId),
      prompt: generation.prompt ?? "",
      characters: generation.characterIds.map((c) => names.get(c) ?? "Deleted character"),
      identityScore: generation.identityScore ?? null,
      createdAt: new Date(generation.createdAt).toISOString(),
    });
  }
  zip.file("manifest.json", `${JSON.stringify({ format: "portraius.library-export", version: 1, items: manifest }, null, 2)}\n`);
  return zip.generateAsync({ type: "blob", mimeType: "application/zip", compression: "STORE" });
}

// Ask the browser not to evict the library (spec: Data model). Harmless to repeat.
export async function persistStorage(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function storageUse(): Promise<{ used: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { used: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}
