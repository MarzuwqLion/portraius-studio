// One request per local model and mode, built from the Tour's designed
// character (Walt Harmon) and sample clips. npm run local:check holds their
// graphs against a ComfyUI's node definitions; npm run local:smoke runs them
// on a real GPU; the tests check their shape.
import { SHEET_PROMPT, viewPrompt } from "@/lib/characters/sheet";
import type { AnimateInput, EnhanceImageInput, GenerateImageInput, InlineImage, LocalTextInput, SpeakInput, WanInput } from "@/lib/registry/inputs";
import { MODEL_IDS } from "@/lib/registry/models";

export interface SampleFiles {
  front: InlineImage;   // walt-front.jpg
  sheet: InlineImage;   // walt-sheet.jpg
  still: InlineImage;   // walt-diner.jpg, a finished 16:9 still
  clip: string;         // concert-original.mp4 as a data URI (or local-input:)
  line: string;         // audio to speak, as a data URI (or local-input:); a clip's sound works
}

export interface LocalSample {
  name: string;
  modelId: string;
  input: unknown;
  kind: "image" | "video" | "text";
}

const dataUri = (image: InlineImage) => `data:${image.mime};base64,${image.base64}`;

export function localSamples(files: SampleFiles): LocalSample[] {
  const still = (prompt: string, references: InlineImage[], extra: Partial<GenerateImageInput> = {}): GenerateImageInput => ({
    prompt,
    references,
    aspectRatio: "16:9",
    size: "1K",
    quality: "fast",
    seed: 7,
    ...extra,
  });
  const wan = (extra: Partial<WanInput>): WanInput => ({
    stage: "generate",
    prompt: "A man in a diner looks up from a sealed envelope toward the door, and almost smiles. Slow push in.",
    durationSec: 3,
    aspect: 16 / 9,
    seed: 7,
    ...extra,
  });
  const animate: AnimateInput = {
    prompt: "Character appearance description: the man in the reference image, same face and hair. Background description: a small jazz club stage under warm spotlights.",
    motion: "a person performing on stage",
    performer: files.front,
    clip: files.clip,
    durationSec: 4,
    aspect: 16 / 9,
    seed: 7,
  };
  const speak: SpeakInput = {
    prompt: "The man speaks the words in the audio, looking into the camera, in a quiet diner.",
    image: dataUri(files.still),
    audio: files.line,
    durationSec: 4,
    aspect: 16 / 9,
    seed: 7,
  };
  const enhance: EnhanceImageInput = { image: files.still, strength: 80 };
  const plan: LocalTextInput = {
    system: "You plan shots for a short film. Answer with JSON only.",
    prompt: 'Plan two shots for: "Walt reads a letter in a diner at night." Answer as {"shots":[{"action":"...","seconds":5}]}.',
    maxTokens: 512,
    seed: 7,
  };
  const judge: LocalTextInput = {
    prompt: 'Left: a character reference sheet. Right: a generated still. Is it the same person? Answer as {"same_subject":true,"confidence":0.9,"notes":"..."}.',
    images: [files.sheet, files.still],
    maxTokens: 256,
    seed: 7,
  };
  return [
    { name: "qwen sheet composite", modelId: MODEL_IDS.localQwenEdit, kind: "image", input: still(SHEET_PROMPT, [files.front, files.sheet, files.still], { quality: "best" }) },
    { name: "qwen sheet view", modelId: MODEL_IDS.localQwenEdit, kind: "image", input: still(viewPrompt("profile"), [files.front, files.sheet], { aspectRatio: "4:5" }) },
    { name: "qwen still with a cast", modelId: MODEL_IDS.localQwenEdit, kind: "image", input: still("Image 1 is a front portrait of LEAD. Keep LEAD's exact face. LEAD stands on a pier at dawn, wind in his coat.", [files.front]) },
    { name: "qwen edit", modelId: MODEL_IDS.localQwenEdit, kind: "image", input: still("Image 1 is the image to edit. Make it night outside the window, with rain.", [], { source: files.still }) },
    { name: "wan 5B text", modelId: MODEL_IDS.localWanFast, kind: "video", input: wan({}) },
    { name: "wan 5B first frame", modelId: MODEL_IDS.localWanFast, kind: "video", input: wan({ firstFrame: dataUri(files.still) }) },
    { name: "wan 14B text", modelId: MODEL_IDS.localWanBest, kind: "video", input: wan({}) },
    { name: "wan 14B first frame", modelId: MODEL_IDS.localWanBest, kind: "video", input: wan({ firstFrame: dataUri(files.still) }) },
    { name: "wan 14B first and last frame", modelId: MODEL_IDS.localWanBest, kind: "video", input: wan({ firstFrame: dataUri(files.still), lastFrame: dataUri(files.front) }) },
    { name: "wan animate recast", modelId: MODEL_IDS.localWanAnimate, kind: "video", input: animate },
    { name: "wan s2v speaking clip", modelId: MODEL_IDS.localWanSpeech, kind: "video", input: speak },
    { name: "seedvr2 make it real", modelId: MODEL_IDS.localSeedVR2, kind: "image", input: enhance },
    { name: "gemma director plan", modelId: MODEL_IDS.localGemma, kind: "text", input: plan },
    { name: "gemma identity judge", modelId: MODEL_IDS.localGemma, kind: "text", input: judge },
  ];
}
