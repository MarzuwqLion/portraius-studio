// Turnaround sheets (spec: Character vault, Turnaround sheet and Design from
// text). Builds the Nano Banana 2.1 inputs; the runner sends them.
import type { GenerateImageInput, ImageAspectRatio, InlineImage } from "@/lib/registry/inputs";
import type { Appearance } from "@/lib/types/records";
import { elementViewAspect, elementViewLabel, type ElementType } from "./element-sheet";

export type SheetView = "front" | "threeQuarter" | "profile" | "fullBody";

export const SHEET_VIEWS: readonly SheetView[] = ["front", "threeQuarter", "profile", "fullBody"];

// Paths inside a .portraius file (spec: Character file layout).
export const SHEET_PATHS = {
  composite: "sheet/turnaround.png",
  front: "sheet/front.png",
  threeQuarter: "sheet/three-quarter.png",
  profile: "sheet/profile.png",
  fullBody: "sheet/full-body.png",
} as const satisfies Record<SheetView | "composite", string>;

export const VIEW_LABEL: Record<SheetView, string> = {
  front: "Front",
  threeQuarter: "Three-quarter",
  profile: "Profile",
  fullBody: "Full body",
};

// A view's label and CSS aspect ratio: a person's, or an element type's.
export function viewLabel(view: SheetView, elementType?: ElementType): string {
  return elementType ? elementViewLabel(elementType, view) : VIEW_LABEL[view];
}

export function viewAspect(view: SheetView, elementType?: ElementType): string {
  return elementType ? elementViewAspect(elementType, view) : view === "fullBody" ? "9 / 16" : "4 / 5";
}

// Every image is scored, but profiles score low by design (spec: Where scoring
// is skipped), so a low profile score is never flagged for a redraw.
export const FLAGGED_VIEWS: readonly SheetView[] = ["front", "threeQuarter", "fullBody"];

// Real or animated (the create wizard's toggle). Real is the default and
// keeps the photographic wording; an animated character's prompts never ask
// for a photograph or skin texture, and every view keeps the art style.
export interface SheetLook {
  appearance?: Appearance;
  artStyle?: string;  // "Studio Ghibli-style hand-drawn anime"; animated only
}

const isAnimated = (look: SheetLook) => look.appearance === "animated";

// The art style an animated prompt names: the user's words, or the images'.
function styleOf(look: SheetLook): string {
  const style = look.artStyle?.trim().replace(/[.\s]+$/, "");
  return style ? `the same art style (${style})` : "the same art style";
}

const IDENTITY_RULES =
  "Keep their exact facial structure, skin tone and texture, hairline, hair, eye shape, and any\n" +
  "marks or features. Do not beautify, slim, smooth the skin or change their age.";

function animatedRules(look: SheetLook): string {
  return `Keep their exact character design: face shape, eye shape and colour, hair, colours, proportions, and any
marks or features. Draw them in ${styleOf(look)}, with the same line work, colouring and shading. Never photoreal.`;
}

export const SHEET_PROMPT = `Create a character reference sheet of the same person shown in the attached photos.
${IDENTITY_RULES}
Layout: one 16:9 image, plain mid-grey studio background, soft even front lighting, natural
skin texture with visible pores.
Panels left to right: front head-and-shoulders, three-quarter left, left profile, full body
standing front-facing in simple neutral clothing, and a strip of four expressions (neutral,
smile, surprised, serious).
No text, labels, borders or watermarks.`;

// From photos, the animated sheet turns the person into a drawn character;
// from a picked face, it keeps the face's own drawing.
function animatedSheetPrompt(look: SheetLook, fromPhotos: boolean): string {
  const who = fromPhotos
    ? `the person shown in the attached photos, drawn as an animated character in ${styleOf(look)}, keeping their likeness`
    : "the same character shown in the attached image";
  return `Create a character reference sheet of ${who}.
${animatedRules(look)}
Layout: one 16:9 illustration, plain mid-grey background, soft even lighting.
Panels left to right: front head-and-shoulders, three-quarter left, left profile, full body
standing front-facing in simple neutral clothing, and a strip of four expressions (neutral,
smile, surprised, serious).
No text, labels, borders or watermarks.`;
}

