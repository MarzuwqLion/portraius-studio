// The rest of the studio as ComfyUI graphs (spec: ComfyUI workflows): every
// feature with a partner node, beyond the two core flows in comfy.ts. Like
// those, each graph takes its prompts and settings from the app's own code
// and presets, so a test catches drift and `npm run workflows` rebuilds them.
//
// Where ComfyUI can't do what the app does, the graph does the nearest thing
// and its note says so (workflows/README.md lists them all).
import { freepikSkin, DEFAULT_STRENGTH } from "@/lib/adapters/freepik-skin";
import { MAX_SHOT_PROMPT } from "@/lib/adapters/kling-omni";
import { sync3 } from "@/lib/adapters/sync3";
import { ELEMENT_TYPES, ELEMENT_TYPE_LABEL, elementCompositeInput, elementViewInput, elementViewLabel, type ElementType } from "@/lib/characters/element-sheet";
import { CANDIDATE_COUNT, SHEET_VIEWS, candidateInput } from "@/lib/characters/sheet";
import { preset } from "@/lib/presets/load";
import type { Preset } from "@/lib/presets/schema";
import type { CameraSelection } from "@/lib/prompts/camera";
import { compileImagePrompt, compileOneTakeShots, compileVideoPrompt } from "@/lib/prompts/compile";
import { MODEL_IDS } from "@/lib/registry/models";
import { agentRequest } from "@/lib/studio/agent";
import { oneTakeDurations, shotCamera, shotScene, shotSeed } from "@/lib/studio/director";
import { LIMITS, nearestRatio, settingPrompt } from "@/lib/studio/recast";
import { speakingDuration, speakingScene } from "@/lib/studio/voice";
import { sampleScene } from "@/lib/tour/tour";
import {
  Graph,
  LEAD,
  SATCHEL_FILE,
  WALT_FILES,
  createVideo,
  elementMember,
  h3FirstLast,
  h3Reference,
  happyHorseEdit,
  loadImage,
  loadVideo,
  nanoBanana,
  note,
  previewText,
  saveImage,
  saveVideo,
  seedanceFinal,
  sheetNodes,
  videoComponents,
  type NodeSpec,
  type Workflow,
} from "./graph";

const off = (spec: NodeSpec): NodeSpec => ({ ...spec, mode: 4 });

function requirePreset(id: string): Preset {
  const p = preset(id);
  if (!p) throw new Error(`No preset ${id}`);
  return p;
}

// Walt's sheet and front view, the two references the app sends for him.
function waltNodes(g: Graph, x: number, y: number): [number, number] {
  return [g.add(loadImage(WALT_FILES.sheet, "Character sheet", [x, y])), g.add(loadImage(WALT_FILES.front, "Character front view", [x, y + 420]))];
}

const INPUTS = `Put a character's sheet and front view in \`ComfyUI/input/\` as \`${WALT_FILES.sheet}\` and \`${WALT_FILES.front}\`: unzip any \`.portraius\` file, they're \`sheet/turnaround.png\` and \`sheet/front.png\`. The samples are in this repo's \`public/samples/\`.`;
const PARTNER = "Needs a Comfy account with credits: these are partner nodes.";

// ---- Design a character from text ----

// A designed person for the example, like every sample in this repo.
export const DESIGN_DESCRIPTION = "a marine biologist in her early forties with short dark curly hair, a scatter of freckles and a warm, direct gaze";

const NOTE_DESIGN = `## Portraius Studio: design a character from text

The Characters screen's "Design from text": ${CANDIDATE_COUNT} candidate faces from a description, one pick, then the same turnaround sheet and views as a character made from photos (spec: Design from text).

1. Write the person in each **Candidate face** prompt, after "an original, fictional adult person:". The app puts your description in the same place.
2. Run. Nano Banana 2.1 draws the ${CANDIDATE_COUNT} faces at 1K, Fast, then the sheet from the first one.
3. To use another face, set **Picked face**'s batch_index (0 to ${CANDIDATE_COUNT - 1}) and run again. The candidates' seeds are fixed, so ComfyUI keeps them and only the sheet is drawn again.

${PARTNER}`;

