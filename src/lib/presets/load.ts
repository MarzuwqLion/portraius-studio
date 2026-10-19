// Presets are bundled at build time from presets/ and validated on load, so a
// bad file fails the build and the tests rather than the app.
import { CAMERA_GROUPS, cameraFile, lookFile, type CameraGroup, type CameraOption, type Look } from "./schema";

const cameraModules = import.meta.glob("/presets/camera/*.json", { eager: true, import: "default" });
const lookModules = import.meta.glob("/presets/looks/*.json", { eager: true, import: "default" });

function parseAll<T>(modules: Record<string, unknown>, parse: (data: unknown) => T): T[] {
  return Object.entries(modules).map(([path, data]) => {
    try {
      return parse(data);
    } catch (err) {
      throw new Error(`${path} isn't a valid preset: ${(err as Error).message}`);
    }
  });
}

const cameraFiles = parseAll(cameraModules, (d) => cameraFile.parse(d));

export const CAMERA: Record<CameraGroup, CameraOption[]> = Object.fromEntries(
  CAMERA_GROUPS.map((group) => [group, cameraFiles.find((f) => f.group === group)?.options ?? []]),
) as Record<CameraGroup, CameraOption[]>;

export const LOOKS: Look[] = parseAll(lookModules, (d) => lookFile.parse(d)).sort((a, b) => Number(a.stylised) - Number(b.stylised) || a.label.localeCompare(b.label));

export function cameraOption(group: CameraGroup, id: string | undefined): CameraOption | undefined {
  return id ? CAMERA[group].find((o) => o.id === id) : undefined;
}

export function look(id: string | undefined): Look | undefined {
  return id ? LOOKS.find((l) => l.id === id) : undefined;
}