export function sheetPrompt(look: SheetLook = {}, fromPhotos = true): string {
  return isAnimated(look) ? animatedSheetPrompt(look, fromPhotos) : SHEET_PROMPT;
}

const VIEW_SHOT: Record<SheetView, { shot: string; aspectRatio: ImageAspectRatio }> = {
  front: { shot: "a front-facing head-and-shoulders portrait, looking straight into the camera", aspectRatio: "4:5" },
  threeQuarter: { shot: "a three-quarter head-and-shoulders portrait, head turned to their left", aspectRatio: "4:5" },
  profile: { shot: "a left profile head-and-shoulders portrait, facing fully to their left", aspectRatio: "4:5" },
  fullBody: { shot: "a full-body portrait, standing front-facing in simple neutral clothing, head to feet in frame", aspectRatio: "9:16" },
};

export function viewPrompt(view: SheetView, look: SheetLook = {}): string {
  if (isAnimated(look)) {
    return `Draw ${VIEW_SHOT[view].shot}, of the same character shown in the attached reference sheet.
The attached images show who they are and how they are drawn; take the pose and angle from this prompt, not from them.
${animatedRules(look)}
Plain mid-grey background, soft even lighting.
One illustration only, not a photograph. No text, labels, borders or watermarks.`;
  }
  return `Draw ${VIEW_SHOT[view].shot}, of the same person shown in the attached photos and reference sheet.
${IDENTITY_RULES}
Plain mid-grey studio background, soft even front lighting, natural skin texture with visible pores.
One photograph only. No text, labels, borders or watermarks.`;
}

// One call with every photo (or the picked face) draws the 16:9 composite at 2K.
export function compositeInput(photos: readonly InlineImage[], look: SheetLook = {}, fromPhotos = true): GenerateImageInput {
  if (!photos.length) throw new RangeError("A sheet needs at least one photo.");
  return { prompt: sheetPrompt(look, fromPhotos), references: [...photos], aspectRatio: "16:9", size: "2K", quality: "best" };
}

// Each single view uses the photos plus the composite.
export function viewInput(view: SheetView, photos: readonly InlineImage[], composite: InlineImage, look: SheetLook = {}): GenerateImageInput {
  return { prompt: viewPrompt(view, look), references: [...photos, composite], aspectRatio: VIEW_SHOT[view].aspectRatio, size: "2K", quality: "best" };
}

export const CANDIDATE_COUNT = 4;

// Design from text: one candidate face per call, so the four differ.
export function candidatePrompt(description: string, look: SheetLook = {}): string {
  if (isAnimated(look)) {
    const style = look.artStyle?.trim() ? ` Art style: ${look.artStyle.trim().replace(/[.\s]+$/, "")}.` : " Follow any art style the description names.";
    return `An illustration of an original, fictional animated character: ${description.trim()}${style}
Front-facing head-and-shoulders portrait, neutral expression, looking at the viewer.
Plain mid-grey background, soft even lighting.
Not a photograph, and not an existing or famous character. No text, labels, borders or watermarks.`;
  }
  return `A photograph of an original, fictional adult person: ${description.trim()}
Front-facing head-and-shoulders portrait, neutral expression, looking into the camera.
Plain mid-grey studio background, soft even front lighting, natural skin texture with visible pores.
Not a real or famous person. No text, labels, borders or watermarks.`;
}

export function candidateInput(description: string, look: SheetLook = {}): GenerateImageInput {
  if (description.trim().length < 10) throw new RangeError(isAnimated(look) ? "Describe the character in a few more words." : "Describe the person in a few more words.");
  return { prompt: candidatePrompt(description, look), references: [], aspectRatio: "4:5", size: "1K", quality: "fast" };
}
