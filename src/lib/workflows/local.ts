// The local engine's graphs as ComfyUI workflows (spec: Local engine): what
// "On your GPU" sends to the visitor's ComfyUI, built by the app's own local
// adapters from the same requests the studios make, then saved in both formats
// under workflows/local/. Open weights and ComfyUI's own nodes only: no account,
// no credits.
//
// The adapters build Workflow (API) prompts. The UI format also needs each
// node's slots and widget order, which come from ComfyUI's node definitions:
// local-nodes.json, a trimmed copy of /object_info that `npm run
// workflows:nodes` refreshes. A two-step flow (sheet then views, Recast's
// still then Wan Animate) is one graph: the second step takes the first's
// image by link instead of loading a file, and nodes both steps share (the
// model loaders) appear once.
import { DEFAULT_STRENGTH } from "@/lib/adapters/freepik-skin";
import { SHEET_VIEWS, VIEW_LABEL, compositeInput, viewInput } from "@/lib/characters/sheet";
import { preset } from "@/lib/presets/load";
import type { Preset } from "@/lib/presets/schema";
import { compileImagePrompt, compileVideoPrompt } from "@/lib/prompts/compile";
import { requestBody } from "@/lib/registry/adapters";
import type { AnimateInput, EnhanceImageInput, GenerateImageInput, InlineImage, SpeakInput, WanInput } from "@/lib/registry/inputs";
import { LOCAL_INPUT, type LocalBody, type LocalPrompt } from "@/lib/registry/local-body";
import { localModelFiles, type ModelFile } from "@/lib/registry/local-models";
import { MODEL_IDS } from "@/lib/registry/models";
import { localAgentRequest } from "@/lib/studio/agent";
import { animatePrompt, nearestRatio, recastLimits } from "@/lib/studio/recast";
import { stageStillInput } from "@/lib/studio/recast-stage";
import { localSpeakingPrompt } from "@/lib/studio/voice";
import { sampleScene } from "@/lib/tour/tour";
import { SHEET_PHOTOS } from "./comfy";
import { Graph, LEAD, SATCHEL_FILE, WALT_FILES, elementMember, note, type NodeSpec, type Slot, type Value, type Workflow } from "./graph";
import { ANIMATE_SCENE, EDIT_SCENE, EDIT_SOURCE, LIP_SYNC_CLIP, MOTION_PRESET, RECAST_CLIP, STILL_PRESET, TEXT_CAMERA, TEXT_SCENE } from "./studio";
import NODES from "./local-nodes.json";

type Link = [string, number];
type Inputs = LocalPrompt[string]["inputs"];

// ---- Node definitions ----

type InputSpec = [unknown, Record<string, unknown>?];
interface InputGroup {
  required?: Record<string, InputSpec>;
  optional?: Record<string, InputSpec>;
}
export interface NodeDef {
  display_name?: string;
  input: InputGroup;
  output: string[];
  output_name: string[];
}

const DEFS = NODES as unknown as Record<string, NodeDef>;

// Inputs ComfyUI draws as widgets; anything else is a slot for a link.
const WIDGET_TYPES = new Set(["INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"]);
const isWidget = (type: unknown) => Array.isArray(type) || (typeof type === "string" && WIDGET_TYPES.has(type));

function defaultOf(type: unknown, opts: Record<string, unknown>): Value {
  if (opts.default !== undefined) return opts.default as Value;
  const options = Array.isArray(type) ? type : (opts.options as unknown[] | undefined);
  if (options?.length) return options[0] as Value;
  return type === "INT" || type === "FLOAT" ? 0 : type === "BOOLEAN" ? false : "";
}

