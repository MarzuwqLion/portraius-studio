// The ComfyUI workflows in workflows/ (spec: ComfyUI workflows): the app's two
// core flows as graphs of partner nodes, in the UI format and the Workflow
// (API) format. They're built here from the app's own prompt code, so a graph
// sends what the app sends; a test keeps the committed files in step.
//
// Node IDs and inputs follow current ComfyUI (October 2026): Nano Banana 2.1
// is GeminiNanoBanana2V2, Seedance 2.5 is ByteDance2FirstLastFrameNode plus
// ByteDance2DraftToFinalVideoNode, and MiniMax H3 is
// MinimaxHailuo03FirstLastFrameNode. Their per-model inputs are dynamic, so
// they're named with dots ("model.resolution", "model.images.image_1").
import { SHEET_PROMPT, SHEET_VIEWS, VIEW_LABEL, compositeInput, viewInput, type SheetView } from "@/lib/characters/sheet";
import { compileImagePrompt, compileVideoPrompt, type CastMember } from "@/lib/prompts/compile";
import type { CameraSelection } from "@/lib/prompts/camera";
import { MODEL_IDS } from "@/lib/registry/models";

type Value = string | number | boolean;
type Link = [string, number];

interface Slot {
  name: string;
  type: string;
  optional?: boolean;
  label?: string;
  widget?: boolean; // a widget that takes a link instead (another node's output)
}

interface NodeSpec {
  type: string;
  title?: string;
  pos: [number, number];
  size: [number, number];
  inputs?: Slot[];
  outputs?: Slot[];
  // Widgets in the node's own order. Names with "ui:" are interface-only (the
  // seed's control_after_generate) and stay out of the API format.
  widgets?: [string, Value][];
  mode?: 0 | 4;  // 4: bypassed until the user turns it on
  api?: boolean; // notes have no place in the API format
}

interface UiNode {
  id: number;
  type: string;
  title?: string;
  pos: [number, number];
  size: [number, number];
  flags: Record<string, never>;
  order: number;
  mode: number;
  inputs: { name: string; type: string; link: number | null; shape?: number; label?: string; widget?: { name: string } }[];
  outputs: { name: string; type: string; links: number[] | null }[];
  properties: { "Node name for S&R": string };
  widgets_values: Value[];
  widgets_values_named?: Record<string, Value>;
}

export interface UiWorkflow {
  id: string;
  revision: number;
  last_node_id: number;
  last_link_id: number;
  nodes: UiNode[];
  links: [number, number, number, number, number, string][];
  groups: { id: number; title: string; bounding: [number, number, number, number]; font_size: number; flags: Record<string, never> }[];
  config: Record<string, never>;
  extra: { ds: { scale: number; offset: [number, number] }; frontendVersion: string };
  version: number;
}

export type ApiWorkflow = Record<string, { class_type: string; inputs: Record<string, Value | Link>; _meta: { title: string } }>;

class Graph {
  private nodes: UiNode[] = [];
  private links: UiWorkflow["links"] = [];
  private groups: UiWorkflow["groups"] = [];
  private api: ApiWorkflow = {};
  private specs = new Map<number, NodeSpec>();

  constructor(private readonly id: string) {}

  add(spec: NodeSpec): number {
    const id = this.nodes.length + 1;
    const widgets = spec.widgets ?? [];
    this.nodes.push({
      id,
      type: spec.type,
      ...(spec.title ? { title: spec.title } : {}),
      pos: spec.pos,
      size: spec.size,
      flags: {},
      order: this.nodes.length,
      mode: spec.mode ?? 0,
      inputs: (spec.inputs ?? []).map((s) => ({
        name: s.name,
        type: s.type,
        link: null,
        ...(s.optional ? { shape: 7 } : {}),
        ...(s.label ? { label: s.label } : {}),
        ...(s.widget ? { widget: { name: s.name } } : {}),
      })),
      outputs: (spec.outputs ?? []).map((s) => ({ name: s.name, type: s.type, links: null })),
      properties: { "Node name for S&R": spec.type },
      widgets_values: widgets.map(([, v]) => v),
      ...(widgets.length ? { widgets_values_named: Object.fromEntries(widgets.map(([k, v]) => [k.replace(/^ui:/, ""), v])) } : {}),
    });
    this.specs.set(id, spec);
    // Like ComfyUI's own "Export (API)", bypassed nodes are left out.
    if (spec.api !== false && spec.mode !== 4) {
      this.api[String(id)] = {
        class_type: spec.type,
        inputs: Object.fromEntries(widgets.filter(([k]) => !k.startsWith("ui:"))),
        _meta: { title: spec.title ?? spec.type },
      };
    }
    return id;
  }

