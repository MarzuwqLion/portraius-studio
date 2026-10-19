// Characters in IndexedDB. A record holds the CharacterFile and blob IDs; the
// bytes live in the blobs table, so the vault grid stays fast.
import type { BlobRecord, CharacterBundle, CharacterRecord } from "@/lib/types/records";
import { db } from "./db";

export function blobIdFor(characterId: string, path: string): string {
  return `character:${characterId}:${path}`;
}

// Writes a character and its files, replacing any earlier version and dropping
// files the new version no longer has.
export async function saveCharacter(bundle: CharacterBundle, options: { locked: boolean }): Promise<CharacterRecord> {
  const { file } = bundle;
  const blobIds: Record<string, string> = {};
  const blobs: BlobRecord[] = [];
  for (const [path, blob] of bundle.files) {
    const id = blobIdFor(file.id, path);
    blobIds[path] = id;
    blobs.push({ id, blob, mime: blob.type, bytes: blob.size });
  }
  const record: CharacterRecord = { id: file.id, kind: file.kind, name: file.name, updatedAt: file.updatedAt, file, blobIds, locked: options.locked };
  await db.transaction("rw", db.characters, db.blobs, async () => {
    const previous = await db.characters.get(file.id);
    const stale = Object.values(previous?.blobIds ?? {}).filter((id) => !Object.values(blobIds).includes(id));
    await db.blobs.bulkDelete(stale);
    await db.blobs.bulkPut(blobs);
    await db.characters.put(record);
  });
  return record;
}

export async function loadBundle(id: string): Promise<CharacterBundle | undefined> {
  const record = await db.characters.get(id);
  if (!record) return undefined;
  const paths = Object.keys(record.blobIds);
  const rows = await db.blobs.bulkGet(paths.map((path) => record.blobIds[path]!));
  const files = new Map<string, Blob>();
  rows.forEach((row, i) => {
    if (row) files.set(paths[i]!, row.blob);
  });
  return { file: record.file, files };
}

export async function deleteCharacter(id: string): Promise<void> {
  await db.transaction("rw", db.characters, db.blobs, async () => {
    const record = await db.characters.get(id);
    if (!record) return;
    await db.blobs.bulkDelete(Object.values(record.blobIds));
    await db.characters.delete(id);
  });
}

// A locked import can be viewed but never used in a generation (spec: Import
// and export). Generation screens check this before adding someone to a cast.
export function isUsable(record: Pick<CharacterRecord, "locked">): boolean {
  return !record.locked;
}
