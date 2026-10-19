import Dexie, { type Table } from "dexie";
import type { Job } from "@/lib/types/jobs";
import type { BlobRecord, CharacterRecord, Generation, RecipeRecord, Settings } from "@/lib/types/records";

// Contracts: IndexedDB schema. Version 1 ships with M1 and is never edited
// afterwards: schema changes add this.version(n + 1) with an upgrade().
export class StudioDB extends Dexie {
  characters!: Table<CharacterRecord, string>;
  jobs!: Table<Job, string>;
  generations!: Table<Generation, string>;
  recipes!: Table<RecipeRecord, string>;
  blobs!: Table<BlobRecord, string>;
  settings!: Table<Settings, string>;

  constructor(name = "portraius-studio") {
    super(name);
    this.version(1).stores({
      characters: "id, kind, name, updatedAt",
      jobs: "id, status, modelId, createdAt, parentJobId",
      generations: "id, type, modelId, createdAt, *characterIds, recipeId, identityScore",
      recipes: "id, capability, source, updatedAt",
      blobs: "id",
      settings: "id",
    });
  }
}

export const db = new StudioDB();
