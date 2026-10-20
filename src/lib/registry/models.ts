// The only file that holds Router model IDs. Nothing here may start with
// higgsfield/, and no call ever sends model_provider.
import type { Capability, ModelId } from "./capabilities";

export const MODEL_IDS = {
  nanoBanana: "vertexai/gemini-nano-banana-2.1",
  seedance: "byteplus/dreamina-seedance-2-5-260628",
  minimaxH3: "minimax/minimax-h3",
  klingOmni: "kling/kling-v3-omni",
  freepikSkin: "freepik/ai-skin-enhancer-faithful",
  elevenLabs: "elevenlabs/eleven_v4",
  sync3: "synclabs/sync-3",
  // Object Swap candidates, A/B-tested against Kling in M4 (docs/notes/recast-ab.md).
  wanVideoEdit: "wan/wan2.7-videoedit",
  happyHorseEdit: "wan/happyhorse-1.0-video-edit",
  bflVideoEdit: "bfl/video-edit-v1",
  directorAgent: "anthropic/claude-sonnet-5-5",
  identityJudge: "vertexai/gemini-3.8-flash",
} as const satisfies Record<string, ModelId>;

export type RegistryModelId = (typeof MODEL_IDS)[keyof typeof MODEL_IDS];

export interface RegistryEntry {
  id: RegistryModelId;
  label: string;
  capabilities: Capability[];
  delivery: "queue" | "sync";
}

export const REGISTRY: readonly RegistryEntry[] = [
  { id: MODEL_IDS.nanoBanana, label: "Nano Banana 2.1", capabilities: ["character.sheet", "image.generate", "image.edit"], delivery: "queue" },
  { id: MODEL_IDS.seedance, label: "Seedance 2.5", capabilities: ["video.generate"], delivery: "queue" },
  { id: MODEL_IDS.minimaxH3, label: "MiniMax H3", capabilities: ["video.generate"], delivery: "queue" },
  { id: MODEL_IDS.klingOmni, label: "Kling V3 Omni", capabilities: ["video.multishot", "video.edit"], delivery: "queue" },
  { id: MODEL_IDS.freepikSkin, label: "Skin enhancer", capabilities: ["image.enhance"], delivery: "queue" },
  { id: MODEL_IDS.elevenLabs, label: "ElevenLabs v4", capabilities: ["audio.tts"], delivery: "sync" },
  { id: MODEL_IDS.sync3, label: "Sync-3", capabilities: ["video.lipsync"], delivery: "queue" },
  { id: MODEL_IDS.wanVideoEdit, label: "Wan 2.7 video edit", capabilities: ["video.edit"], delivery: "queue" },
  { id: MODEL_IDS.happyHorseEdit, label: "HappyHorse 1.0 video edit", capabilities: ["video.edit"], delivery: "queue" },
  { id: MODEL_IDS.bflVideoEdit, label: "BFL video edit", capabilities: ["video.edit"], delivery: "queue" },
  { id: MODEL_IDS.directorAgent, label: "Claude Sonnet 5.5", capabilities: ["text.plan"], delivery: "sync" },
  { id: MODEL_IDS.identityJudge, label: "Gemini 3.8 Flash", capabilities: ["vision.judge"], delivery: "sync" },
];

// Seedance 2.5 is the default for video without people. It refuses photoreal
// people as input images (M3 notes), so every video with a person in it
// renders on MiniMax H3 (Marzuwq's decision, October 19).
export const DEFAULT_IMAGE_MODEL = MODEL_IDS.nanoBanana;
export const DEFAULT_VIDEO_MODEL = MODEL_IDS.seedance;
export const PEOPLE_VIDEO_MODEL = MODEL_IDS.minimaxH3;

// Not a Router model: the "model" of a Director scene joined in the browser.
// Kept out of REGISTRY, so the Router client never accepts it.
export const SCENE_EXPORT_ID = "portraius/director-export";
export const SCENE_EXPORT_LABEL = "Director scene (joined in the browser)";

export function modelLabel(id: string): string {
  return id === SCENE_EXPORT_ID ? SCENE_EXPORT_LABEL : (registryEntry(id)?.label ?? id);
}

const BLOCKED_PROVIDERS = ["higgsfield"];

export function isAllowedModel(id: string): id is RegistryModelId {
  const provider = id.split("/")[0]?.toLowerCase() ?? "";
  if (BLOCKED_PROVIDERS.includes(provider)) return false;
  return REGISTRY.some((entry) => entry.id === id);
}

export function registryEntry(id: string): RegistryEntry | undefined {
  return REGISTRY.find((entry) => entry.id === id);
}
