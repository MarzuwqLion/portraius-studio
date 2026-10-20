import JSZip from "jszip";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/store/db";
import type { Generation } from "@/lib/types/records";
import { deleteGeneration, exportZip, fileName, libraryGenerations, matches } from "./library";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const gen = (fields: Partial<Generation>): Generation => ({
  id: "g-0000000001",
  type: "image",
  modelId: "vertexai/gemini-nano-banana-2.1",
  jobId: "job-1",
  characterIds: [],
  assets: [],
  createdAt: NOW - 1000,
  ...fields,
});

describe("matches", () => {
  it("filters by type, character, model, date and score band", () => {
    const g = gen({ type: "video", characterIds: ["walt"], modelId: "minimax/minimax-h3", identityScore: 72, createdAt: NOW - 2 * 86_400_000 });
    expect(matches(g, {}, NOW)).toBe(true);
    expect(matches(g, { type: "image" }, NOW)).toBe(false);
    expect(matches(g, { characterId: "walt" }, NOW)).toBe(true);
    expect(matches(g, { characterId: "ada" }, NOW)).toBe(false);
    expect(matches(g, { modelId: "minimax/minimax-h3" }, NOW)).toBe(true);
    expect(matches(g, { since: "day" }, NOW)).toBe(false);
    expect(matches(g, { since: "week" }, NOW)).toBe(true);
    expect(matches(g, { band: "check" }, NOW)).toBe(true);
    expect(matches(g, { band: "match" }, NOW)).toBe(false);
    expect(matches(gen({}), { band: "unscored" }, NOW)).toBe(true);
    expect(matches(g, { band: "unscored" }, NOW)).toBe(false);
  });
});

describe("library store", () => {
  beforeEach(async () => {
    await Promise.all([db.generations.clear(), db.blobs.clear(), db.jobs.clear(), db.characters.clear()]);
  });

  async function seed() {
    await db.blobs.bulkPut([
      { id: "b1", blob: new Blob(["png bytes"], { type: "image/png" }), mime: "image/png", bytes: 9 },
      { id: "b2", blob: new Blob(["mp4 bytes"], { type: "video/mp4" }), mime: "video/mp4", bytes: 9 },
      { id: "b3", blob: new Blob(["jpg bytes"], { type: "image/jpeg" }), mime: "image/jpeg", bytes: 9 },
      { id: "b4", blob: new Blob(["sheet"], { type: "image/png" }), mime: "image/png", bytes: 5 },
    ]);
    await db.jobs.bulkPut([
      { id: "job-img", kind: "image", status: "done", modelId: "m", idempotencyKey: "k", input: {}, generationIds: ["g-image"], createdAt: 1, updatedAt: 1 },
      { id: "job-vid", kind: "video", status: "done", modelId: "m", idempotencyKey: "k", input: {}, generationIds: ["g-video"], createdAt: 1, updatedAt: 1 },
      { id: "job-sheet", kind: "sheet", status: "done", modelId: "m", idempotencyKey: "k", input: {}, generationIds: ["g-sheet"], createdAt: 1, updatedAt: 1 },
    ]);
    await db.generations.bulkPut([
      gen({ id: "g-image", jobId: "job-img", assets: [{ blobId: "b1", kind: "image", mime: "image/png", bytes: 9 }], prompt: "a teapot", identityScore: 91, characterIds: ["walt"], createdAt: 3 }),
      gen({ id: "g-video", jobId: "job-vid", type: "video", assets: [{ blobId: "b2", kind: "video", mime: "video/mp4", bytes: 9 }, { blobId: "b3", kind: "frame", mime: "image/jpeg", bytes: 9 }], createdAt: 2 }),
      gen({ id: "g-sheet", jobId: "job-sheet", assets: [{ blobId: "b4", kind: "image", mime: "image/png", bytes: 5 }], createdAt: 1 }),
    ]);
  }

  it("lists results newest first and leaves out character sheet draws", async () => {
    await seed();
    expect((await libraryGenerations()).map((g) => g.id)).toEqual(["g-image", "g-video"]);
  });

  it("exports files and a manifest with names, never face data", async () => {
    await seed();
    await db.characters.put({ id: "walt", kind: "person", name: "Walt Harmon", updatedAt: "x", locked: false, blobIds: {}, file: {} as never });
    const zip = await JSZip.loadAsync(await exportZip(["g-image", "g-video"]));
    const names = Object.keys(zip.files).sort();
    expect(names).toHaveLength(4);
    expect(names).toContain("manifest.json");
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    expect(manifest.items[0]).toMatchObject({ prompt: "a teapot", characters: ["Walt Harmon"], identityScore: 91, model: "Nano Banana 2.1" });
    expect(JSON.stringify(manifest)).not.toContain("descriptor");
  });

  it("deletes an output with its files", async () => {
    await seed();
    await deleteGeneration("g-video");
    expect(await db.generations.get("g-video")).toBeUndefined();
    expect(await db.blobs.bulkGet(["b2", "b3"])).toEqual([undefined, undefined]);
  });

  it("names files by date, type and ID", () => {
    expect(fileName(gen({ createdAt: NOW }), 0, "image", "image/png")).toBe("2026-10-20-12-00-00-image-g-000000.png");
    expect(fileName(gen({ createdAt: NOW, type: "video" }), 1, "frame", "image/jpeg")).toBe("2026-10-20-12-00-00-video-g-000000-frame.jpg");
  });
});
