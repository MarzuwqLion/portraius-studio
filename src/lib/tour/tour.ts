// Tour mode (spec: UI and UX, Tour): pre-made outputs from public/samples/,
// played with no key and no model call. The manifest, tour.json, says what
// each sample is; it's regenerated when the sample character changes.
import { z } from "zod";
import { addImport, readImport } from "@/lib/characters/manage";
import { posterName } from "@/lib/media/poster";
import { listScenes, newScene, newShot, saveScene, type Scene, type Shot } from "@/lib/studio/director";
import { randomSeed } from "@/lib/studio/image";
import type { Launch } from "@/lib/studio/launch";

const file = z.string().regex(/^[a-z0-9][a-z0-9-]*\.(jpg|png|mp4)$/);
const size = { width: z.number().int().positive(), height: z.number().int().positive() };

const media = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("image"), src: file, alt: z.string(), ...size }),
  z.object({ kind: z.literal("video"), src: file, alt: z.string(), ...size }),
  z.object({ kind: z.literal("split"), original: file, recast: file, ...size }),
  z.object({ kind: z.literal("beforeAfter"), before: file, after: file, alt: z.string(), ...size }),
]);

const item = z.object({
  media,
  caption: z.string(),
  model: z.string().optional(),  // a label, never a model ID
  score: z.number().optional(),
  worst: z.number().optional(),
  before: z.number().optional(),
  after: z.number().optional(),
});

const tourJson = z.object({
  format: z.literal("portraius.tour"),
  version: z.literal(1),
  character: z.object({
    name: z.string(),
    origin: z.enum(["photos", "designed"]),
    description: z.string(),
    file: z.string().regex(/^[a-z0-9][a-z0-9-]*\.portraius$/),
    sheet: z.object({ src: file, ...size }),
    views: z.array(z.object({ label: z.string(), src: file, ...size })),
  }),
  sections: z.array(z.object({ id: z.string(), title: z.string(), body: z.string(), items: z.array(item) })),
});

export type Tour = z.infer<typeof tourJson>;

export function parseTour(data: unknown): Tour {
  return tourJson.parse(data);
}

export type TourItem = z.infer<typeof item>;

export const sampleUrl = (name: string) => `${import.meta.env.BASE_URL}samples/${name}`;

// A sample clip's first frame, beside it in public/samples/ (npm run posters).
export const samplePoster = (clip: string) => sampleUrl(posterName(clip));

export async function loadTour(): Promise<Tour> {
  const res = await fetch(sampleUrl("tour.json"));
  if (!res.ok) throw new Error("The samples didn't load. Reload the page to try again.");
  return parseTour(await res.json());
}

// Puts the sample character in the visitor's vault, so a first image needs
// only a key. One already there is left as it is.
export async function addSampleCharacter(tour: Tour): Promise<string> {
  const res = await fetch(sampleUrl(tour.character.file));
  if (!res.ok) throw new Error("The sample character didn't download. Try again.");
  const pending = await readImport(await res.blob());
  if (pending.replaces) return pending.bundle.file.id;
  return (await addImport(pending)).id;
}

// "Try this with Walt" (spec: Decisions, October 21, item 11): where each
// chapter sends the visitor, with Walt cast and the matching preset picked.
export interface TryTarget {
  to: "/image" | "/video" | "/recast" | "/director";
  presetId?: string;
  sampleClip?: boolean;
  scene?: boolean; // Director: the three-shot sample scene with Walt in it
}

export const TRY_WITH: Record<string, TryTarget> = {
  character: { to: "/image", presetId: "studio-headshot" },
  images: { to: "/image", presetId: "film-still" },
  realism: { to: "/image", presetId: "profile-photo" },
  video: { to: "/video", presetId: "night-walk" },
  recast: { to: "/recast", presetId: "swap-me-in", sampleClip: true },
  director: { to: "/director", scene: true },
  elements: { to: "/image", presetId: "editorial-cover" },
};

// The Letter's three shots, to direct again with your own key.
const SAMPLE_SHOTS: Pick<Shot, "action" | "size" | "lens" | "movement" | "durationSec">[] = [
  { action: "{lead} sits alone in a corner booth of a late-night diner, rain on the window", size: "WS", lens: "35mm", movement: "static", durationSec: 5 },
  { action: "{lead} slides an old envelope out of his coat and turns it over in his hands", size: "MCU", lens: "50mm", movement: "slow-push-in", durationSec: 5 },
  { action: "{lead} looks up toward the diner door and almost smiles", size: "CU", lens: "85mm", movement: "static", durationSec: 5 },
];

const SAMPLE_TITLE = "The Letter, again";

// The sample scene made before for this character, while none of its shots
// has a take: pressing "Try this with Walt" again opens it rather than
// making another (Decisions, October 21, U5, item 13).
export function untouchedSampleScene(scenes: readonly Scene[], characterId: string): Scene | undefined {
  return scenes.find((s) => s.title === SAMPLE_TITLE && s.cast.some((c) => c.characterId === characterId) && s.shots.every((shot) => !shot.takeJobId && !shot.finalJobId));
}

export async function startSampleScene(characterId: string): Promise<string> {
  const reuse = untouchedSampleScene(await listScenes(), characterId);
  if (reuse) return reuse.id;
  const scene = newScene(randomSeed());
  scene.title = SAMPLE_TITLE;
  scene.logline = "A retired harbour pilot finds a letter he never sent.";
  scene.location = "A late-night diner with red vinyl booths";
  scene.cast = [{ slot: "lead", characterId }];
  for (const s of SAMPLE_SHOTS) {
    scene.shots.push({ ...newShot(scene, scene.shots.at(-1)), ...s });
    scene.nextShot += 1;
  }
  return (await saveScene(scene)).id;
}

// Walt into the vault if he isn't there, then where to go and what to open with.
export async function tryWithWalt(tour: Tour, chapter: string): Promise<{ to: string; state?: Launch }> {
  const target = TRY_WITH[chapter] ?? { to: "/image" };
  const characterId = await addSampleCharacter(tour);
  if (target.scene) return { to: `/director/${await startSampleScene(characterId)}` };
  return {
    to: target.to,
    state: { cast: [{ slot: "lead", characterId }], ...(target.presetId ? { presetId: target.presetId } : {}), ...(target.sampleClip ? { sampleClip: true } : {}) },
  };
}
