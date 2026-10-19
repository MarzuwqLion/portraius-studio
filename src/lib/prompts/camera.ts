// Camera and look phrases for a prompt (spec: Director, Film and camera
// controls). The same presets drive Image, Video and Director.
import { cameraOption, look } from "@/lib/presets/load";
import type { CameraGroup } from "@/lib/presets/schema";

export type CameraSelection = Partial<Record<CameraGroup, string>> & { look?: string };

// Shot settings first, then the film-level ones.
const ORDER: CameraGroup[] = ["size", "angle", "lens", "aperture", "movement", "lighting", "body", "era", "genre", "pacing"];

export function cameraPhrases(selection: CameraSelection, modelId?: string): string[] {
  const phrases: string[] = [];
  for (const group of ORDER) {
    const option = cameraOption(group, selection[group]);
    const phrase = option ? ((modelId && option.overrides?.[modelId]) ?? option.phrase) : "";
    if (phrase) phrases.push(phrase);
  }
  const chosen = look(selection.look);
  if (chosen?.phrase) phrases.push(chosen.phrase);
  return phrases;
}

export function isStylised(selection: CameraSelection): boolean {
  return look(selection.look)?.stylised ?? false;
}
