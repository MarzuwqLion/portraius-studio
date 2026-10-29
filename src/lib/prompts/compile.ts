// The prompt compiler (spec: Image studio, Prompt compiler). Every model gets
// the same structure: reference legend, identity lock, scene, camera and look,
// realism.
import { cameraPhrases, isStylised, type CameraSelection } from "./camera";
import { SLOT, slotsIn } from "./slots";

export type ReferenceKind = "sheet" | "photo" | "front" | "fullBody";

export interface CastMember {
  slot: string; // "lead", written {lead} in the scene
  name: string;
  kind: "person" | "element";
  description?: string;
  // An animated person keeps their art style and never gets the realism line.
  appearance?: "real" | "animated";
  artStyle?: string;
  // The images sent for this member, in order.
  references: ReferenceKind[];
}

export interface PromptInput {
  scene: string;
  cast: CastMember[];
  camera: CameraSelection;
  modelId: string;
  // Image edit mode: the source image is sent first.
  editing?: boolean;
}

export const REALISM = "Natural skin texture with visible pores, real lens imperfections.";

export const role = (slot: string) => slot.toUpperCase();

const isAnimated = (member: CastMember) => member.kind === "person" && member.appearance === "animated";
const isRealPerson = (member: CastMember) => member.kind === "person" && member.appearance !== "animated";

function animatedLock(member: CastMember, images: string): string {
  const style = member.artStyle?.trim().replace(/[.\s]+$/, "");
  return `Keep ${role(member.slot)}'s exact character design, face, hair and colours from ${images}, drawn in the same art style${style ? ` (${style})` : ""}. Do not make them photoreal.`;
}

export { slotsIn };

function sentence(text: string): string {
  const t = text.trim();
  if (!t) return "";
  const capital = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}

function listImages(indexes: number[]): string {
  if (indexes.length === 1) return `image ${indexes[0]}`;
  return `images ${indexes.slice(0, -1).join(", ")} and ${indexes.at(-1)}`;
}

function legendLine(n: number, ref: ReferenceKind, member: CastMember, prefix: string): string {
  const who = role(member.slot);
  if (member.kind === "element") return `${prefix} ${n} is the ${who}.`;
  if (ref === "sheet") return `${prefix} ${n} is the reference sheet for ${who} (${member.name}).`;
  if (ref === "photo") return `${prefix} ${n} is a photo of ${who}.`;
  if (ref === "fullBody") return `${prefix} ${n} is a full-body portrait of ${who}.`;
  return `${prefix} ${n} is a front portrait of ${who}.`;
}

// Legend and identity lock for the cast, numbering images from `first`.
function castBlock(cast: CastMember[], first: number, prefix: string): { legend: string[]; locks: string[]; next: number } {
  let n = first;
  const legend: string[] = [];
  const locks: string[] = [];
  for (const member of cast) {
    const indexes: number[] = [];
    for (const ref of member.references) {
      legend.push(legendLine(n, ref, member, prefix));
      indexes.push(n++);
    }
    if (isAnimated(member) && indexes.length) {
      locks.push(animatedLock(member, listImages(indexes)));
    } else if (member.kind === "person" && indexes.length) {
      locks.push(`Keep ${role(member.slot)}'s exact face, skin tone, skin texture and hair from ${listImages(indexes)}. Do not beautify or change their age.`);
    }
  }
  return { legend, locks, next: n };
}

function descriptions(cast: CastMember[]): string[] {
  return cast.filter((m) => m.description?.trim()).map((m) => `${role(m.slot)}: ${sentence(m.description!)}`);
}

const FRAMING = ["size", "angle", "lens", "aperture", "movement"] as const;
const withoutFraming = (camera: CameraSelection): CameraSelection =>
  Object.fromEntries(Object.entries(camera).filter(([group]) => !(FRAMING as readonly string[]).includes(group)));

function cameraLine(input: PromptInput): string {
  return sentence(cameraPhrases(input.camera, input.modelId).join(", "));
}

export function compileImagePrompt(input: PromptInput): string {
  const legend: string[] = input.editing ? ["Image 1 is the image to edit."] : [];
  const cast = castBlock(input.cast, input.editing ? 2 : 1, "Image");
  return [
    [...legend, ...cast.legend].join(" "),
    cast.locks.join(" "),
    descriptions(input.cast).join(" "),
    sentence(input.scene.replace(SLOT, (_, slot: string) => role(slot))),
    cameraLine(input),
    // Skin and lens realism only where a real person can be in the shot, and
    // never beside an animated one.
    isStylised(input.camera) || input.cast.some(isAnimated) || !(input.editing || input.cast.some(isRealPerson)) ? "" : REALISM,
  ]
    .filter(Boolean)
    .join("\n");
}

