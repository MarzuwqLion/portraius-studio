// Preset files (spec: Presets and recipes). Anyone can add one by pull request,
// so every file is validated here, at build time and by presets:check.
import { z } from "zod";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.-]{0,40}$/);
const phrase = z.string().max(300);

export const CAMERA_GROUPS = ["genre", "body", "era", "pacing", "size", "angle", "lens", "aperture", "movement", "lighting"] as const;
export type CameraGroup = (typeof CAMERA_GROUPS)[number];

export const cameraFile = z.object({
  format: z.literal("portraius.camera"),
  version: z.literal(1),
  group: z.enum(CAMERA_GROUPS),
  appliesTo: z.enum(["scene", "shot"]),
  options: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(40),
        phrase,
        // Per-model wording, keyed by registry model ID.
        overrides: z.record(z.string(), phrase).optional(),
      }),
    )
    .min(1),
});

export const lookFile = z.object({
  format: z.literal("portraius.look"),
  version: z.literal(1),
  id,
  label: z.string().min(1).max(40),
  phrase,
  // Stylised looks skip identity scoring (spec: Where scoring is skipped).
  stylised: z.boolean(),
});

export type CameraFile = z.infer<typeof cameraFile>;
export type CameraOption = CameraFile["options"][number];
export type Look = z.infer<typeof lookFile>;

// Recipes (spec: Recipe format): how something was made, never a face.
export const recipe = z.object({
  capability: z.string().max(40),
  model: z.string().max(80),
  slots: z.array(z.object({ slot: z.string().regex(/^[a-z][a-z0-9_-]*$/), kind: z.enum(["person", "element"]) })).max(7),
  prompt: z.string().min(1).max(2000),
  camera: z.record(z.string(), z.string()).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  seed: z.number().int().optional(),
});

export const presetFile = z.object({
  format: z.literal("portraius.preset"),
  version: z.literal(1),
  id,
  type: z.enum(["recast", "image", "video"]),
  title: z.string().min(1).max(60),
  author: z.string().min(1).max(60),
  license: z.string().max(20),
  thumbnail: z.string().max(80).optional(),
  recipe,
});

export type Recipe = z.infer<typeof recipe>;
export type Preset = z.infer<typeof presetFile>;