export function designFromTextWorkflow(): Workflow {
  const g = new Graph("7d1b6c2e-4a7e-4f0e-9a51-5c3d2b1a0004");
  g.add(note(NOTE_DESIGN, [-560, 0], [460, 460]));
  const input = candidateInput(DESIGN_DESCRIPTION);
  const faces = Array.from({ length: CANDIDATE_COUNT }, (_, i) =>
    // One call per face, so the faces differ; fixed seeds keep them when the pick changes.
    g.add(nanoBanana({ title: `Candidate face ${i + 1}`, prompt: input.prompt, aspect: input.aspectRatio, images: 0, pos: [0, i * 700], seed: i + 1, size: input.size, quality: input.quality, control: "fixed" })),
  );
  const batch = g.add({
    type: "BatchImagesNode",
    title: "Batch Images",
    pos: [480, 0],
    size: [240, 180],
    inputs: Array.from({ length: CANDIDATE_COUNT + 1 }, (_, i) => ({ name: `images.image${i}`, type: "IMAGE", optional: i >= CANDIDATE_COUNT, label: `image${i}` })),
    outputs: [{ name: "IMAGE", type: "IMAGE" }],
  });
  faces.forEach((face, i) => g.link(face, 0, batch, `images.image${i}`));
  const saveFaces = g.add(saveImage("portraius/design/candidate", [480, 240]));
  g.link(batch, 0, saveFaces, "images");
  const picked = g.add({
    type: "ImageFromBatch",
    title: "Picked face",
    pos: [480, 680],
    size: [240, 120],
    inputs: [{ name: "image", type: "IMAGE" }],
    outputs: [{ name: "IMAGE", type: "IMAGE" }],
    widgets: [
      ["batch_index", 0],
      ["length", 1],
    ],
  });
  g.link(batch, 0, picked, "image");
  g.group(`${CANDIDATE_COUNT} candidate faces, then the pick`, [-20, -60, 800, CANDIDATE_COUNT * 700 + 20]);
  sheetNodes(g, [picked], "portraius/design", 400);
  g.group("The sheet and views, from the picked face", [780, -60, 1340, SHEET_VIEWS.length * 700 + 760]);
  return g.build();
}

// ---- Element sheets ----

const ACTIVE_ELEMENT: ElementType = "prop";

const NOTE_ELEMENTS = `## Portraius Studio: element sheets

An outfit, prop or location from photos, as a clean product-style sheet and four views, the way the app makes elements (spec: Character vault, Elements). Each type has its own prompts, so each has its own group.

1. Put a photo in \`ComfyUI/input/\` as \`my-${ACTIVE_ELEMENT}-1.jpg\` and run: the **${ELEMENT_TYPE_LABEL[ACTIVE_ELEMENT]}** group is on.
2. For an outfit or a location, select that group's nodes and press **Ctrl+B** to turn them on (they start bypassed), then add its photo.

The app takes 1 to 6 photos: add Load Image nodes and wire them into each Nano Banana node's next image slot, before the sheet. Leave out logos, brand names and trademarked designs: the contest bans unlicensed IP.

${PARTNER}`;

export function elementSheetWorkflow(): Workflow {
  const g = new Graph("7d1b6c2e-4a7e-4f0e-9a51-5c3d2b1a0005");
  g.add(note(NOTE_ELEMENTS, [-560, 0], [460, 480]));
  const dummy = { mime: "image/jpeg" as const, base64: "" };
  const types = [ACTIVE_ELEMENT, ...ELEMENT_TYPES.filter((t) => t !== ACTIVE_ELEMENT)];
  types.forEach((type, row) => {
    const y = row * 1200;
    const on = (spec: NodeSpec) => (type === ACTIVE_ELEMENT ? spec : off(spec));
    const label = ELEMENT_TYPE_LABEL[type];
    const photo = g.add(on(loadImage(`my-${type}-1.jpg`, `${label} photo`, [0, y])));
    const sheetInput = elementCompositeInput(type, [dummy]);
    const sheet = g.add(on(nanoBanana({ title: `${label} sheet`, prompt: sheetInput.prompt, aspect: sheetInput.aspectRatio, images: 1, pos: [400, y], seed: 1 })));
    g.link(photo, 0, sheet, "model.images.image_1");
    const saveSheet = g.add(on(saveImage(`portraius/element/${type}/sheet`, [880, y])));
    g.link(sheet, 0, saveSheet, "images");
    SHEET_VIEWS.forEach((view, i) => {
      const x = 1300 + i * 460;
      const input = elementViewInput(type, view, [], dummy);
      const viewLabel = elementViewLabel(type, view);
      const node = g.add(on(nanoBanana({ title: `${label}: ${viewLabel}`, prompt: input.prompt, aspect: input.aspectRatio, images: 2, pos: [x, y], seed: 2 + i })));
      g.link(photo, 0, node, "model.images.image_1");
      g.link(sheet, 0, node, "model.images.image_2");
      const save = g.add(on(saveImage(`portraius/element/${type}/${viewLabel.toLowerCase().replace(/\s+/g, "-")}`, [x, y + 660])));
      g.link(node, 0, save, "images");
    });
    g.group(type === ACTIVE_ELEMENT ? label : `${label} (bypassed: select its nodes, then Ctrl+B)`, [-20, y - 60, 3180, 1140]);
  });
  return g.build();
}

// ---- Image studio: a cast in a scene, and editing a source image ----

export const STILL_PRESET = "film-still";
export const EDIT_SOURCE = "walt-diner.jpg";
export const EDIT_SCENE = "Put the {prop} on the booth seat beside him. Keep everything else in the image exactly as it is";

const NOTE_IMAGE = `## Portraius Studio: the Image studio

**With a cast (top row).** The "${requirePreset(STILL_PRESET).title}" preset with Walt as {lead}. The prompt is the app's compiler output: which image is whose, a lock on the face, the scene, the camera, then skin and lens realism. ${INPUTS}

**Editing an image (bottom row).** The source goes first, then the cast's references, and the prompt numbers them the same way. Put the image to edit in as \`${EDIT_SOURCE}\` and an element's sheet as \`${SATCHEL_FILE}\` (both in \`public/samples/\`).

The app scores each still against the character and retries once under 60; the graph doesn't. Settings are the Image studio's defaults: 2K, Best. ${PARTNER}`;

