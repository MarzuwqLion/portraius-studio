// Turnaround sheets (spec: Character vault, Turnaround sheet and Design from
// text). Builds the Nano Banana 2.1 inputs; the runner sends them.
import type { GenerateImageInput, ImageAspectRatio, InlineImage } from "@/lib/registry/inputs";
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

const IDENTITY_RULES =
  "Keep their exact facial structure, skin tone and texture, hairline, hair, eye shape, and any\n" +
  "marks or features. Do not beautify, slim, smooth the skin or change their age.";

export const SHEET_PROMPT = `Create a character reference sheet of the same person shown in the attached photos.
${IDENTITY_RULES}
Layout: one 16:9 image, plain mid-grey studio background, soft even front lighting, natural
skin texture with visible pores.
Panels left to right: front head-and-shoulders, three-quarter left, left profile, full body
standing front-facing in simple neutral clothing, and a strip of four expressions (neutral,
smile, surprised, serious).
No text, labels, borders or watermarks.`;

const VIEW_SHOT: Record<SheetView, { shot: string; aspectRatio: ImageAspectRatio }> = {
  front: { shot: "a front-facing head-and-shoulders portrait, looking straight into the camera", aspectRatio: "4:5" },
  threeQuarter: { shot: "a three-quarter head-and-shoulders portrait, head turned to their left", aspectRatio: "4:5" },
  profile: { shot: "a left profile head-and-shoulders portrait, facing fully to their left", aspectRatio: "4:5" },
  fullBody: { shot: "a full-body portrait, standing front-facing in simple neutral clothing, head to feet in frame", aspectRatio: "9:16" },
};

export function viewPrompt(view: SheetView): string {
  return `Draw ${VIEW_SHOT[view].shot}, of the same person shown in the attached photos and reference sheet.
${IDENTITY_RULES}
Plain mid-grey studio background, soft even front lighting, natural skin texture with visible pores.
One photograph only. No text, labels, borders or watermarks.`;
}

// One call with every photo draws the 16:9 composite at 2K.
export function compositeInput(photos: readonly InlineImage[]): GenerateImageInput {
  if (!photos.length) throw new RangeError("A sheet needs at least one photo.");
  return { prompt: SHEET_PROMPT, references: [...photos], aspectRatio: "16:9", size: "2K", quality: "best" };
}

// Each single view uses the photos plus the composite.
export function viewInput(view: SheetView, photos: readonly InlineImage[], composite: InlineImage): GenerateImageInput {
  return { prompt: viewPrompt(view), references: [...photos, composite], aspectRatio: VIEW_SHOT[view].aspectRatio, size: "2K", quality: "best" };
}

export const CANDIDATE_COUNT = 4;

// Design from text: one candidate face per call, so the four differ.
export function candidatePrompt(description: string): string {
  return `A photograph of an original, fictional adult person: ${description.trim()}
Front-facing head-and-shoulders portrait, neutral expression, looking into the camera.
Plain mid-grey studio background, soft even front lighting, natural skin texture with visible pores.
Not a real or famous person. No text, labels, borders or watermarks.`;
}

export function candidateInput(description: string): GenerateImageInput {
  if (description.trim().length < 10) throw new RangeError("Describe the person in a few more words.");
  return { prompt: candidatePrompt(description), references: [], aspectRatio: "4:5", size: "1K", quality: "fast" };
}
