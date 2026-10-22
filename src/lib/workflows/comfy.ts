// The ComfyUI workflows in workflows/ (spec: ComfyUI workflows): the app's two
// core flows as graphs of partner nodes, in the UI format and the Workflow
// (API) format. They're built here from the app's own prompt code, so a graph
// sends what the app sends; a test keeps the committed files in step. The
// rest of the studio's features are in studio.ts, the builder in graph.ts.
//
// Nano Banana 2.1 is GeminiNanoBanana2V2, Seedance 2.5 is
// ByteDance2FirstLastFrameNode plus ByteDance2DraftToFinalVideoNode, and
// MiniMax H3 is MinimaxHailuo03FirstLastFrameNode.
import { compileImagePrompt, compileVideoPrompt } from "@/lib/prompts/compile";
import type { CameraSelection } from "@/lib/prompts/camera";
import { MODEL_IDS } from "@/lib/registry/models";
import { Graph, LEAD, WALT_FILES, h3FirstLast, loadImage, nanoBanana, note, previewText, saveImage, saveVideo, seedanceFinal, sheetNodes, type Workflow } from "./graph";
import * as studio from "./studio";

// ---- Character sheet: photos to turnaround sheet ----

export const SHEET_PHOTOS = ["my-photo-1.jpg", "my-photo-2.jpg", "my-photo-3.jpg"];

const NOTE_SHEET = `## Portraius Studio: photos to a character sheet

The same calls the app makes when you make a character from photos
(spec: Character vault, Turnaround sheet).

1. Put **3 photos of yourself** in \`ComfyUI/input/\` as ${SHEET_PHOTOS.map((p) => `\`${p}\``).join(", ")}: varied angles, good light, one face each. Add more Load Image nodes for up to 10.
2. Run. Nano Banana 2.1 draws the 16:9 turnaround sheet from every photo, then each single view from the photos plus that sheet.

Only use photos of yourself, or of someone who made their own character and agreed to it. The app adds a webcam consent check and an identity score; this graph has neither.

Needs a Comfy account with credits: these are partner nodes.`;

export function characterSheetWorkflow(): Workflow {
  const g = new Graph("7d1b6c2e-4a7e-4f0e-9a51-5c3d2b1a0001");
  g.add(note(NOTE_SHEET, [-560, 0]));
  const photos = SHEET_PHOTOS.map((file, i) => g.add(loadImage(file, `Photo ${i + 1}`, [0, i * 420])));
  sheetNodes(g, photos, "portraius/sheet");
  return g.build();
}

// ---- Still first video: a character still, then an animated clip ----

export const STILL_FIRST_FILES = WALT_FILES;

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

export function stillFirstVideoWorkflow(): Workflow {
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
  const h3 = g.add(
    h3FirstLast({
      title: "MiniMax H3 (clips with people)",
      prompt: compileVideoPrompt({ scene: SCENE, cast: [LEAD], camera: motion, modelId: MODEL_IDS.minimaxH3, withReferences: false }),
      pos: [880, 420],
      duration: 5,
      seed: 7,
    }),
  );
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
  const taskId = g.add(previewText([1360, y + 420]));
  g.link(draft, 1, taskId, "source");
  const final = g.add(seedanceFinal([1820, y]));
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

export function portraiusStillWorkflow(): Workflow {
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

// Every graph in workflows/, by file name.
export function allWorkflows(): Record<string, Workflow> {
  return {
    "character-sheet": characterSheetWorkflow(),
    "still-first-video": stillFirstVideoWorkflow(),
    "design-from-text": studio.designFromTextWorkflow(),
    "element-sheet": studio.elementSheetWorkflow(),
    "image-studio": studio.imageStudioWorkflow(),
    "video-studio": studio.videoStudioWorkflow(),
    recast: studio.recastWorkflow(),
    "make-it-real": studio.makeItRealWorkflow(),
    "add-a-line": studio.addALineWorkflow(),
    "kling-one-take": studio.klingOneTakeWorkflow(),
    "director-scene": studio.directorSceneWorkflow(),
    "draft-shots": studio.draftShotsWorkflow(),
  };
}