export function imageStudioWorkflow(): Workflow {
  const g = new Graph("7d1b6c2e-4a7e-4f0e-9a51-5c3d2b1a0006");
  g.add(note(NOTE_IMAGE, [-560, 0], [460, 560]));

  const p = requirePreset(STILL_PRESET);
  const [sheet, front] = waltNodes(g, 0, 0);
  const still = g.add(
    nanoBanana({
      title: `${p.title} (with a cast)`,
      prompt: compileImagePrompt({ scene: p.recipe.prompt, cast: [LEAD], camera: p.recipe.camera ?? {}, modelId: MODEL_IDS.nanoBanana }),
      aspect: String(p.recipe.params?.aspectRatio ?? "16:9"),
      images: 2,
      pos: [400, 0],
      seed: 21,
    }),
  );
  g.link(sheet, 0, still, "model.images.image_1");
  g.link(front, 0, still, "model.images.image_2");
  const saveStill = g.add(saveImage("portraius/image/still", [880, 0]));
  g.link(still, 0, saveStill, "images");
  g.group("A cast in a scene: references, then the compiled prompt", [-20, -60, 1260, 920]);

  const y = 1000;
  const source = g.add(loadImage(EDIT_SOURCE, "Image to edit", [0, y]));
  const satchel = g.add(loadImage(SATCHEL_FILE, "Element sheet", [0, y + 420]));
  const edit = g.add(
    nanoBanana({
      title: "Edit the image",
      prompt: compileImagePrompt({ scene: EDIT_SCENE, cast: [elementMember("prop")], camera: {}, modelId: MODEL_IDS.nanoBanana, editing: true }),
      aspect: "4:5",
      images: 2,
      pos: [400, y],
      seed: 22,
    }),
  );
  g.link(source, 0, edit, "model.images.image_1");
  g.link(satchel, 0, edit, "model.images.image_2");
  const saveEdit = g.add(saveImage("portraius/image/edit", [880, y]));
  g.link(edit, 0, saveEdit, "images");
  g.group("Edit an image: the source is image 1, the cast follows", [-20, y - 60, 1260, 920]);
  return g.build();
}

// ---- Video studio: text, references, animate an image ----

export const TEXT_SCENE = "Fishing boats rock at their moorings in a small harbour at dawn while gulls wheel over the masts";
export const TEXT_CAMERA: CameraSelection = { size: "EWS", movement: "crane-up", lighting: "golden-hour" };
const REFERENCES_PRESET = "product-reveal";
export const ANIMATE_SCENE = "He turns a page of his paperback, then glances up at the rain on the window";

const NOTE_VIDEO = `## Portraius Studio: the Video studio

**Text (top row).** Seedance 2.5, the app's default for video without people: a 480p draft first. Copy the draft_task_id from "Preview as Text" into "Seedance 2.5 final", turn it and its Save Video on (Ctrl+B), and run again for the 1080p final.

**Use references (middle row).** The "${requirePreset(REFERENCES_PRESET).title}" preset with an element's sheet as {product}. Any cast in references mode renders on MiniMax H3 in the app, because Seedance refuses photoreal people, so this does too. Put the sheet in as \`${SATCHEL_FILE}\`.

**Animate an image (bottom row).** A frame with a face goes to MiniMax H3. A frame without people goes to Seedance 2.5 instead: see the second row of still-first-video. Put the frame in as \`${EDIT_SOURCE}\`.

${PARTNER}`;

