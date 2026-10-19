import { useLiveQuery } from "dexie-react-hooks";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/types/records";
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