// One node's slots and widgets in its definition's order, with the values the
// prompt gives. Dynamic inputs use the dotted names prompts use ("format.codec",
// "values.a"). Every input the prompt gives must land somewhere.
export function nodeSpec(classType: string, inputs: Inputs, def = DEFS[classType]): Omit<NodeSpec, "pos" | "size"> {
  if (!def) throw new Error(`No definition for ${classType}: run npm run workflows:nodes`);
  const slots: Slot[] = [];
  const widgets: [string, Value][] = [];
  const placed = new Set<string>();

  const walk = (group: InputGroup, prefix: string) => {
    for (const [required, entries] of [[true, group.required], [false, group.optional]] as const) {
      for (const [name, [type, opts = {}]] of Object.entries(entries ?? {})) {
        const id = prefix ? `${prefix}.${name}` : name;
        const value = inputs[id];
        const linked = Array.isArray(value);
        if (type === "COMFY_DYNAMICCOMBO_V3") {
          const options = opts.options as { key: string; inputs: InputGroup }[];
          const key = (value as string | undefined) ?? (opts.default as string | undefined) ?? options[0]!.key;
          widgets.push([id, key]);
          placed.add(id);
          const chosen = options.find((o) => o.key === key);
          if (!chosen) throw new Error(`${classType}: ${id} has no option ${key}`);
          walk(chosen.inputs, id);
        } else if (type === "COMFY_AUTOGROW_V3") {
          // The slots in use, and one more, the way the frontend grows them.
          const template = opts.template as { names?: string[]; prefix?: string; max?: number; input: InputGroup };
          const names = template.names ?? Array.from({ length: template.max ?? 0 }, (_, i) => `${template.prefix}${i}`);
          const slotType = String(Object.values(template.input.required ?? {})[0]?.[0] ?? "*");
          const used = names.filter((n) => `${id}.${n}` in inputs).length;
          for (const n of names.slice(0, Math.min(names.length, used + 1))) {
            slots.push({ name: `${id}.${n}`, type: slotType, optional: true, label: n });
            placed.add(`${id}.${n}`);
          }
        } else if (type === "COMFY_MATCHTYPE_V3") {
          const template = opts.template as { allowed_types?: string };
          slots.push({ name: id, type: template.allowed_types ?? "*", ...(required ? {} : { optional: true }) });
          placed.add(id);
        } else if (isWidget(type)) {
          widgets.push([id, linked || value === undefined ? defaultOf(type, opts) : (value as Value)]);
          if (linked) slots.push({ name: id, type: Array.isArray(type) ? "COMBO" : String(type), widget: true });
          if (opts.control_after_generate) widgets.push(["ui:control_after_generate", "randomize"]);
          if (opts.image_upload || opts.video_upload) widgets.push(["ui:upload", "image"]);
          if (opts.audio_upload) widgets.push(["ui:audioUI", ""], ["ui:upload", "audio"]);
          placed.add(id);
        } else {
          slots.push({ name: id, type: String(type), ...(required ? {} : { optional: true }) });
          placed.add(id);
        }
      }
    }
  };
  walk(def.input, "");

  const stray = Object.keys(inputs).filter((k) => !placed.has(k));
  if (stray.length) throw new Error(`${classType} takes no ${stray.join(", ")}: run npm run workflows:nodes`);
  return {
    type: classType,
    title: def.display_name ?? classType,
    inputs: slots,
    outputs: def.output.map((type, i) => ({ name: def.output_name[i] ?? type, type })),
    widgets,
  };
}

// ---- Joining the app's requests into one graph ----

// Files the graphs load, written into each InlineImage or data URI the app
// would send, so the loaders name them instead of an upload hash.
const file = (name: string, mime = "image/jpeg"): InlineImage => ({ mime: mime as InlineImage["mime"], base64: `@${name}` });
const input = (name: string) => `${LOCAL_INPUT}${name}`;
// An image the graph makes itself: a later step links to it.
const made = (step: string): InlineImage => file(`made:${step}`, "image/png");

const OUTPUTS = new Set(["SaveImage", "SaveVideo", "PreviewAny"]);

interface Step {
  title: string;      // its group's title
  modelId: string;
  input: unknown;
  name?: string;      // a later step's made(name) is this step's saved image
}

interface Joined {
  prompt: LocalPrompt;
  steps: { title: string; ids: string[] }[];
  models: string[];
}

