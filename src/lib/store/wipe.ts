// "Delete all data" (spec: Security, biometric data row): removes the whole
// IndexedDB database (characters with their face data and consent clips, the
// library, jobs, drafts, settings and any remembered key) and the browser's
// caches for this site. The page reloads afterwards.
import Dexie from "dexie";
import { db } from "./db";

export async function deleteAllData(): Promise<void> {
  db.close();
  await Dexie.delete(db.name);
  if (typeof caches !== "undefined") {
    for (const name of await caches.keys()) await caches.delete(name);
  }
}
