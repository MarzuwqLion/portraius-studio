// Cast slots in a scene, like {lead}. Kept apart from the compiler so scripts
// (presets:check) can use it without loading the presets.
export const SLOT = /\{([a-z][a-z0-9_-]*)\}/gi;

// The slots a scene names, in order of first use.
export function slotsIn(scene: string): string[] {
  return [...new Set([...scene.matchAll(SLOT)].map((m) => m[1]!.toLowerCase()))];
}

export type ScenePiece = { text: string } | { slot: string };

// A scene as runs of text and slots, for the prompt editor's chips. Joining
// the pieces back ({slot} for a slot) gives the scene again.
export function scenePieces(scene: string): ScenePiece[] {
  const pieces: ScenePiece[] = [];
  let at = 0;
  for (const m of scene.matchAll(SLOT)) {
    if (m.index > at) pieces.push({ text: scene.slice(at, m.index) });
    pieces.push({ slot: m[1]!.toLowerCase() });
    at = m.index + m[0].length;
  }
  if (at < scene.length) pieces.push({ text: scene.slice(at) });
  return pieces;
}
