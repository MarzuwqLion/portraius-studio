// Builds ComfyUI graphs in both formats at once: the UI graph you open and the
// Workflow (API) prompt a script sends. comfy.ts and studio.ts describe the
// workflows; this file holds the builder and the nodes they share.
//
// Node IDs and inputs follow current ComfyUI (October 2026) and Comfy's own
// templates. Partner nodes' per-model inputs are dynamic, so they're named with
// dots ("model.resolution", "model.images.image_1"); growing lists with a
// prefix count from 0 ("videos.video0", "images.image0").
import { SHEET_PROMPT, SHEET_VIEWS, VIEW_LABEL, compositeInput, viewInput, type SheetView } from "@/lib/characters/sheet";
import type { CastMember } from "@/lib/prompts/compile";

export type Value = string | number | boolean;
type Link = [string, number];

export interface Slot {
  name: string;
  type: string;
  optional?: boolean;
  label?: string;
  widget?: boolean; // a widget that takes a link instead (another node's output)
}

export interface NodeSpec {
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

export interface Workflow {
  ui: UiWorkflow;
  api: ApiWorkflow;
}

export class Graph {
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

  build(): Workflow {
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

// ---- The sample cast ----

// The sample character's files, as shipped in public/samples/.
export const WALT_FILES = { sheet: "walt-sheet.jpg", front: "walt-front.jpg" };
export const SATCHEL_FILE = "satchel-sheet.jpg";

export const LEAD: CastMember = {
  slot: "lead",
  name: "Walt Harmon",
  kind: "person",
  description: "Retired harbour pilot. Tall and lean, usually in a navy wool peacoat over a dark knit sweater.",
  // A designed character has no photos: his front view stands in for one.
  references: ["sheet", "front"],
};

// An element as a cast member: its sheet is its one reference.
export const elementMember = (slot: string): CastMember => ({ slot, name: "Leather satchel", kind: "element", references: ["sheet"] });

// ---- Nodes ----

export const note = (text: string, pos: [number, number], size: [number, number] = [420, 360]): NodeSpec => ({
  type: "MarkdownNote",
  title: "Note",
  pos,
  size,
  widgets: [["ui:text", text]],
  api: false,
});

export const loadImage = (file: string, title: string, pos: [number, number]): NodeSpec => ({
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

export const loadVideo = (file: string, title: string, pos: [number, number]): NodeSpec => ({
  type: "LoadVideo",
  title,
  pos,
  size: [320, 360],
  outputs: [{ name: "VIDEO", type: "VIDEO" }],
  widgets: [
    ["file", file],
    ["ui:upload", "image"],
  ],
});

// Nano Banana 2.1 the way the app calls it: no system prompt, image output,
// "Best" quality (HIGH thinking) at 2K unless asked otherwise. "Fast" is
// MINIMAL thinking (lib/adapters/nano-banana.ts).
export function nanoBanana(o: {
  title: string;
  prompt: string;
  aspect: string;
  images: number;
  pos: [number, number];
  seed: number;
  promptInput?: boolean;
  size?: "1K" | "2K" | "4K";
  quality?: "fast" | "best";
  control?: "randomize" | "fixed";
}): NodeSpec {
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
      ["model.resolution", o.size ?? "2K"],
      ["model.thinking_level", o.quality === "fast" ? "MINIMAL" : "HIGH"],
      ["seed", o.seed],
      ["ui:control_after_generate", o.control ?? "randomize"],
      ["response_modalities", "IMAGE"],
      ["system_prompt", ""],
      ["temperature", 1],
      ["top_p", 0.95],
    ],
  };
}

export const saveImage = (prefix: string, pos: [number, number]): NodeSpec => ({
  type: "SaveImage",
  title: "Save image",
  pos,
  size: [320, 380],
  inputs: [{ name: "images", type: "IMAGE" }],
  widgets: [["filename_prefix", prefix]],
});

// A person's sheet: the 16:9 composite from every photo, then each view from
// the photos plus the composite, the way lib/characters/sheet.ts builds them.
// `x` moves the whole set.
export function sheetNodes(g: Graph, photos: number[], prefix: string, x = 0): void {
  const dummy = { mime: "image/jpeg" as const, base64: "" };
  const composite = g.add(nanoBanana({ title: "Turnaround sheet", prompt: SHEET_PROMPT, aspect: compositeInput([dummy]).aspectRatio, images: photos.length, pos: [x + 400, 0], seed: 1 }));
  photos.forEach((p, i) => g.link(p, 0, composite, `model.images.image_${i + 1}`));
  const saveComposite = g.add(saveImage(`${prefix}/turnaround`, [x + 880, 0]));
  g.link(composite, 0, saveComposite, "images");

  SHEET_VIEWS.forEach((view: SheetView, i) => {
    const input = viewInput(view, [], dummy);
    const y = 700 + i * 700;
    const node = g.add(nanoBanana({ title: `${VIEW_LABEL[view]} view`, prompt: input.prompt, aspect: input.aspectRatio, images: photos.length + 1, pos: [x + 880, y], seed: 2 + i }));
    photos.forEach((p, j) => g.link(p, 0, node, `model.images.image_${j + 1}`));
    g.link(composite, 0, node, `model.images.image_${photos.length + 1}`);
    const save = g.add(saveImage(`${prefix}/${view.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`, [x + 1360, y]));
    g.link(node, 0, save, "images");
  });
}

export const saveVideo = (prefix: string, pos: [number, number], mode: 0 | 4 = 0): NodeSpec => ({
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

export const previewText = (pos: [number, number]): NodeSpec => ({
  type: "PreviewAny",
  title: "Preview as Text",
  pos,
  size: [420, 160],
  inputs: [{ name: "source", type: "*" }],
});

// MiniMax H3 from a first frame: every clip with a person in its first frame.
export function h3FirstLast(o: { title: string; prompt: string; pos: [number, number]; duration: number; seed: number }): NodeSpec {
  return {
    type: "MinimaxHailuo03FirstLastFrameNode",
    title: o.title,
    pos: o.pos,
    size: [420, 340],
    inputs: [
      { name: "first_frame", type: "IMAGE" },
      { name: "last_frame", type: "IMAGE", optional: true },
    ],
    outputs: [{ name: "VIDEO", type: "VIDEO" }],
    widgets: [
      ["model", "MiniMax H3"],
      ["model.prompt", o.prompt],
      ["model.resolution", "768P"],
      ["model.duration", o.duration],
      ["seed", o.seed],
      ["ui:control_after_generate", "randomize"],
      ["watermark", false],
    ],
  };
}

// MiniMax H3 from reference media: a cast's images, a clip to follow, a line
// to speak. Each list offers one more slot than it uses, up to H3's limits.
export function h3Reference(o: { title: string; prompt: string; pos: [number, number]; ratio: string; duration: number; seed: number; images: number; videos?: number; audios?: number }): NodeSpec {
  const slots = (kind: string, used: number, max: number) =>
    Array.from({ length: Math.min(max, used + 1) }, (_, i) => ({ name: `model.reference_${kind}s.${kind}_${i + 1}`, type: kind.toUpperCase(), optional: true, label: `${kind}_${i + 1}` }));
  return {
    type: "MinimaxHailuo03ReferenceNode",
    title: o.title,
    pos: o.pos,
    size: [420, 420],
    inputs: [...slots("image", o.images, 9), ...slots("video", o.videos ?? 0, 3), ...slots("audio", o.audios ?? 0, 3)],
    outputs: [{ name: "VIDEO", type: "VIDEO" }],
    widgets: [
      ["model", "MiniMax H3"],
      ["model.prompt", o.prompt],
      ["model.resolution", "768P"],
      ["model.ratio", o.ratio],
      ["model.duration", o.duration],
      ["seed", o.seed],
      ["ui:control_after_generate", "randomize"],
      ["watermark", false],
    ],
  };
}

// Seedance 2.5's final from a draft's ID, off until the user pastes the ID.
export const seedanceFinal = (pos: [number, number]): NodeSpec => ({
  type: "ByteDance2DraftToFinalVideoNode",
  title: "Seedance 2.5 final (1080p)",
  pos,
  size: [420, 160],
  mode: 4,
  outputs: [{ name: "VIDEO", type: "VIDEO" }],
  widgets: [
    ["draft_task_id", ""],
    ["watermark", false],
  ],
});

// HappyHorse 1.0 video edit at 720P, the app's setting (lib/adapters/wan-edit.ts).
export function happyHorseEdit(o: { title: string; prompt: string; pos: [number, number]; ratio: string; seed: number; images: number }): NodeSpec {
  return {
    type: "HappyHorseVideoEditApi",
    title: o.title,
    pos: o.pos,
    size: [420, 420],
    inputs: [
      { name: "video", type: "VIDEO" },
      ...Array.from({ length: Math.min(5, o.images + 1) }, (_, i) => ({ name: `model.reference_images.image${i + 1}`, type: "IMAGE", optional: true, label: `image${i + 1}` })),
    ],
    outputs: [{ name: "VIDEO", type: "VIDEO" }],
    widgets: [
      ["model", "happyhorse-1.0-video-edit"],
      ["model.prompt", o.prompt],
      ["model.resolution", "720P"],
      ["model.ratio", o.ratio],
      ["seed", o.seed],
      ["ui:control_after_generate", "randomize"],
      ["watermark", false],
    ],
  };
}

export const videoComponents = (title: string, pos: [number, number]): NodeSpec => ({
  type: "GetVideoComponents",
  title,
  pos,
  size: [300, 160],
  inputs: [{ name: "video", type: "VIDEO" }],
  outputs: [
    { name: "images", type: "IMAGE" },
    { name: "audio", type: "AUDIO" },
    { name: "fps", type: "FLOAT" },
    { name: "bit_depth", type: "COMBO" },
    { name: "color_space", type: "COMBO" },
  ],
});

export const createVideo = (title: string, pos: [number, number]): NodeSpec => ({
  type: "CreateVideo",
  title,
  pos,
  size: [300, 200],
  inputs: [
    { name: "images", type: "IMAGE" },
    { name: "audio", type: "AUDIO", optional: true },
    { name: "fps", type: "FLOAT", widget: true },
  ],
  outputs: [{ name: "VIDEO", type: "VIDEO" }],
  widgets: [
    ["fps", 30],
    ["bit_depth", "auto"],
    ["color_space", "sRGB"],
    ["codec", "none"], // Save Video encodes
  ],
});