  link(from: number, output: number, to: number, input: string): void {
    const id = this.links.length + 1;
    const source = this.nodes[from - 1]!;
    const target = this.nodes[to - 1]!;
    const slot = target.inputs.findIndex((i) => i.name === input);
    if (slot === -1) throw new Error(`${target.type} has no input ${input}`);
    const type = source.outputs[output]!.type;
    this.links.push([id, from, output, to, slot, type]);
    (source.outputs[output]!.links ??= []).push(id);
    target.inputs[slot]!.link = id;
    if (this.api[String(to)]) this.api[String(to)]!.inputs[input] = [String(from), output];
  }

  group(title: string, bounding: [number, number, number, number]): void {
    this.groups.push({ id: this.groups.length + 1, title, bounding, font_size: 24, flags: {} });
  }

  build(): { ui: UiWorkflow; api: ApiWorkflow } {
    return {
      ui: {
        id: this.id,
        revision: 0,
        last_node_id: this.nodes.length,
        last_link_id: this.links.length,
        nodes: this.nodes,
        links: this.links,
        groups: this.groups,
        config: {},
        extra: { ds: { scale: 0.6, offset: [0, 0] }, frontendVersion: "1.53.6" },
        version: 0.4,
      },
      api: this.api,
    };
  }
}

// ---- Nodes ----

const note = (text: string, pos: [number, number], size: [number, number] = [420, 360]): NodeSpec => ({
  type: "MarkdownNote",
  title: "Note",
  pos,
  size,
  widgets: [["ui:text", text]],
  api: false,
});

const loadImage = (file: string, title: string, pos: [number, number]): NodeSpec => ({
  type: "LoadImage",
  title,
  pos,
  size: [300, 360],
  outputs: [
    { name: "IMAGE", type: "IMAGE" },
    { name: "MASK", type: "MASK" },
  ],
  widgets: [
    ["image", file],
    ["ui:upload", "image"],
  ],
});

// Nano Banana 2.1 the way the app calls it: no system prompt, image output,
// "Best" quality (HIGH thinking) unless asked otherwise.
function nanoBanana(o: { title: string; prompt: string; aspect: string; images: number; pos: [number, number]; seed: number; promptInput?: boolean }): NodeSpec {
  const slots = o.images + 1; // the node always offers one more image slot
  return {
    type: "GeminiNanoBanana2V2",
    title: o.title,
    pos: o.pos,
    size: [420, 620],
    inputs: [
      ...(o.promptInput ? [{ name: "prompt", type: "STRING", widget: true }] : []),
      ...Array.from({ length: slots }, (_, i) => ({ name: `model.images.image_${i + 1}`, type: "IMAGE", optional: true, label: `image_${i + 1}` })),
      { name: "model.files", type: "GEMINI_INPUT_FILES", optional: true },
    ],
    outputs: [
      { name: "IMAGE", type: "IMAGE" },
      { name: "STRING", type: "STRING" },
      { name: "thought_image", type: "IMAGE" },
    ],
    widgets: [
      ["prompt", o.prompt],
      ["model", "Gemini Nano Banana 2.1"],
      ["model.aspect_ratio", o.aspect],
      ["model.resolution", "2K"],
      ["model.thinking_level", "HIGH"],
      ["seed", o.seed],
      ["ui:control_after_generate", "randomize"],
      ["response_modalities", "IMAGE"],
      ["system_prompt", ""],
      ["temperature", 1],
      ["top_p", 0.95],
    ],
  };
}

const saveImage = (prefix: string, pos: [number, number]): NodeSpec => ({
  type: "SaveImage",
  title: "Save image",
  pos,
  size: [320, 380],
  inputs: [{ name: "images", type: "IMAGE" }],
  widgets: [["filename_prefix", prefix]],
});

const saveVideo = (prefix: string, pos: [number, number], mode: 0 | 4 = 0): NodeSpec => ({
  type: "SaveVideo",
  title: "Save video",
  pos,
  size: [420, 380],
  mode,
  inputs: [{ name: "video", type: "VIDEO" }],
  outputs: [{ name: "video", type: "VIDEO" }],
  widgets: [
    ["filename_prefix", prefix],
    ["format", "auto"],
    ["format.codec", "auto"],
    ["ui:codec", "auto"],
  ],
});

// ---- Character sheet: photos to turnaround sheet ----

export const SHEET_PHOTOS = ["my-photo-1.jpg", "my-photo-2.jpg", "my-photo-3.jpg"];

