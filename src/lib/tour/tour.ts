// Tour mode (spec: UI and UX, Tour): pre-made outputs from public/samples/,
// played with no key and no model call. The manifest, tour.json, says what
// each sample is; it's regenerated when the sample character changes.
import { z } from "zod";
import { addImport, readImport } from "@/lib/characters/manage";

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