// Kling one-take (Director): there's no prompt for the whole clip, only one
// per shot, 512 characters at most. So each shot names its own references
// (Kling's <<<image_n>>> tokens, numbered across the whole cast) ahead of the
// action; then the location and the camera phrases, each added only while
// the prompt still fits.
export interface OneTakeShot {
  scene: string;            // the action, with {slots}
  camera: CameraSelection;  // shot settings first, then the film's
}

export function compileOneTakeShots(input: { shots: OneTakeShot[]; cast: CastMember[]; location?: string; modelId: string; limit: number }): string[] {
  const tokens = new Map<string, number[]>();
  let n = 1;
  for (const member of input.cast) {
    const indexes = member.references.map(() => n++);
    tokens.set(member.slot.toLowerCase(), indexes);
  }
  const list = (indexes: number[]) => indexes.map((i) => `<<<image_${i}>>>`).join(" and ");
  const location = input.location?.trim() ? `Location: ${sentence(input.location)}` : "";

  return input.shots.map((shot, i) => {
    const named = new Set(slotsIn(shot.scene));
    const legend = input.cast
      .filter((m) => named.has(m.slot.toLowerCase()) && tokens.get(m.slot.toLowerCase())?.length)
      .map((m) => {
        const images = list(tokens.get(m.slot.toLowerCase())!);
        if (isAnimated(m)) return `${role(m.slot)} is the animated character in ${images}, with the same design and art style.`;
        return m.kind === "person" ? `${role(m.slot)} is the person in ${images}, with the same face and hair.` : `The ${role(m.slot)} is the one in ${images}.`;
      });
    const action = sentence(shot.scene.replace(SLOT, (_, slot: string) => role(slot)));
    let prompt = [...legend, action].join(" ");
    if (prompt.length > input.limit) throw new RangeError(`Shot ${i + 1} is too long for a one-take: keep each action under about ${input.limit - legend.join(" ").length - 1} characters.`);
    const extras = [location, ...cameraPhrases(shot.camera, input.modelId).map(sentence)].filter(Boolean);
    for (const extra of extras) {
      if (prompt.length + 1 + extra.length <= input.limit) prompt = `${prompt} ${extra}`;
    }
    return prompt;
  });
}

// Video: with reference images the cast gets the same legend and lock; with a
// first frame (or no cast) identity rides in the frame, so slots become names.
// A reference clip in Use references: a blockout or simple 3D render of the
// scene that sets the camera, timing and blocking, while the reference images
// set the look. The same rules as a hand-written blockout prompt.
export const REFERENCE_CLIP_RULES =
  "Reference video 1 is a rough version of this scene, a blockout or simple 3D render whose shapes stand in for the cast and the set. " +
  "Follow it exactly for the camera path and framing, the timing and order of every beat, where each figure is and how it moves, and any lighting changes; its length is the clip's length. " +
  "Take how everyone and everything looks from the reference images, never from the blockout's shapes: render a finished, detailed scene. " +
  "Add no shots, beats or camera moves the blockout doesn't have, and show no game interface, crosshair or on-screen text from it.";

export function compileVideoPrompt(input: PromptInput & { withReferences: boolean; referenceClip?: boolean }): string {
  if (input.withReferences && input.cast.length) {
    const cast = castBlock(input.cast, 1, "Reference image");
    return [
      cast.legend.join(" "),
      input.referenceClip ? REFERENCE_CLIP_RULES : "",
      cast.locks.join(" "),
      descriptions(input.cast).join(" "),
      sentence(input.scene.replace(SLOT, (_, slot: string) => role(slot))),
      // The blockout decides framing and movement; the look still comes from the picks.
      cameraLine(input.referenceClip ? { ...input, camera: withoutFraming(input.camera) } : input),
    ]
      .filter(Boolean)
      .join("\n");
  }
  const names = new Map(input.cast.map((m) => [m.slot.toLowerCase(), m.name]));
  const scene = input.scene.replace(SLOT, (_, slot: string) => names.get(slot.toLowerCase()) ?? slot);
  return [sentence(scene), cameraLine(input)].filter(Boolean).join("\n");
}
