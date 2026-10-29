// A character or element from the visitor's own reference image: a character
// sheet, concept art, a location painting (Decisions, October 29). The image is
// kept exactly as given and is the character's sheet; no sheet is drawn. It's a
// designed character, never a real person's photo: the screen asks the visitor
// to say so, and a person from photos still goes through the webcam check.
import { FACE_MODEL, detectFaces } from "@/lib/identity/embed";
import { CONSENT_MAX_DISTANCE, meanDescriptor } from "@/lib/identity/score";
import { drawToCanvas, makeThumb, prepareImage } from "@/lib/media/image-prep";
import { saveCharacter } from "@/lib/store/characters";
import type { Appearance, CharacterFile, CharacterRecord } from "@/lib/types/records";
import type { ElementType } from "./element-sheet";
import { THUMB } from "./format";

// sheet.model for a sheet the visitor supplied rather than one a model drew.
export const SHEET_UPLOAD = "upload";
export const REFERENCE_PATH = "sheet/reference.jpg";

export const isFromReference = (file: Pick<CharacterFile, "sheet">) => file.sheet.model === SHEET_UPLOAD;

// Face data from a reference sheet's faces (its face studies and views), so
// takes of a real-looking character are scored like any other. Several faces
// of one person; at most this many keep the file small.
const MAX_DESCRIPTORS = 8;

export interface ReferenceInput {
  kind: "person" | "element";
  elementType?: ElementType;
  appearance?: Appearance;   // person only
  artStyle?: string;         // animated only
  name: string;
  description: string;
  image: Blob;
}

// A square portrait around the largest face, or the whole image when there's none.
async function thumbFrom(image: Blob, face: { x: number; y: number; width: number; height: number } | undefined): Promise<Blob> {
  if (!face) return makeThumb(image);
  const source = await drawToCanvas(image);
  const side = Math.min(Math.max(face.width, face.height) * 2.2, source.width, source.height);
  const x = Math.min(Math.max(0, face.x + face.width / 2 - side / 2), source.width - side);
  const y = Math.min(Math.max(0, face.y + face.height / 2 - side / 2), source.height - side);
  const crop = document.createElement("canvas");
  crop.width = crop.height = Math.round(side);
  crop.getContext("2d")!.drawImage(source, x, y, side, side, 0, 0, side, side);
  const blob = await new Promise<Blob | null>((resolve) => crop.toBlob(resolve, "image/jpeg", 0.9));
  return makeThumb(blob ?? image);
}

export async function saveFromReference(input: ReferenceInput): Promise<CharacterRecord> {
  const name = input.name.trim();
  if (!name) throw new Error("Give it a name.");
  const { blob: sheet } = await prepareImage(input.image);
  const person = input.kind === "person";
  const animated = person && input.appearance === "animated";
  const faces = person ? await detectFaces(await drawToCanvas(sheet), 60).catch(() => []) : [];
  // face-api is trained on photos: a drawn face's distances mean nothing (Decisions, October 26).
  const descriptors = animated ? [] : faces.slice(0, MAX_DESCRIPTORS).map((f) => f.descriptor);
  const now = new Date().toISOString();
  const files = new Map<string, Blob>([
    [REFERENCE_PATH, sheet],
    [THUMB, await thumbFrom(sheet, faces[0]?.box)],
  ]);
  const file: CharacterFile = {
    format: "portraius.character",
    version: 1,
    id: crypto.randomUUID(),
    kind: input.kind,
    ...(person ? {} : { elementType: input.elementType ?? "prop" }),
    origin: "designed",
    name,
    description: input.description.trim(),
    ...(person ? { appearance: animated ? ("animated" as const) : ("real" as const) } : {}),
    ...(animated && input.artStyle?.trim() ? { artStyle: input.artStyle.trim() } : {}),
    createdAt: now,
    updatedAt: now,
    photos: [],
    // One image stands for the sheet and every view.
    sheet: {
      composite: REFERENCE_PATH,
      views: { front: REFERENCE_PATH, threeQuarter: REFERENCE_PATH, profile: REFERENCE_PATH, fullBody: REFERENCE_PATH },
      model: SHEET_UPLOAD,
    },
    ...(descriptors.length ? { identity: { descriptors, mean: meanDescriptor(descriptors), model: FACE_MODEL, threshold: CONSENT_MAX_DISTANCE } } : {}),
    tags: [],
  };
  return saveCharacter({ file, files }, { locked: false });
}