// Each step's request through the app's own adapter, then one prompt: files by
// name, made images by link, identical nodes (loaders, encoders) once.
export function joinSteps(steps: Step[]): Joined {
  const prompt: LocalPrompt = {};
  const bySignature = new Map<string, string>();
  const madeImages = new Map<string, Link>();
  const groups: Joined["steps"] = [];
  let next = 1;

  for (const step of steps) {
    const body = requestBody(step.modelId, step.input) as LocalBody;
    const names = new Map(body.uploads.map((u) => [u.name, u.data.slice(u.data.indexOf("@") + 1)]));
    const ids = new Map<string, Link>(); // the step's node ID -> where its output 0 now is
    const own: string[] = [];
    const remap = (value: Inputs[string]) => {
      if (!Array.isArray(value)) return typeof value === "string" && names.has(value) ? names.get(value)! : value;
      const [node, index] = value as Link;
      const target = ids.get(node);
      if (!target) throw new Error(`${step.title}: node ${node} is used before it's made`);
      return [target[0], target[1] + index] as Link;
    };
    for (const [id, node] of Object.entries(body.prompt).sort(([a], [b]) => Number(a) - Number(b))) {
      const inputs = Object.fromEntries(Object.entries(node.inputs).map(([k, v]) => [k, remap(v)])) as Inputs;
      const loaded = node.class_type === "LoadImage" ? String(inputs.image) : "";
      if (loaded.startsWith("made:")) {
        const link = madeImages.get(loaded.slice(5));
        if (!link) throw new Error(`${step.title}: no earlier step makes ${loaded}`);
        ids.set(id, link);
        continue;
      }
      const signature = `${node.class_type} ${JSON.stringify(inputs)}`;
      const shared = OUTPUTS.has(node.class_type) ? undefined : bySignature.get(signature);
      if (shared) {
        ids.set(id, [shared, 0]);
        continue;
      }
      const newId = String(next++);
      prompt[newId] = { class_type: node.class_type, inputs };
      bySignature.set(signature, newId);
      ids.set(id, [newId, 0]);
      own.push(newId);
    }
    if (step.name) {
      const save = own.map((id) => prompt[id]!).find((n) => n.class_type === "SaveImage");
      if (!save) throw new Error(`${step.title} saves no image`);
      madeImages.set(step.name, save.inputs.images as Link);
    }
    groups.push({ title: step.title, ids: own });
  }
  return { prompt, steps: groups, models: [...new Set(steps.map((s) => s.modelId))] };
}

// ---- Layout ----

const COLUMN = 460;
const ROW_GAP = 40;
const nodeHeight = (spec: Omit<NodeSpec, "pos" | "size">) =>
  Math.min(720, 90 + 26 * ((spec.inputs?.filter((s) => !s.widget).length ?? 0) + (spec.widgets?.filter(([k]) => !k.startsWith("ui:")).length ?? 0)) + 26 * (spec.outputs?.length ?? 0));

// A step per band, top to bottom; inside a band, a column per depth.
function toWorkflow(id: string, joined: Joined, text: string): Workflow {
  const g = new Graph(id);
  const depth = new Map<string, number>();
  for (const [nodeId, node] of Object.entries(joined.prompt)) {
    const from = Object.values(node.inputs).filter(Array.isArray).map((v) => depth.get((v as Link)[0]) ?? 0);
    depth.set(nodeId, from.length ? Math.max(...from) + 1 : 0);
  }
  g.add(note(text, [-560, 0], [480, 720]));
  const uiId = new Map<string, number>();
  let top = 0;
  for (const step of joined.steps) {
    const heights = new Map<number, number>();
    let bottom = top;
    let right = 0;
    for (const nodeId of step.ids) {
      const node = joined.prompt[nodeId]!;
      const spec = nodeSpec(node.class_type, node.inputs);
      const column = depth.get(nodeId)!;
      const y = top + (heights.get(column) ?? 0);
      const h = nodeHeight(spec);
      heights.set(column, (heights.get(column) ?? 0) + h + ROW_GAP);
      uiId.set(nodeId, g.add({ ...spec, pos: [column * COLUMN, y], size: [COLUMN - 60, h] }));
      bottom = Math.max(bottom, y + h);
      right = Math.max(right, (column + 1) * COLUMN);
    }
    g.group(step.title, [-20, top - 60, right, bottom - top + 100]);
    top = bottom + 200;
  }
  for (const [nodeId, node] of Object.entries(joined.prompt)) {
    for (const [name, value] of Object.entries(node.inputs)) {
      if (Array.isArray(value)) g.link(uiId.get((value as Link)[0])!, (value as Link)[1], uiId.get(nodeId)!, name);
    }
  }
  return g.build();
}

