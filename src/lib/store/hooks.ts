import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { DEFAULT_SETTINGS, type CharacterRecord, type Generation, type Settings } from "@/lib/types/records";
import { db } from "./db";

export type VisibleSettings = Omit<Settings, "rememberedKey">;

// Never hands the remembered key to React.
export function useSettings(): VisibleSettings {
  const settings = useLiveQuery(async () => {
    const row = await db.settings.get("app");
    if (!row) return DEFAULT_SETTINGS;
    const { rememberedKey: _omit, ...visible } = row;
    return visible;
  }, []);
  return settings ?? DEFAULT_SETTINGS;
}

export function useCharacterCount(): number | undefined {
  return useLiveQuery(() => db.characters.count(), []);
}

// Characters newest first. undefined while loading.
export function useCharacters(): CharacterRecord[] | undefined {
  return useLiveQuery(() => db.characters.orderBy("updatedAt").reverse().toArray(), []);
}

// null once loaded and missing.
export function useCharacter(id: string | undefined): CharacterRecord | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.characters.get(id)) ?? null) : null), [id]);
}

// An object URL for a stored blob, revoked when the blob or component goes away.
export function useBlobUrl(blobId: string | undefined): string | undefined {
  const blob = useLiveQuery(async () => (blobId ? (await db.blobs.get(blobId))?.blob : undefined), [blobId]);
  return useObjectUrl(blob);
}

export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

export function useGeneration(id: string | undefined): Generation | undefined {
  return useLiveQuery(async () => (id ? db.generations.get(id) : undefined), [id]);
}

// Every character's thumbnail as an object URL, by character ID: the faces on
// prompt chips and in the @ menu. URLs are revoked when the set changes.
export function useCharacterThumbs(): ReadonlyMap<string, string> {
  const blobs = useLiveQuery(async () => {
    const records = await db.characters.toArray();
    // "thumb.jpg" is THUMB in lib/characters/format.ts, kept literal so the store stays below it.
    const rows = await db.blobs.bulkGet(records.map((r) => r.blobIds["thumb.jpg"] ?? ""));
    return records.flatMap((r, i) => (rows[i] ? [[r.id, rows[i].blob] as const] : []));
  }, []);
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    const next = new Map((blobs ?? []).map(([id, blob]) => [id, URL.createObjectURL(blob)] as const));
    setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [blobs]);
  return urls;
}
