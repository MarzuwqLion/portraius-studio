// Presets are bundled at build time from presets/ and validated on load, so a
// bad file fails the build and the tests rather than the app.
import { CAMERA_GROUPS, cameraFile, lookFile, presetFile, type CameraGroup, type CameraOption, type Look, type Preset } from "./schema";

const cameraModules = import.meta.glob("/presets/camera/*.json", { eager: true, import: "default" });
const lookModules = import.meta.glob("/presets/looks/*.json", { eager: true, import: "default" });
const recastModules = import.meta.glob("/presets/recast/*.json", { eager: true, import: "default" });
const imageModules = import.meta.glob("/presets/image/*.json", { eager: true, import: "default" });
const videoModules = import.meta.glob("/presets/video/*.json", { eager: true, import: "default" });

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

const byTitle = (a: Preset, b: Preset) => a.title.localeCompare(b.title);

export const RECAST_PRESETS: Preset[] = parseAll(recastModules, (d) => presetFile.parse(d));
export const IMAGE_PRESETS: Preset[] = parseAll(imageModules, (d) => presetFile.parse(d)).sort(byTitle);
export const VIDEO_PRESETS: Preset[] = parseAll(videoModules, (d) => presetFile.parse(d)).sort(byTitle);

// Preset IDs are unique across folders (presets:check enforces it).
export function preset(id: string | undefined): Preset | undefined {
  return id ? [...RECAST_PRESETS, ...IMAGE_PRESETS, ...VIDEO_PRESETS].find((p) => p.id === id) : undefined;
}
