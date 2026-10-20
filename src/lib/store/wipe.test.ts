import { describe, expect, it } from "vitest";
import Dexie from "dexie";
import { db } from "./db";
import { deleteAllData } from "./wipe";

describe("deleteAllData", () => {
  it("removes the whole database", async () => {
    await db.characters.put({ id: "c1", kind: "person", name: "Test", updatedAt: "2026-10-20", file: {} as never, blobIds: {}, locked: false });
    expect(await Dexie.exists(db.name)).toBe(true);
    await deleteAllData();
    expect(await Dexie.exists(db.name)).toBe(false);
  });
});