export function videoStudioWorkflow(): Workflow {
  const g = new Graph("7d1b6c2e-4a7e-4f0e-9a51-5c3d2b1a0007");
  g.add(note(NOTE_VIDEO, [-560, 0], [460, 560]));

  const draft = g.add({
    type: "ByteDance2TextToVideoNode",
    title: "Seedance 2.5 draft (480p)",
    pos: [0, 0],
    size: [450, 420],
    outputs: [
      { name: "VIDEO", type: "VIDEO" },
      { name: "draft_task_id", type: "STRING" },
    ],
    widgets: [
      ["model", "Seedance 2.5 Draft"],
      ["model.prompt", compileVideoPrompt({ scene: TEXT_SCENE, cast: [], camera: TEXT_CAMERA, modelId: MODEL_IDS.seedance, withReferences: false })],
      ["model.resolution", "480p"],
      ["model.ratio", "16:9"],
      ["model.duration", 5],
      ["model.generate_audio", true],
      ["model.output_format", "mp4"],
      ["seed", 2025],
      // Fixed, so running again for the final doesn't draw a new draft.
      ["ui:control_after_generate", "fixed"],
      ["watermark", false],
    ],
  });
  const saveDraft = g.add(saveVideo("video/portraius-text-draft", [480, 0]));
  g.link(draft, 0, saveDraft, "video");
  const taskId = g.add(previewText([480, 420]));
  g.link(draft, 1, taskId, "source");
  const final = g.add(seedanceFinal([960, 0]));
  const saveFinal = g.add(saveVideo("video/portraius-text-final", [960, 220], 4));
  g.link(final, 0, saveFinal, "video");
  g.group("Text: a Seedance 2.5 draft, then the final from its ID", [-20, -60, 1420, 700]);

  let y = 800;
  const p = requirePreset(REFERENCES_PRESET);
  const product = elementMember(String(p.recipe.slots[0]?.slot ?? "product"));
  const satchel = g.add(loadImage(SATCHEL_FILE, "Element sheet", [0, y]));
  const references = g.add(
    h3Reference({
      title: "MiniMax H3 (references)",
      prompt: compileVideoPrompt({ scene: p.recipe.prompt, cast: [product], camera: p.recipe.camera ?? {}, modelId: MODEL_IDS.minimaxH3, withReferences: true }),
      pos: [400, y],
      ratio: String(p.recipe.params?.ratio ?? "16:9"),
      duration: Number(p.recipe.params?.durationSec ?? 5),
      seed: 31,
      images: 1,
    }),
  );
  g.link(satchel, 0, references, "model.reference_images.image_1");
  const saveReferences = g.add(saveVideo("video/portraius-references", [880, y]));
  g.link(references, 0, saveReferences, "video");
  g.group(`Use references: the ${p.title} preset`, [-20, y - 60, 1340, 520]);

  y = 1400;
  const frame = g.add(loadImage(EDIT_SOURCE, "First frame", [0, y]));
  const animate = g.add(
    h3FirstLast({
      title: "MiniMax H3 (a face in the frame)",
      prompt: compileVideoPrompt({ scene: ANIMATE_SCENE, cast: [], camera: { movement: "slow-push-in" }, modelId: MODEL_IDS.minimaxH3, withReferences: false }),
      pos: [400, y],
      duration: 5,
      seed: 32,
    }),
  );
  g.link(frame, 0, animate, "first_frame");
  const saveAnimate = g.add(saveVideo("video/portraius-animate", [880, y]));
  g.link(animate, 0, saveAnimate, "video");
  g.group("Animate an image", [-20, y - 60, 1340, 500]);
  return g.build();
}

// ---- Recast ----

// The Tour's Recast clip: a designed performer, 1344×768 and 8 s.
export const RECAST_CLIP = { file: "concert-original.mp4", width: 1344, height: 768, durationSec: 8 };
export const SWAP_CLIP = "my-product-clip.mp4";
export const MOTION_PRESET = "concert-stage";
const STYLE_PRESET = "claymation";
const SWAP_PRESET = "product-swap";

const NOTE_RECAST = `## Portraius Studio: Recast

A clip keeps its motion and camera while a character takes over, the look changes or one thing is swapped. Only use clips you filmed or have the rights to.

**Motion transfer with a new setting (top row).** The "${requirePreset(MOTION_PRESET).title}" preset: MiniMax H3 performs the clip as Walt, HappyHorse moves him to a concert stage (H3 keeps the clip's setting, so the app runs this as a second step), and the clip's own audio goes back on, as the music-video presets do. ${INPUTS} The clip is \`${RECAST_CLIP.file}\` from \`public/samples/\`.

**Style swap (middle row).** The "${requirePreset(STYLE_PRESET).title}" preset on the same clip, with no cast.

**Object swap (bottom row).** The "${requirePreset(SWAP_PRESET).title}" preset on HappyHorse: put a clip of someone holding a product in as \`${SWAP_CLIP}\` and the replacement's sheet as \`${SATCHEL_FILE}\`. Set the edit's ratio to your clip's shape. HappyHorse's node has no setting to keep the original audio, so the graph puts it back.

H3 runs ${LIMITS.motion.minSec} to ${LIMITS.motion.maxSec} s: set each H3 node's duration to your clip's length. ${PARTNER}`;

// The edited frames with the source clip's audio: what the app does with
// ffmpeg after a recast (lib/studio/recast.ts, muxAudio) and what
// HappyHorse's "keep the original audio" does on Router.
function withSourceAudio(g: Graph, edited: number, source: number, x: number, y: number): number {
  const frames = g.add(videoComponents("Edited frames", [x, y]));
  g.link(edited, 0, frames, "video");
  const original = g.add(videoComponents("Original audio", [x, y + 220]));
  g.link(source, 0, original, "video");
  const joined = g.add(createVideo("Edit with the original audio", [x + 360, y]));
  g.link(frames, 0, joined, "images");
  g.link(frames, 2, joined, "fps");
  g.link(original, 1, joined, "audio");
  return joined;
}

