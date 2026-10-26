import { beforeEach, describe, expect, it } from "vitest";
import { clearDraft, loadDraft, loadStartedDrafts, newDraft, putDraftBlob, saveDraft } from "@/lib/characters/draft";
import type { CharacterFile } from "@/lib/types/records";
import { blobIdFor, deleteCharacter, isUsable, loadBundle, saveCharacter } from "./characters";
import { db } from "./db";

const file: CharacterFile = {
  format: "portraius.character",
  version: 1,
  id: "char-1234-5678",
  kind: "person",
  origin: "designed",
  name: "Mara",
  description: "Rust corduroy jacket.",
  createdAt: "2026-10-20T10:00:00.000Z",
  updatedAt: "2026-10-20T10:00:00.000Z",
  photos: [],
  sheet: {
    composite: "sheet/turnaround.png",
    views: { front: "sheet/front.png", threeQuarter: "sheet/three-quarter.png", profile: "sheet/profile.png", fullBody: "sheet/full-body.png" },
    model: "vertexai/gemini-nano-banana-2.1",
  },
  tags: [],
};

const files = (tag: string) =>
  new Map<string, Blob>([
    ["sheet/turnaround.png", new Blob([`${tag} composite`], { type: "image/png" })],
    ["sheet/front.png", new Blob([`${tag} front`], { type: "image/png" })],
    ["thumb.jpg", new Blob([`${tag} thumb`], { type: "image/jpeg" })],
  ]);

beforeEach(async () => {
  await Promise.all([db.characters.clear(), db.blobs.clear()]);
});

describe("character store", () => {
  it("keeps bytes in the blobs table and only IDs on the record", async () => {
    const record = await saveCharacter({ file, files: files("v1") }, { locked: false });
    expect(record.blobIds["sheet/front.png"]).toBe(blobIdFor(file.id, "sheet/front.png"));
    expect(JSON.stringify(record)).not.toContain("v1 front");
    const bundle = await loadBundle(file.id);
    expect(await bundle!.files.get("sheet/front.png")!.text()).toBe("v1 front");
  });

  it("replaces an earlier version and drops files it no longer has", async () => {
    await saveCharacter({ file, files: files("v1") }, { locked: false });
    const next = files("v2");
    next.delete("thumb.jpg");
    await saveCharacter({ file: { ...file, name: "Mara B" }, files: next }, { locked: false });
    expect((await db.characters.get(file.id))!.name).toBe("Mara B");
    expect(await db.blobs.get(blobIdFor(file.id, "thumb.jpg"))).toBeUndefined();
    expect(await (await db.blobs.get(blobIdFor(file.id, "sheet/front.png")))!.blob.text()).toBe("v2 front");
  });

  it("deletes a character with its files", async () => {
    await saveCharacter({ file, files: files("v1") }, { locked: false });
    await deleteCharacter(file.id);
    expect(await db.characters.count()).toBe(0);
    expect(await db.blobs.count()).toBe(0);
  });

  it("never lets a locked import into a generation", () => {
    expect(isUsable({ locked: true })).toBe(false);
    expect(isUsable({ locked: false })).toBe(true);
  });
});

describe("wizard drafts", () => {
  it("resume from IndexedDB, and clearing removes their photos too", async () => {
    const draft = newDraft("photos");
    const blobId = await putDraftBlob("photos", "photo-1", new Blob(["jpeg bytes"], { type: "image/jpeg" }));
    await saveDraft({ ...draft, step: 2, photos: [{ blobId, width: 10, height: 10, quality: "good" }] });
    const resumed = await loadDraft("photos");
    expect(resumed).toMatchObject({ id: draft.id, step: 2, photos: [{ blobId, quality: "good" }] });
    expect(await loadDraft("text")).toBeUndefined();

    await clearDraft("photos");
    expect(await loadDraft("photos")).toBeUndefined();
    expect(await db.blobs.get(blobId)).toBeUndefined();
  });
});

describe("drafts in progress", () => {
  it("lists only started drafts, newest first, and drops one once it's cleared", async () => {
    await saveDraft({ ...newDraft("photos"), appearance: "animated" });
    expect(await loadStartedDrafts()).toEqual([]);

    await saveDraft({ ...newDraft("text"), personDescription: "A girl with a messy auburn braid" });
    await new Promise((r) => setTimeout(r, 5));
    await saveDraft({ ...newDraft("element"), name: "Rust jacket" });
    expect((await loadStartedDrafts()).map((d) => d.path)).toEqual(["element", "text"]);

    await clearDraft("element");
    expect((await loadStartedDrafts()).map((d) => d.path)).toEqual(["text"]);
  });
});
