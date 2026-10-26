// .portraius files (spec: Data model, Character file layout; Character vault,
// Import and export). A zip holding character.json, the photos and sheet, the
// face descriptors and the consent record. In the app the character carries
// identity and consent inline; in the file they live in their own folders.
import JSZip from "jszip";
import { z } from "zod";
import { sniffMime } from "@/lib/media/mime";
import type { CharacterBundle, CharacterFile, ConsentRecord } from "@/lib/types/records";

export const CHARACTER_JSON = "character.json";
export const FACE_JSON = "identity/face.json";
export const CONSENT_JSON = "consent/consent.json";
export const CONSENT_CLIP = "consent/check.webm";
export const THUMB = "thumb.jpg";

const MAX_ZIP_BYTES = 200 * 1024 * 1024;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_ENTRIES = 40;

// Every path a .portraius file may hold, with the type its bytes must have.
const PATHS: { pattern: RegExp; mime: string[] }[] = [
  { pattern: /^photos\/\d{3}\.jpg$/, mime: ["image/jpeg"] },
  { pattern: /^sheet\/(turnaround|front|three-quarter|profile|full-body|expressions)\.png$/, mime: ["image/png", "image/jpeg", "image/webp"] },
  { pattern: /^thumb\.jpg$/, mime: ["image/jpeg"] },
  { pattern: /^consent\/check\.webm$/, mime: ["video/webm"] },
];

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "not a date");
const path = z.string().max(80);

const characterJson = z.object({
  format: z.literal("portraius.character"),
  version: z.literal(1),
  id: z.string().min(8).max(64),
  kind: z.enum(["person", "element"]),
  origin: z.enum(["photos", "designed"]),
  elementType: z.enum(["outfit", "prop", "location", "style"]).optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(2000),
  appearance: z.enum(["real", "animated"]).optional(),
  artStyle: z.string().max(200).optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
  photos: z.array(z.object({ path, width: z.number().int().positive(), height: z.number().int().positive() })).max(10),
  sheet: z.object({
    composite: path,
    views: z.object({ front: path, threeQuarter: path, profile: path, fullBody: path, expressions: path.optional() }),
    model: z.string().max(120),
  }),
  voice: z.object({ provider: z.literal("elevenlabs"), voiceId: z.string().max(80), label: z.string().max(80) }).optional(),
  tags: z.array(z.string().max(40)).max(20),
});

const descriptor = z.array(z.number().finite()).length(128);
const faceJson = z.object({
  descriptors: z.array(descriptor).min(1).max(20),
  mean: descriptor,
  model: z.string().max(80),
  threshold: z.number().positive(),
});

const consentJson = z.object({
  subjectName: z.string().trim().min(1).max(120),
  method: z.literal("self-check"),
  statement: z.string().min(1).max(500),
  acceptedAt: isoDate,
  challenge: z.array(z.string().max(40)).max(5),
  checkClip: z.literal(CONSENT_CLIP).optional(),
  matchScore: z.number().min(0).max(100),
  appVersion: z.string().max(40),
});

export type { CharacterBundle };

export interface ImportSummary {
  name: string;
  kind: CharacterFile["kind"];
  origin: CharacterFile["origin"];
  consentAt?: string;
  consentMethod?: ConsentRecord["method"];
  // A photo-based person with no consent record can be viewed but never used.
  locked: boolean;
}

export class CharacterFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CharacterFileError";
  }
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

// The paths a character's files must include.
export function referencedPaths(file: CharacterFile): string[] {
  const { views } = file.sheet;
  return [
    ...file.photos.map((p) => p.path),
    file.sheet.composite,
    views.front,
    views.threeQuarter,
    views.profile,
    views.fullBody,
    ...(views.expressions ? [views.expressions] : []),
  ];
}

export function isLocked(file: Pick<CharacterFile, "kind" | "origin" | "consent">): boolean {
  return file.kind === "person" && file.origin === "photos" && !file.consent;
}