export function recastWorkflow(): Workflow {
  const g = new Graph("7d1b6c2e-4a7e-4f0e-9a51-5c3d2b1a0008");
  g.add(note(NOTE_RECAST, [-560, 0], [460, 720]));
  const ratio = nearestRatio(RECAST_CLIP.width, RECAST_CLIP.height);
  const duration = Math.min(LIMITS.motion.maxSec, Math.max(LIMITS.motion.minSec, Math.round(RECAST_CLIP.durationSec)));

  // Motion transfer, then the setting, then the original audio.
  const motion = requirePreset(MOTION_PRESET);
  const clip = g.add(loadVideo(RECAST_CLIP.file, "Clip to recast", [0, 0]));
  const [sheet, front] = waltNodes(g, 0, 400);
  const performer = g.add(
    h3Reference({
      title: "MiniMax H3 (motion transfer)",
      prompt: compileVideoPrompt({ scene: motion.recipe.prompt, cast: [LEAD], camera: {}, modelId: MODEL_IDS.minimaxH3, withReferences: true }),
      pos: [400, 0],
      ratio,
      duration,
      seed: 41,
      images: 2,
      videos: 1,
    }),
  );
  g.link(sheet, 0, performer, "model.reference_images.image_1");
  g.link(front, 0, performer, "model.reference_images.image_2");
  g.link(clip, 0, performer, "model.reference_videos.video_1");
  const savePerformer = g.add(saveVideo("video/portraius-recast-performer", [400, 500]));
  g.link(performer, 0, savePerformer, "video");
  const setting = g.add(happyHorseEdit({ title: "HappyHorse (new setting)", prompt: settingPrompt(String(motion.recipe.params?.setting)), pos: [880, 0], ratio, seed: 42, images: 0 }));
  g.link(performer, 0, setting, "video");
  const withAudio = withSourceAudio(g, setting, clip, 1360, 0);
  const saveMotion = g.add(saveVideo("video/portraius-recast", [2080, 0]));
  g.link(withAudio, 0, saveMotion, "video");
  g.group(`Motion transfer, a new setting and the original audio: ${motion.title}`, [-20, -60, 2540, 1300]);

  // Style swap on the same clip.
  let y = 1400;
  const style = requirePreset(STYLE_PRESET);
  const styled = g.add(
    h3Reference({
      title: `MiniMax H3 (${style.title.toLowerCase()})`,
      prompt: compileVideoPrompt({ scene: style.recipe.prompt, cast: [], camera: {}, modelId: MODEL_IDS.minimaxH3, withReferences: true }),
      pos: [400, y],
      ratio,
      duration,
      seed: 43,
      images: 0,
      videos: 1,
    }),
  );
  g.link(clip, 0, styled, "model.reference_videos.video_1");
  const saveStyle = g.add(saveVideo("video/portraius-recast-style", [880, y]));
  g.link(styled, 0, saveStyle, "video");
  g.group(`Style swap: ${style.title}`, [360, y - 60, 960, 520]);

  // Object swap: the preset's slot becomes "the prop", as the app sends it.
  y = 2000;
  const swap = requirePreset(SWAP_PRESET);
  const target = String(swap.recipe.slots[0]?.slot ?? "replacement");
  const swapClip = g.add(loadVideo(SWAP_CLIP, "Clip with the product", [0, y]));
  const replacement = g.add(loadImage(SATCHEL_FILE, "Replacement sheet", [0, y + 400]));
  const swapped = g.add(happyHorseEdit({ title: "HappyHorse (object swap)", prompt: swap.recipe.prompt.replace(/\{([a-z][a-z0-9_-]*)\}/g, () => target), pos: [400, y], ratio: "16:9", seed: 44, images: 1 }));
  g.link(swapClip, 0, swapped, "video");
  g.link(replacement, 0, swapped, "model.reference_images.image1");
  const swapAudio = withSourceAudio(g, swapped, swapClip, 880, y);
  const saveSwap = g.add(saveVideo("video/portraius-recast-swap", [1600, y]));
  g.link(swapAudio, 0, saveSwap, "video");
  g.group(`Object swap: ${swap.title}`, [-20, y - 60, 2080, 880]);
  return g.build();
}

// ---- Make it real ----

const NOTE_REAL = `## Portraius Studio: make it real

The realism pass from Finishing: skin texture and a touch of grain on one still, at the app's default strength (${DEFAULT_STRENGTH}). The app calls Freepik's skin enhancer in its faithful mode; this is Magnific's Skin Enhancer node in its faithful mode with the same three settings. Magnific is Freepik's, so it's very likely the same model, but that isn't confirmed.

Put the still in \`ComfyUI/input/\` as \`${EDIT_SOURCE}\`. \`public/samples/walt-diner-real.jpg\` is the app's result for it. The app scores the result against the character again; the graph doesn't.

${PARTNER}`;

export function makeItRealWorkflow(): Workflow {
  const g = new Graph("7d1b6c2e-4a7e-4f0e-9a51-5c3d2b1a0009");
  g.add(note(NOTE_REAL, [-560, 0], [460, 420]));
  // The adapter's own mapping from strength to the three settings.
  const settings = freepikSkin.buildBody({ image: { mime: "image/jpeg", base64: "-" }, strength: DEFAULT_STRENGTH }) as { skin_detail: number; sharpen: number; smart_grain: number };
  const still = g.add(loadImage(EDIT_SOURCE, "Still", [0, 0]));
  const skin = g.add({
    type: "MagnificImageSkinEnhancerNode",
    title: "Skin enhancer (faithful)",
    pos: [380, 0],
    size: [340, 200],
    inputs: [{ name: "image", type: "IMAGE" }],
    outputs: [{ name: "IMAGE", type: "IMAGE" }],
    widgets: [
      ["sharpen", settings.sharpen],
      ["smart_grain", settings.smart_grain],
      ["mode", "faithful"],
      ["mode.skin_detail", settings.skin_detail],
    ],
  });
  g.link(still, 0, skin, "image");
  const save = g.add(saveImage("portraius/real", [780, 0]));
  g.link(skin, 0, save, "images");
  return g.build();
}