// ---- Notes ----

const MODEL_NAME: Record<string, string> = {
  [MODEL_IDS.localQwenEdit]: "Qwen-Image-Edit 2511",
  [MODEL_IDS.localWanFast]: "Wan 2.2 5B",
  [MODEL_IDS.localWanBest]: "Wan 2.2 14B",
  [MODEL_IDS.localWanAnimate]: "Wan Animate 2",
  [MODEL_IDS.localWanSpeech]: "Wan 2.2 S2V",
  [MODEL_IDS.localSeedVR2]: "SeedVR2",
  [MODEL_IDS.localGemma]: "Gemma 4 12B",
};

// The model files a graph loads, each once, as a table for its note.
function filesTable(joined: Joined): string {
  const named = new Set(Object.values(joined.prompt).flatMap((n) => Object.values(n.inputs).filter((v): v is string => typeof v === "string")));
  const files = [...new Map(joined.models.flatMap((m) => localModelFiles(m)).filter((f) => named.has(f.name)).map((f): [string, ModelFile] => [f.name, f])).values()];
  return ["| Folder in `ComfyUI/models/` | File | GB |", "| --- | --- | --- |", ...files.map((f) => `| \`${f.folder}\` | [${f.name}](${f.url}) | ${f.gb} |`)].join("\n");
}

const LOADERS: Record<string, string> = { LoadImage: "image", LoadVideo: "file", LoadAudio: "audio" };

// The files a graph loads from ComfyUI/input/, in order.
function inputFiles(joined: Joined): string[] {
  return [...new Set(Object.values(joined.prompt).flatMap((n) => (LOADERS[n.class_type] ? [String(n.inputs[LOADERS[n.class_type]!])] : [])))];
}

function noteText(joined: Joined & { title: string; note: string }): string {
  const inputs = inputFiles(joined);
  return `## Portraius Studio on your GPU: ${joined.title}

${joined.note}

${inputs.length ? `**Inputs in \`ComfyUI/input/\`:** ${inputs.map((f) => `\`${f}\``).join(", ")}. Samples are in this repo's \`public/samples/\`.\n\n` : ""}Free: open-weight models and ComfyUI's own nodes, so no account or credits. Built by the app's own local adapters from the request its studio makes, so it matches what "On your GPU" sends (docs/local-setup.md).

**Models (${joined.models.map((m) => MODEL_NAME[m] ?? m).join(", ")}).** Every file is Apache 2.0.

${filesTable(joined)}`;
}

// ---- The graphs ----

function requirePreset(id: string): Preset {
  const p = preset(id);
  if (!p) throw new Error(`No preset ${id}`);
  return p;
}

const WALT_INPUTS = `For your own character, unzip its \`.portraius\` file: the views are in \`sheet/\`.`;
const LINE_FILE = "my-line.mp3";

interface LocalGraphDef {
  title: string;
  note: string;
  steps: Step[];
}

