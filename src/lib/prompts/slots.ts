// Cast slots in a scene, like {lead}. Kept apart from the compiler so scripts
// (presets:check) can use it without loading the presets.
export const SLOT = /\{([a-z][a-z0-9_-]*)\}/gi;

// The slots a scene names, in order of first use.
export function slotsIn(scene: string): string[] {
  return [...new Set([...scene.matchAll(SLOT)].map((m) => m[1]!.toLowerCase()))];
}