// ---- Add a line: voice, then lip sync or a new speaking clip ----

export const LINE = "I wrote this forty years ago, and I never sent it.";
// About how long George takes to say it. H3 runs the line's length plus a moment.
export const LINE_SEC = 3;
export const LIP_SYNC_CLIP = "walt-looks-up.mp4";
// The app's "George" stock voice (presets/voices.json), as ComfyUI lists it.
const VOICE = "George (male, british)";
export const SPEAKING_SCENE = "{lead} sits in the corner booth of a late-night diner and looks across the table";
export const SPEAKING_CAMERA: CameraSelection = { size: "MCU", lens: "50mm" };

const NOTE_LINE = `## Portraius Studio: add a line

A stock voice speaks the line (ElevenLabs v4), then it goes into a clip one of two ways, as in the app's Finishing panel.

**Lip sync (middle row).** sync.so's Sync-3 moves the mouth of a finished clip to the line. The longer of the two is cut to the shorter, the app's setting. Put the clip in as \`${LIP_SYNC_CLIP}\` (in \`public/samples/\`).

**A new speaking clip (bottom row).** MiniMax H3 takes the cast's references plus the line as reference audio, and the prompt asks the speaker's lips to follow it. ${INPUTS} Set H3's duration to the line's length plus a second (4 to 15 s).

The app sends the line to ElevenLabs' dialogue endpoint; the node uses text to speech with the same model and voice. ${PARTNER}`;

export function addALineWorkflow(): Workflow {
  const g = new Graph("7d1b6c2e-4a7e-4f0e-9a51-5c3d2b1a0010");
  g.add(note(NOTE_LINE, [-560, 0], [460, 520]));
  const voice = g.add({ type: "ElevenLabsVoiceSelector", title: "Voice", pos: [0, 0], size: [320, 80], outputs: [{ name: "voice", type: "ELEVENLABS_VOICE" }], widgets: [["voice", VOICE]] });
  const speech = g.add({
    type: "ElevenLabsTextToSpeech",
    title: "The line (ElevenLabs v4)",
    pos: [380, 0],
    size: [380, 320],
    inputs: [{ name: "voice", type: "ELEVENLABS_VOICE" }],
    outputs: [{ name: "AUDIO", type: "AUDIO" }],
    widgets: [
      ["text", LINE],
      ["stability", 0.5],
      ["apply_text_normalization", "auto"],
      ["model", "eleven_v4"],
      ["model.similarity_boost", 0.75],
      ["language_code", ""],
      ["seed", 1],
      ["ui:control_after_generate", "randomize"],
      ["output_format", "mp3_44100_192"],
    ],
  });
  g.link(voice, 0, speech, "voice");
  const saveLine = g.add({
    type: "SaveAudioAdvanced",
    title: "Save audio",
    pos: [820, 0],
    size: [300, 160],
    inputs: [{ name: "audio", type: "AUDIO" }],
    outputs: [{ name: "audio", type: "AUDIO" }],
    widgets: [
      ["filename_prefix", "audio/portraius-line"],
      ["format", "mp3"],
      ["format.quality", "V0"],
    ],
  });
  g.link(speech, 0, saveLine, "audio");
  g.group("The line", [-20, -60, 1160, 420]);

  let y = 460;
  const clip = g.add(loadVideo(LIP_SYNC_CLIP, "Clip to lip-sync", [0, y]));
  const body = sync3.buildBody({ videoUrl: "https://-", audioUrl: "https://-" }) as { options?: { sync_mode?: string } };
  const syncMode = body.options?.sync_mode ?? "cut_off";
  const lipSync = g.add({
    type: "SyncLipSyncNode",
    title: "Sync-3 lip sync",
    pos: [400, y],
    size: [360, 280],
    inputs: [
      { name: "video", type: "VIDEO" },
      { name: "audio", type: "AUDIO" },
    ],
    outputs: [{ name: "VIDEO", type: "VIDEO" }],
    widgets: [
      ["seed", 42],
      ["ui:control_after_generate", "randomize"],
      ["model", "sync-3"],
      ["model.sync_mode", syncMode],
      ["model.speaker_selection", "default"],
      ["model.speaker_frame", 0],
      ["model.speaker_x", 0],
      ["model.speaker_y", 0],
    ],
  });
  g.link(clip, 0, lipSync, "video");
  g.link(speech, 0, lipSync, "audio");
  const saveLipSync = g.add(saveVideo("video/portraius-lip-sync", [820, y]));
  g.link(lipSync, 0, saveLipSync, "video");
  g.group("Lip sync a finished clip", [-20, y - 60, 1280, 500]);

  y = 1060;
  const [sheet, front] = waltNodes(g, 0, y);
  const speaking = g.add(
    h3Reference({
      title: "MiniMax H3 (speaking clip)",
      prompt: compileVideoPrompt({ scene: speakingScene(SPEAKING_SCENE, "lead"), cast: [LEAD], camera: SPEAKING_CAMERA, modelId: MODEL_IDS.minimaxH3, withReferences: true }),
      pos: [400, y],
      ratio: "16:9",
      duration: speakingDuration(LINE_SEC),
      seed: 51,
      images: 2,
      audios: 1,
    }),
  );
  g.link(sheet, 0, speaking, "model.reference_images.image_1");
  g.link(front, 0, speaking, "model.reference_images.image_2");
  g.link(speech, 0, speaking, "model.reference_audios.audio_1");
  const saveSpeaking = g.add(saveVideo("video/portraius-speaking", [880, y]));
  g.link(speaking, 0, saveSpeaking, "video");
  g.group("A new speaking clip", [-20, y - 60, 1340, 920]);
  return g.build();
}

