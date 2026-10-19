import { DEFAULT_SETTINGS, type Settings } from "@/lib/types/records";
import { db } from "./db";

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get("app")) ?? DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<Omit<Settings, "id">>): Promise<Settings> {
  return db.transaction("rw", db.settings, async () => {
    const next: Settings = { ...(await getSettings()), ...patch, id: "app" };
    await db.settings.put(next);
    return next;
  });
}