function graphs(): Record<string, LocalGraphDef> {
  const photos = SHEET_PHOTOS.map((p) => file(p));
  const qwen = MODEL_IDS.localQwenEdit;

  const still = requirePreset(STILL_PRESET);
  const compactLead = { ...LEAD, references: ["front" as const] };
  const stillInput: GenerateImageInput = {
    prompt: compileImagePrompt({ scene: still.recipe.prompt, cast: [compactLead], camera: still.recipe.camera ?? {}, modelId: qwen }),
    references: [file(WALT_FILES.front)],
    aspectRatio: String(still.recipe.params?.aspectRatio ?? "16:9") as GenerateImageInput["aspectRatio"],
    size: "2K",
    quality: "best",
    seed: 21,
  };
  const editInput: GenerateImageInput = {
    prompt: compileImagePrompt({ scene: EDIT_SCENE, cast: [elementMember("prop")], camera: {}, modelId: qwen, editing: true }),
    source: file(EDIT_SOURCE),
    references: [file(SATCHEL_FILE)],
    aspectRatio: "4:5",
    size: "2K",
    quality: "best",
    seed: 22,
  };

  const wan = (modelId: string, extra: Partial<WanInput>, scene: string, camera: Parameters<typeof compileVideoPrompt>[0]["camera"]): WanInput => ({
    stage: "generate",
    prompt: compileVideoPrompt({ scene, cast: [], camera, modelId, withReferences: false }),
    durationSec: 5,
    aspect: 16 / 9,
    seed: 31,
    ...extra,
  });

  const motion = requirePreset(MOTION_PRESET);
  const setting = typeof motion.recipe.params?.setting === "string" ? motion.recipe.params.setting : undefined;
  const recastStill = stageStillInput(file("walt-full-body.jpg"), file("concert-original.webp"), {
    setting,
    direction: "",
    description: LEAD.description,
    aspectRatio: nearestRatio(RECAST_CLIP.width, RECAST_CLIP.height),
    seed: 41,
  });
  const animate: AnimateInput = {
    prompt: animatePrompt(LEAD.name, LEAD.description, setting, ""),
    motion: motion.recipe.prompt.replace(/\{([a-z][a-z0-9_-]*)\}/g, "a person"),
    performer: made("stage"),
    clip: input(RECAST_CLIP.file),
    durationSec: Math.min(RECAST_CLIP.durationSec, recastLimits("motion", true).maxSec),
    aspect: RECAST_CLIP.width / RECAST_CLIP.height,
    seed: 41,
  };

  const speak: SpeakInput = {
    prompt: localSpeakingPrompt(ANIMATE_SCENE),
    image: input("walt-looks-up.webp"),
    audio: input(LINE_FILE),
    durationSec: 4,
    aspect: 1280 / 731,
    seed: 51,
  };
  const enhance: EnhanceImageInput = { image: file(EDIT_SOURCE), strength: DEFAULT_STRENGTH };
  const scene = { ...sampleScene("walt", 1000), shots: [] };

  return {
    "character-sheet": {
      title: "a character from photos",
      note: `The turnaround sheet from your photos, then the front, three-quarter, profile and full-body views from the photos and that sheet, the way Cast and elements makes a character on your GPU. Qwen takes three images, so the sheet gets three photos and each view the first two plus the sheet. Put three photos of yourself in \`ComfyUI/input/\` as ${SHEET_PHOTOS.map((p) => `\`${p}\``).join(", ")}: varied angles, good light, one face each.

The app also checks consent on camera first, and scores each view against your photos. The graph does neither.`,
      steps: [
        { title: "Turnaround sheet", modelId: qwen, input: { ...compositeInput(photos), seed: 1 }, name: "sheet" },
        ...SHEET_VIEWS.map((view, i): Step => ({ title: `${VIEW_LABEL[view]} view`, modelId: qwen, input: { ...viewInput(view, photos.slice(0, 2), made("sheet")), seed: 2 + i } })),
      ],
    },
    "image-studio": {
      title: "the Image studio",
      note: `**With a cast (top).** The "${still.title}" preset with Walt as {lead}: the app's compiled prompt, with one image per cast member (his front view), since Qwen takes three. **Editing an image (bottom).** The source is image 1 and an element's sheet image 2, numbered the same way in the prompt. ${WALT_INPUTS} Settings are the studio's defaults: 2K, Best (8 steps).`,
      steps: [
        { title: `${still.title} (with a cast)`, modelId: qwen, input: stillInput },
        { title: "Edit an image", modelId: qwen, input: editInput },
      ],
    },
    "video-text": {
      title: "text to video",
      note: `A 5 s clip from the app's compiled prompt on Wan 2.2 14B, the Video studio's "Best" on your GPU: the high-noise model for the first steps, the low-noise model for the rest, each with its 4-step LoRA.`,
      steps: [{ title: "Text to video (Wan 2.2 14B)", modelId: MODEL_IDS.localWanBest, input: wan(MODEL_IDS.localWanBest, {}, TEXT_SCENE, TEXT_CAMERA) }],
    },
    "video-animate": {
      title: "animate an image",
      note: `"Animate an image" on Wan 2.2 14B: the still is the clip's first frame, and the clip takes its shape. ${WALT_INPUTS}`,
      steps: [{ title: "Animate an image (Wan 2.2 14B)", modelId: MODEL_IDS.localWanBest, input: wan(MODEL_IDS.localWanBest, { firstFrame: input(EDIT_SOURCE), aspect: 1289 / 1600 }, ANIMATE_SCENE, { movement: "slow-push-in" }) }],
    },
    "video-fast": {
      title: "text to video, fast",
      note: `The Video studio's "Fast" on your GPU: Wan 2.2 5B, one model at 24 fps, for cards with less memory or a quick look.`,
      steps: [{ title: "Text to video (Wan 2.2 5B)", modelId: MODEL_IDS.localWanFast, input: wan(MODEL_IDS.localWanFast, {}, TEXT_SCENE, TEXT_CAMERA) }],
    },
    recast: {
      title: "Recast",
      note: `Recast on your GPU in two steps, as the app does it: Qwen draws the performer (Walt's full-body view) into the clip's first frame in the "${motion.title}" preset's setting, then Wan Animate 2 moves that still through the clip, keeping the clip's sound. Put \`walt-full-body.jpg\`, \`concert-original.webp\` (the clip's first frame) and \`${RECAST_CLIP.file}\` from \`public/samples/\` in \`ComfyUI/input/\`. Use a clip you filmed or have the rights to use.`,
      steps: [
        { title: "The performer in the clip's first frame (Qwen)", modelId: qwen, input: recastStill, name: "stage" },
        { title: "The performer through the clip (Wan Animate 2)", modelId: MODEL_IDS.localWanAnimate, input: animate },
      ],
    },
    "add-a-line": {
      title: "add a line",
      note: `A speaking clip on your GPU: Wan 2.2 S2V makes the clip's first frame speak a line, for as long as the line lasts. Put \`walt-looks-up.webp\` (the first frame of \`${LIP_SYNC_CLIP}\`) in \`ComfyUI/input/\`, and a recording of the line as \`${LINE_FILE}\`: your own voice, or the MP3 the add-a-line graph saves. Set the clip length to the line's.`,
      steps: [{ title: "Speak the line (Wan 2.2 S2V)", modelId: MODEL_IDS.localWanSpeech, input: speak }],
    },
    "make-it-real": {
      title: "make it real",
      note: `The realism pass on your GPU: SeedVR2 restores the still at about 4 megapixels, where skin texture comes back. Put \`${EDIT_SOURCE}\` in \`ComfyUI/input/\`. The app scores the result against the character again; the graph doesn't.`,
      steps: [{ title: "Make it real (SeedVR2)", modelId: MODEL_IDS.localSeedVR2, input: enhance }],
    },
    "draft-shots": {
      title: "draft shots with AI",
      note: `The Director's "Draft with AI" on your GPU: Gemma 4 plans the shot list for the Tour's sample scene, with the app's system prompt and scene card, and the shot schema written into the prompt. The plan comes back as text in **Preview as Text**; the app checks each shot and adds it to the scene.`,
      steps: [{ title: "Plan the shots (Gemma 4)", modelId: MODEL_IDS.localGemma, input: { ...localAgentRequest(scene, [{ slot: LEAD.slot, name: LEAD.name, kind: LEAD.kind, description: LEAD.description! }]), seed: 61 } }],
    },
  };
}

// Every local graph's joined prompt, by file name under workflows/local/.
export function localPrompts(): Record<string, Joined & { title: string; note: string }> {
  return Object.fromEntries(Object.entries(graphs()).map(([name, def]) => [name, { ...joinSteps(def.steps), title: def.title, note: def.note }]));
}

// Every local graph in both formats, by path under workflows/.
export function localWorkflows(): Record<string, Workflow> {
  return Object.fromEntries(
    Object.entries(localPrompts()).map(([name, joined], i) => [
      `local/${name}`,
      toWorkflow(`7d1b6c2e-4a7e-4f0e-9a51-5c3d2b1a01${String(i + 1).padStart(2, "0")}`, joined, noteText(joined)),
    ]),
  );
}