// ---- The Director's scene: The Letter, from the Tour ----

// Built the way the Tour builds it, with a fixed seed so the files don't change.
const scene = () => sampleScene("walt", 1000);

// ---- Kling one-take ----

const NOTE_ONE_TAKE = `## Portraius Studio: Kling one-take

The Director's one-take: Kling 3.0 Omni shoots the whole scene as one clip, one storyboard per shot, from the Tour's sample scene "${scene().title}". Each shot's prompt names its references with Kling's \`<<<image_n>>>\` tokens, then adds the location and camera while it fits in ${MAX_SHOT_PROMPT} characters, as the app does.

${INPUTS}

The app sends the references as separate images. ComfyUI's node takes one batch, and Batch Images makes every image the first one's size, so the front view is padded to the sheet's shape first rather than cropped. The storyboards' lengths must add up to the node's duration (15 s at most). 720p is the app's setting (Kling's "std"). ${PARTNER}`;

export function klingOneTakeWorkflow(): Workflow {
  const g = new Graph("7d1b6c2e-4a7e-4f0e-9a51-5c3d2b1a0011");
  g.add(note(NOTE_ONE_TAKE, [-560, 0], [460, 520]));
  const s = scene();
  const durations = oneTakeDurations(s.shots.map((shot) => shot.durationSec));
  const prompts = compileOneTakeShots({
    shots: s.shots.map((shot) => ({ scene: shot.action, camera: shotCamera(s, shot, true) })),
    cast: [LEAD],
    location: s.location,
    modelId: MODEL_IDS.klingOmni,
    limit: MAX_SHOT_PROMPT,
  });
  const [sheet, front] = waltNodes(g, 0, 0);
  const padded = g.add({
    type: "ResizeAndPadImage",
    title: "Pad the front view to 16:9",
    pos: [360, 420],
    size: [300, 200],
    inputs: [{ name: "image", type: "IMAGE" }],
    outputs: [{ name: "IMAGE", type: "IMAGE" }],
    widgets: [
      ["target_width", 1920],
      ["target_height", 1080],
      ["padding_color", "white"],
      ["interpolation", "lanczos"],
    ],
  });
  g.link(front, 0, padded, "image");
  const batch = g.add({
    type: "BatchImagesNode",
    title: "Batch Images",
    pos: [720, 0],
    size: [240, 140],
    inputs: [0, 1, 2].map((i) => ({ name: `images.image${i}`, type: "IMAGE", optional: i > 1, label: `image${i}` })),
    outputs: [{ name: "IMAGE", type: "IMAGE" }],
  });
  g.link(sheet, 0, batch, "images.image0");
  g.link(padded, 0, batch, "images.image1");
  const kling = g.add({
    type: "KlingOmniProImageToVideoNode",
    title: "Kling 3.0 Omni one-take",
    pos: [1020, 0],
    size: [440, 760],
    inputs: [{ name: "reference_images", type: "IMAGE" }],
    outputs: [{ name: "VIDEO", type: "VIDEO" }],
    widgets: [
      ["model_name", "kling-v3-omni"],
      // Ignored with storyboards, as the app's one-take sends it.
      ["prompt", s.title],
      ["aspect_ratio", "16:9"],
      ["duration", durations.reduce((t, d) => t + d, 0)],
      ["resolution", "720p"],
      ["storyboards", `${prompts.length} storyboard${prompts.length > 1 ? "s" : ""}`],
      ...prompts.flatMap((prompt, i): [string, string | number][] => [
        [`storyboards.storyboard_${i + 1}_prompt`, prompt],
        [`storyboards.storyboard_${i + 1}_duration`, durations[i]!],
      ]),
      ["generate_audio", s.sound],
      ["seed", s.seed],
      ["ui:control_after_generate", "randomize"],
    ],
  });
  g.link(batch, 0, kling, "reference_images");
  const save = g.add(saveVideo("video/portraius-one-take", [1520, 0]));
  g.link(kling, 0, save, "video");
  return g.build();
}

// ---- Director scene: anchors, a take per shot, then one cut ----

const NOTE_DIRECTOR = `## Portraius Studio: a Director scene

The Tour's sample scene "${scene().title}", shot the way the Director does it: an anchor still per shot (Nano Banana 2.1 at 2K, Fast, the Director's setting), each animated from its anchor, then the takes joined in order. ${INPUTS}

Every shot here has Walt in its first frame, so each renders on MiniMax H3; a shot without people would take Seedance 2.5's draft and final (see still-first-video). The app draws 2 to 4 anchors per shot for you to pick from; the graph draws one.

Concatenate Video makes straight cuts only: the app's export can also crossfade. A "continue" shot, which starts on the previous shot's last frame, isn't in this scene. ${PARTNER}`;

