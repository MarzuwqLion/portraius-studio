// Element sheets (spec: Character vault, Elements). An outfit, prop or
// location drawn from 1 to 6 photos as a clean product-style set of views.
// Elements use the character file's own view slots, so each slot gets a label
// that fits the kind of element: an outfit's "profile" slot is its back.
import type { GenerateImageInput, ImageAspectRatio, InlineImage } from "@/lib/registry/inputs";
import type { SheetView } from "./sheet";

export type ElementType = "outfit" | "prop" | "location";

export const ELEMENT_TYPES: readonly ElementType[] = ["outfit", "prop", "location"];

export const ELEMENT_TYPE_LABEL: Record<ElementType, string> = { outfit: "Outfit", prop: "Prop", location: "Location" };

export const MIN_ELEMENT_PHOTOS = 1;
export const MAX_ELEMENT_PHOTOS = 6;

interface ViewSpec {
  label: string;
  shot: string;
  aspectRatio: ImageAspectRatio;
}

const VIEWS: Record<ElementType, Record<SheetView, ViewSpec>> = {
  outfit: {
    front: { label: "Front", shot: "the front view of the outfit on an invisible mannequin", aspectRatio: "3:4" },
    threeQuarter: { label: "Three-quarter", shot: "a three-quarter view of the outfit on an invisible mannequin", aspectRatio: "3:4" },
    profile: { label: "Back", shot: "the back view of the outfit on an invisible mannequin", aspectRatio: "3:4" },
    fullBody: { label: "Detail", shot: "a close-up of the outfit's fabric, stitching, fastenings and details", aspectRatio: "1:1" },
  },
  prop: {
    front: { label: "Front", shot: "the front view of the object", aspectRatio: "1:1" },
    threeQuarter: { label: "Three-quarter", shot: "a three-quarter view of the object", aspectRatio: "1:1" },
    profile: { label: "Side", shot: "the side view of the object", aspectRatio: "1:1" },
    fullBody: { label: "Detail", shot: "a close-up of the object's materials, surface and details", aspectRatio: "1:1" },
  },
  location: {
    front: { label: "Wide", shot: "a wide establishing view of the location", aspectRatio: "16:9" },
    threeQuarter: { label: "Reverse angle", shot: "the reverse angle of the location, looking back the other way", aspectRatio: "16:9" },
    profile: { label: "Side angle", shot: "a side angle of the location", aspectRatio: "16:9" },
    fullBody: { label: "Detail", shot: "a close-up of one characteristic detail of the location", aspectRatio: "1:1" },
  },
};

export function elementViewLabel(type: ElementType, view: SheetView): string {
  return VIEWS[type][view].label;
}

export function elementViewAspect(type: ElementType, view: SheetView): string {
  return VIEWS[type][view].aspectRatio.replace(":", " / ");
}

const NOUN: Record<ElementType, string> = { outfit: "outfit", prop: "object", location: "location" };

const KEEP: Record<ElementType, string> = {
  outfit: "Keep its exact cut, colours, fabrics, textures, patterns, fastenings and every detail.",
  prop: "Keep its exact shape, proportions, colours, materials, textures and every detail.",
  location: "Keep its exact layout, architecture, furniture, materials, colours and light.",
};

const SETTING: Record<ElementType, string> = {
  outfit: "Plain mid-grey studio background, soft even lighting. The clothes are shown on an invisible mannequin, with no person wearing them.",
  prop: "Plain mid-grey studio background, soft even lighting, like a product photograph.",
  location: "Even, natural light that shows the space clearly. The location is empty.",
};

// The contest bans unlicensed IP, so every element prompt leaves out logos and
// brand names. Asking to "leave out any logo, brand name, mascot or trademarked
// design" got every single view refused as a policy violation (M6 notes).
const CLEAN = "Do not add, remove or redesign anything.\nNo people, no logos or brand names, no text, labels, borders or watermarks.";

export function elementSheetPrompt(type: ElementType): string {
  const v = VIEWS[type];
  const panels = (["front", "threeQuarter", "profile", "fullBody"] as const).map((view) => v[view].shot).join("; ");
  return `Create a clean reference sheet of the ${NOUN[type]} shown in the attached photos.
${KEEP[type]}
Layout: one 16:9 image. ${SETTING[type]}
Panels left to right: ${panels}.
${CLEAN}`;
}

export function elementViewPrompt(type: ElementType, view: SheetView): string {
  return `Draw ${VIEWS[type][view].shot}, the same ${NOUN[type]} shown in the attached photos and reference sheet.
${KEEP[type]}
${SETTING[type]}
One photograph only. ${CLEAN}`;
}

export function elementCompositeInput(type: ElementType, photos: readonly InlineImage[]): GenerateImageInput {
  if (!photos.length) throw new RangeError("An element needs at least one photo.");
  return { prompt: elementSheetPrompt(type), references: [...photos], aspectRatio: "16:9", size: "2K", quality: "best" };
}

export function elementViewInput(type: ElementType, view: SheetView, photos: readonly InlineImage[], composite: InlineImage): GenerateImageInput {
  return { prompt: elementViewPrompt(type, view), references: [...photos, composite], aspectRatio: VIEWS[type][view].aspectRatio, size: "2K", quality: "best" };
}
