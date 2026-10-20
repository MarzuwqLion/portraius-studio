// The prompt compiler (spec: Image studio, Prompt compiler). Every model gets
// the same structure: reference legend, identity lock, scene, camera and look,
// realism.
import { cameraPhrases, isStylised, type CameraSelection } from "./camera";
import { SLOT, slotsIn } from "./slots";

export type ReferenceKind = "sheet" | "photo" | "front";

export interface CastMember {
  slot: string; // "lead", written {lead} in the scene
  name: string;
  kind: "person" | "element";
  description?: string;
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
    if (member.kind === "person" && indexes.length) {
      locks.push(`Keep ${role(member.slot)}'s exact face, skin tone, skin texture and hair from ${listImages(indexes)}. Do not beautify or change their age.`);
    }
  }
  return { legend, locks, next: n };
}

function descriptions(cast: CastMember[]): string[] {
  return cast.filter((m) => m.description?.trim()).map((m) => `${role(m.slot)}: ${sentence(m.description!)}`);
}

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
    // Skin and lens realism only where a person can be in the shot.
    isStylised(input.camera) || !(input.editing || input.cast.some((m) => m.kind === "person")) ? "" : REALISM,
  ]
    .filter(Boolean)
    .join("\n");
}

// Video: with reference images the cast gets the same legend and lock; with a
// first frame (or no cast) identity rides in the frame, so slots become names.
export function compileVideoPrompt(input: PromptInput & { withReferences: boolean }): string {
  if (input.withReferences && input.cast.length) {
    const cast = castBlock(input.cast, 1, "Reference image");
    return [
      cast.legend.join(" "),
      cast.locks.join(" "),
      descriptions(input.cast).join(" "),
      sentence(input.scene.replace(SLOT, (_, slot: string) => role(slot))),
      cameraLine(input),
    ]
      .filter(Boolean)
      .join("\n");
  }
  const names = new Map(input.cast.map((m) => [m.slot.toLowerCase(), m.name]));
  const scene = input.scene.replace(SLOT, (_, slot: string) => names.get(slot.toLowerCase()) ?? slot);
  return [sentence(scene), cameraLine(input)].filter(Boolean).join("\n");
}