export function directorSceneWorkflow(): Workflow {
  const g = new Graph("7d1b6c2e-4a7e-4f0e-9a51-5c3d2b1a0012");
  g.add(note(NOTE_DIRECTOR, [-560, 0], [460, 520]));
  const s = scene();
  const [sheet, front] = waltNodes(g, 0, 0);
  const takes = s.shots.map((shot, i) => {
    const y = i * 820;
    const anchor = g.add(
      nanoBanana({
        title: `Shot ${i + 1} anchor`,
        prompt: compileImagePrompt({ scene: shotScene(s, shot), cast: [LEAD], camera: shotCamera(s, shot, false), modelId: MODEL_IDS.nanoBanana }),
        aspect: s.ratio,
        images: 2,
        pos: [400, y],
        seed: shotSeed(s, shot),
        quality: "fast",
      }),
    );
    g.link(sheet, 0, anchor, "model.images.image_1");
    g.link(front, 0, anchor, "model.images.image_2");
    const saveAnchor = g.add(saveImage(`portraius/director/shot-${i + 1}-anchor`, [880, y]));
    g.link(anchor, 0, saveAnchor, "images");
    const take = g.add(
      h3FirstLast({
        title: `Shot ${i + 1} take (MiniMax H3)`,
        prompt: compileVideoPrompt({ scene: shotScene(s, shot), cast: [LEAD], camera: shotCamera(s, shot, true), modelId: MODEL_IDS.minimaxH3, withReferences: false }),
        pos: [1260, y],
        duration: Math.min(15, Math.max(4, shot.durationSec)),
        seed: shotSeed(s, shot),
      }),
    );
    g.link(anchor, 0, take, "first_frame");
    return take;
  });
  const join = g.add({
    type: "ConcatenateVideo",
    title: "Join the takes (straight cuts)",
    pos: [1740, 0],
    size: [320, 200],
    inputs: [
      ...Array.from({ length: takes.length + 1 }, (_, i) => ({ name: `videos.video${i}`, type: "VIDEO", optional: i >= takes.length, label: `video${i}` })),
      { name: "complete_audio", type: "AUDIO", optional: true },
    ],
    outputs: [{ name: "VIDEO", type: "VIDEO" }],
    widgets: [["codec", "auto"]],
  });
  takes.forEach((take, i) => g.link(take, 0, join, `videos.video${i}`));
  const save = g.add(saveVideo("video/portraius-scene", [2120, 0]));
  g.link(join, 0, save, "video");
  return g.build();
}

// ---- Draft shots with AI ----

const NOTE_DRAFT = `## Portraius Studio: draft shots with AI

The Director's "Draft with AI": Claude Sonnet 5.5 reads the scene card and plans 3 to 6 shots. The system prompt and the scene card are the app's own, for the Tour's sample scene with its shots cleared. Edit the card in the prompt for your scene.

The app asks for structured output against a JSON schema and checks every shot before it lands in the shot list. The node can't take a schema, so the schema is written into the prompt, and the plan comes back as text, saved as JSON. It can't drive the rest of the graph: copy the shots into director-scene by hand.

${PARTNER}`;

export function draftShotsWorkflow(): Workflow {
  const g = new Graph("7d1b6c2e-4a7e-4f0e-9a51-5c3d2b1a0013");
  g.add(note(NOTE_DRAFT, [-560, 0], [460, 420]));
  const s = { ...scene(), shots: [] };
  const body = agentRequest(s, [{ slot: LEAD.slot, name: LEAD.name, kind: LEAD.kind, description: LEAD.description! }]) as {
    max_tokens: number;
    system: string;
    messages: { content: string }[];
    output_config: { effort: string; format: { schema: unknown } };
  };
  const prompt = `${body.messages[0]!.content}\n\nReply with only a JSON object that fits this JSON schema, and no other text:\n${JSON.stringify(body.output_config.format.schema)}`;
  const claude = g.add({
    type: "ClaudeNode",
    title: "Claude Sonnet 5.5 (shot list)",
    pos: [0, 0],
    size: [460, 560],
    inputs: [{ name: "images.image_1", type: "IMAGE", optional: true, label: "image_1" }],
    outputs: [{ name: "STRING", type: "STRING" }],
    widgets: [
      ["prompt", prompt],
      ["model", "Sonnet 5.5"],
      ["model.max_tokens", body.max_tokens],
      ["model.reasoning_effort", body.output_config.effort],
      ["seed", 0],
      ["ui:control_after_generate", "randomize"],
      ["system_prompt", body.system],
    ],
  });
  const preview = g.add(previewText([520, 0]));
  g.link(claude, 0, preview, "source");
  const saveText = g.add({
    type: "SaveText",
    title: "Save the shot list",
    pos: [520, 220],
    size: [360, 140],
    inputs: [{ name: "text", type: "STRING" }],
    outputs: [{ name: "text", type: "STRING" }],
    widgets: [
      ["filename_prefix", "portraius/shot-list"],
      ["format", "json"],
    ],
  });
  g.link(claude, 0, saveText, "text");
  return g.build();
}