const NOTE_SHEET = `## Portraius Studio: photos to a character sheet

The same calls the app makes when you make a character from photos
(spec: Character vault, Turnaround sheet).

1. Put **3 photos of yourself** in \`ComfyUI/input/\` as ${SHEET_PHOTOS.map((p) => `\`${p}\``).join(", ")}: varied angles, good light, one face each. Add more Load Image nodes for up to 10.
2. Run. Nano Banana 2.1 draws the 16:9 turnaround sheet from every photo, then each single view from the photos plus that sheet.

Only use photos of yourself, or of someone who made their own character and agreed to it. The app adds a webcam consent check and an identity score; this graph has neither.

Needs a Comfy account with credits: these are partner nodes.`;

export function characterSheetWorkflow(): { ui: UiWorkflow; api: ApiWorkflow } {
  const g = new Graph("7d1b6c2e-4a7e-4f0e-9a51-5c3d2b1a0001");
  const dummy = { mime: "image/jpeg" as const, base64: "" };
  g.add(note(NOTE_SHEET, [-560, 0]));
  const photos = SHEET_PHOTOS.map((file, i) => g.add(loadImage(file, `Photo ${i + 1}`, [0, i * 420])));

  const composite = g.add(nanoBanana({ title: "Turnaround sheet", prompt: SHEET_PROMPT, aspect: compositeInput([dummy]).aspectRatio, images: photos.length, pos: [400, 0], seed: 1 }));
  photos.forEach((p, i) => g.link(p, 0, composite, `model.images.image_${i + 1}`));
  const saveComposite = g.add(saveImage("portraius/sheet/turnaround", [880, 0]));
  g.link(composite, 0, saveComposite, "images");

  SHEET_VIEWS.forEach((view: SheetView, i) => {
    const input = viewInput(view, [], dummy);
    const y = 700 + i * 700;
    const node = g.add(nanoBanana({ title: `${VIEW_LABEL[view]} view`, prompt: input.prompt, aspect: input.aspectRatio, images: photos.length + 1, pos: [880, y], seed: 2 + i }));
    photos.forEach((p, j) => g.link(p, 0, node, `model.images.image_${j + 1}`));
    g.link(composite, 0, node, `model.images.image_${photos.length + 1}`);
    const save = g.add(saveImage(`portraius/sheet/${view.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`, [1360, y]));
    g.link(node, 0, save, "images");
  });
  return g.build();
}

// ---- Still first video: a character still, then an animated clip ----

// The sample character's files, as shipped in public/samples/.
export const STILL_FIRST_FILES = { sheet: "walt-sheet.jpg", front: "walt-front.jpg" };

const LEAD: CastMember = {
  slot: "lead",
  name: "Walt Harmon",
  kind: "person",
  description: "Retired harbour pilot. Tall and lean, usually in a navy wool peacoat over a dark knit sweater.",
  // A designed character has no photos: his front view stands in for one.
  references: ["sheet", "front"],
};
const SCENE = "{lead} looks up from a sealed envelope toward the diner door, and almost smiles";
const STILL_CAMERA: CameraSelection = { size: "CU", lens: "35mm", lighting: "practicals" };
const EMPTY_SCENE = "Rain streaks the diner window at night. Inside, an empty booth and a cup of coffee going cold under a hanging lamp";

const NOTE_VIDEO = `## Portraius Studio: image, then animate

The Video studio's "Image, then animate" mode: Nano Banana 2.1 draws the opening frame with the character in it,
then a video model animates from that frame, so the face is settled in the still.

**With a character (top row).** Seedance 2.5 refuses photoreal people as input images, so the app renders
every clip with a person on **MiniMax H3**, and this row does too. Put a character's sheet and front view in
\`ComfyUI/input/\` as \`${STILL_FIRST_FILES.sheet}\` and \`${STILL_FIRST_FILES.front}\`. Unzip any \`.portraius\`
file: they're \`sheet/turnaround.png\` and \`sheet/front.png\`. The samples are in this repo's \`public/samples/\`.

**Without people (bottom row).** Seedance 2.5 draws a cheap 480p draft first. When you like it, copy the
draft_task_id from "Preview as Text" into "Seedance 2.5 final", turn that node and its Save Video back on
(they start bypassed), and run again for the 1080p final. Nothing is re-sent.`;

export function stillFirstVideoWorkflow(): { ui: UiWorkflow; api: ApiWorkflow } {
  const g = new Graph("3c9e0f1a-8b2d-4c6e-9f70-5c3d2b1a0002");
  g.add(note(NOTE_VIDEO, [-560, 0], [460, 520]));

  // Row 1: a character still, animated on MiniMax H3.
  const sheet = g.add(loadImage(STILL_FIRST_FILES.sheet, "Character sheet", [0, 0]));
  const front = g.add(loadImage(STILL_FIRST_FILES.front, "Character front view", [0, 420]));
  const stillPrompt = compileImagePrompt({ scene: SCENE, cast: [LEAD], camera: STILL_CAMERA, modelId: MODEL_IDS.nanoBanana });
  const still = g.add(nanoBanana({ title: "Opening still (character)", prompt: stillPrompt, aspect: "16:9", images: 2, pos: [400, 0], seed: 7 }));
  g.link(sheet, 0, still, "model.images.image_1");
  g.link(front, 0, still, "model.images.image_2");
  const saveStill = g.add(saveImage("portraius/still-first/still", [880, 0]));
  g.link(still, 0, saveStill, "images");

  const motion: CameraSelection = { ...STILL_CAMERA, movement: "slow-push-in" };
  const h3 = g.add({
    type: "MinimaxHailuo03FirstLastFrameNode",
    title: "MiniMax H3 (clips with people)",
    pos: [880, 420],
    size: [420, 340],
    inputs: [
      { name: "first_frame", type: "IMAGE" },
      { name: "last_frame", type: "IMAGE", optional: true },
    ],
    outputs: [{ name: "VIDEO", type: "VIDEO" }],
    widgets: [
      ["model", "MiniMax H3"],
      ["model.prompt", compileVideoPrompt({ scene: SCENE, cast: [LEAD], camera: motion, modelId: MODEL_IDS.minimaxH3, withReferences: false })],
      ["model.resolution", "768P"],
      ["model.duration", 5],
      ["seed", 7],
      ["ui:control_after_generate", "randomize"],
      ["watermark", false],
    ],
  });
  g.link(still, 0, h3, "first_frame");
  const saveH3 = g.add(saveVideo("video/portraius-still-first", [1360, 420]));
  g.link(h3, 0, saveH3, "video");
  g.group("With a character: Nano Banana 2.1, then MiniMax H3", [-20, -60, 1820, 920]);

  // Row 2: a shot without people, as a Seedance 2.5 draft, then its final.
  const y = 1100;
  const emptyStill = g.add(
    nanoBanana({ title: "Opening still (no people)", prompt: compileImagePrompt({ scene: EMPTY_SCENE, cast: [], camera: { size: "WS", lens: "35mm", lighting: "practicals" }, modelId: MODEL_IDS.nanoBanana }), aspect: "16:9", images: 0, pos: [400, y], seed: 11 }),
  );
  const draft = g.add({
    type: "ByteDance2FirstLastFrameNode",
    title: "Seedance 2.5 draft (480p)",
    pos: [880, y],
    size: [450, 420],
    inputs: [
      { name: "first_frame", type: "IMAGE", optional: true },
      { name: "last_frame", type: "IMAGE", optional: true },
    ],
    outputs: [
      { name: "VIDEO", type: "VIDEO" },
      { name: "draft_task_id", type: "STRING" },
    ],
    widgets: [
      ["model", "Seedance 2.5 Draft"],
      ["model.prompt", compileVideoPrompt({ scene: EMPTY_SCENE, cast: [], camera: { size: "WS", lens: "35mm", movement: "slow-push-in" }, modelId: MODEL_IDS.seedance, withReferences: false })],
      ["model.resolution", "480p"],
      ["model.duration", 5],
      ["model.generate_audio", true],
      ["model.output_format", "mp4"],
      ["seed", 1234],
      // Fixed, so running again for the final doesn't draw a new draft.
      ["ui:control_after_generate", "fixed"],
      ["watermark", false],
      ["first_frame_asset_id", ""],
      ["last_frame_asset_id", ""],
    ],
  });
  g.link(emptyStill, 0, draft, "first_frame");
  const saveDraft = g.add(saveVideo("video/portraius-draft", [1360, y]));
  g.link(draft, 0, saveDraft, "video");
  const taskId = g.add({ type: "PreviewAny", title: "Preview as Text", pos: [1360, y + 420], size: [420, 160], inputs: [{ name: "source", type: "*" }] });
  g.link(draft, 1, taskId, "source");
  const final = g.add({
    type: "ByteDance2DraftToFinalVideoNode",
    title: "Seedance 2.5 final (1080p)",
    pos: [1820, y],
    size: [420, 160],
    mode: 4,
    outputs: [{ name: "VIDEO", type: "VIDEO" }],
    widgets: [
      ["draft_task_id", ""],
      ["watermark", false],
    ],
  });
  const saveFinal = g.add(saveVideo("video/portraius-final", [1820, y + 220], 4));
  g.link(final, 0, saveFinal, "video");
  g.group("Without people: Seedance 2.5 draft, then the final from its ID", [-20, y - 60, 2300, 820]);
  return g.build();
}

// ---- The node pack's example: a character file to a scored still ----

// Ships in custom_nodes/comfyui-portraius-characters/example_workflows/, so
// ComfyUI lists it under the pack's templates.
export const PACK_SCENE = "{lead} reads a paperback in a corner booth of a late-night diner, rain on the window behind";

const NOTE_PACK = `## Portraius Studio: a character file to a still

A character you made in Portraius Studio is one \`.portraius\` file. This graph uses it the way the app does.

1. Put the file in \`ComfyUI/input/characters/\` and pick it in **Load Portraius Character**. The sample character, Walt Harmon, is \`public/samples/walt-harmon.portraius\` in the app's repo.
2. Write the scene in **Character Prompt**: people are \`{lead}\`, \`{second}\` and \`{third}\`, elements are named for their type, like \`{outfit}\`.
3. Run. Nano Banana 2.1 draws the still from the app's own prompt and references, and **Identity Score** rates the face against the character's, 0 to 100.

A person made from photos needs their consent record, as in the app. Nano Banana 2.1 is a partner node: it needs a Comfy account with credits.`;

export function portraiusStillWorkflow(): { ui: UiWorkflow; api: ApiWorkflow } {
  const g = new Graph("7d1b6c2e-4a7e-4f0e-9a51-5c3d2b1a0003");
  g.add(note(NOTE_PACK, [-560, 0]));
  const character = g.add({
    type: "PortraiusLoadCharacter",
    title: "Load Portraius Character",
    pos: [0, 0],
    size: [320, 200],
    outputs: [
      { name: "character", type: "PORTRAIUS_CHARACTER" },
      { name: "sheet", type: "IMAGE" },
      { name: "views", type: "IMAGE" },
      { name: "photos", type: "IMAGE" },
      { name: "name", type: "STRING" },
      { name: "description", type: "STRING" },
    ],
    widgets: [["character", "walt-harmon.portraius"]],
  });
  const prompt = g.add({
    type: "PortraiusCharacterPrompt",
    title: "Character Prompt",
    pos: [380, 0],
    size: [400, 520],
    inputs: [
      { name: "character_1", type: "PORTRAIUS_CHARACTER" },
      { name: "character_2", type: "PORTRAIUS_CHARACTER", optional: true },
      { name: "character_3", type: "PORTRAIUS_CHARACTER", optional: true },
      { name: "character_4", type: "PORTRAIUS_CHARACTER", optional: true },
    ],
    outputs: [
      { name: "prompt", type: "STRING" },
      { name: "references", type: "IMAGE" },
      { name: "cast", type: "STRING" },
    ],
    widgets: [
      ["scene", PACK_SCENE],
      ["size", "Medium close-up"],
      ["angle", "none"],
      ["lens", "85 mm"],
      ["aperture", "f/2"],
      ["lighting", "Soft key"],
      ["look", "Warm film"],
    ],
  });
  g.link(character, 0, prompt, "character_1");
  const still = g.add(nanoBanana({ title: "Nano Banana 2.1", prompt: "", aspect: "4:5", images: 1, pos: [840, 0], seed: 1, promptInput: true }));
  g.link(prompt, 0, still, "prompt");
  g.link(prompt, 1, still, "model.images.image_1");
  const save = g.add(saveImage("portraius/still", [1320, 0]));
  g.link(still, 0, save, "images");
  const score = g.add({
    type: "PortraiusIdentityScore",
    title: "Identity Score",
    pos: [1320, 440],
    size: [400, 240],
    inputs: [
      { name: "image", type: "IMAGE" },
      { name: "character", type: "PORTRAIUS_CHARACTER" },
    ],
    outputs: [
      { name: "score", type: "FLOAT" },
      { name: "report", type: "STRING" },
    ],
  });
  g.link(still, 0, score, "image");
  g.link(character, 0, score, "character");
  return g.build();
}

export function allWorkflows(): Record<string, { ui: UiWorkflow; api: ApiWorkflow }> {
  return { "character-sheet": characterSheetWorkflow(), "still-first-video": stillFirstVideoWorkflow() };
}