export async function exportCharacter(bundle: CharacterBundle, options: { includeClip: boolean }): Promise<Blob> {
  const { identity, consent, ...rest } = bundle.file;
  const zip = new JSZip();
  // Fixed dates keep two exports of the same character identical.
  const date = new Date(bundle.file.updatedAt);
  // Written through the import schemas, so keys always come out in one order
  // and an import followed by an export gives the same bytes.
  zip.file(CHARACTER_JSON, json(characterJson.parse(rest)), { date });
  if (identity) zip.file(FACE_JSON, json(faceJson.parse(identity)), { date });
  const clip = bundle.files.get(CONSENT_CLIP);
  const keepClip = Boolean(options.includeClip && clip && consent?.checkClip);
  if (consent) {
    const { checkClip: _dropped, ...withoutClip } = consent;
    zip.file(CONSENT_JSON, json(consentJson.parse(keepClip ? consent : withoutClip)), { date });
  }
  for (const [path, blob] of bundle.files) {
    if (path === CONSENT_CLIP && !keepClip) continue;
    zip.file(path, blob, { date, binary: true });
  }
  return zip.generateAsync({ type: "blob", mimeType: "application/zip", compression: "STORE" });
}

async function readJson<T>(zip: JSZip, path: string, schema: z.ZodType<T>, required: boolean): Promise<T | undefined> {
  const entry = zip.file(path);
  if (!entry) {
    if (required) throw new CharacterFileError(`This file has no ${path}.`);
    return undefined;
  }
  let data: unknown;
  try {
    data = JSON.parse(await entry.async("string"));
  } catch {
    throw new CharacterFileError(`${path} isn't valid JSON.`);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new CharacterFileError(`${path} has a problem at ${issue?.path.join(".") || "the top level"}: ${issue?.message ?? "invalid"}.`);
  }
  return parsed.data;
}

export async function importCharacter(zipBlob: Blob): Promise<{ bundle: CharacterBundle; summary: ImportSummary }> {
  if (zipBlob.size > MAX_ZIP_BYTES) throw new CharacterFileError("Character files are capped at 200 MB.");
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBlob);
  } catch {
    throw new CharacterFileError("This isn't a .portraius file.");
  }
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  if (entries.length > MAX_ENTRIES) throw new CharacterFileError("This file holds more than a character should.");

  const base = await readJson(zip, CHARACTER_JSON, characterJson, true);
  const identity = await readJson(zip, FACE_JSON, faceJson, false);
  const consent = await readJson(zip, CONSENT_JSON, consentJson, false);
  if (base!.kind === "element" && (identity || consent)) throw new CharacterFileError("An element can't carry face data or consent.");

  const files = new Map<string, Blob>();
  for (const entry of entries) {
    if ([CHARACTER_JSON, FACE_JSON, CONSENT_JSON].includes(entry.name)) continue;
    const rule = PATHS.find((p) => p.pattern.test(entry.name));
    if (!rule) continue; // Unknown files are left out, never stored.
    const bytes = new Uint8Array(await entry.async("arraybuffer"));
    if (bytes.byteLength > MAX_FILE_BYTES) throw new CharacterFileError(`${entry.name} is too large.`);
    const mime = sniffMime(bytes.subarray(0, 16));
    if (!mime || !rule.mime.includes(mime)) throw new CharacterFileError(`${entry.name} isn't the kind of file its name says.`);
    files.set(entry.name, new Blob([bytes], { type: mime }));
  }

  const file: CharacterFile = { ...(base as CharacterFile), ...(identity ? { identity } : {}), ...(consent ? { consent } : {}) };
  const missing = referencedPaths(file).filter((p) => !files.has(p));
  if (missing.length) throw new CharacterFileError(`This file is missing ${missing.join(", ")}.`);
  if (consent?.checkClip && !files.has(CONSENT_CLIP)) delete file.consent!.checkClip;

  return {
    bundle: { file, files },
    summary: {
      name: file.name,
      kind: file.kind,
      origin: file.origin,
      ...(consent ? { consentAt: consent.acceptedAt, consentMethod: consent.method } : {}),
      locked: isLocked(file),
    },
  };
}
