// Which models each feature can use right now (spec: Local engine, Where
// things run). Pure: the session store feeds it the key, the ComfyUI check and
// the Settings, and the pickers read what it returns.
import { missingFiles, type ModelFile } from "./local-models";
import { MODEL_IDS, registryEntry, type Backend } from "./models";

export type Feature = "characters" | "image" | "video" | "recast" | "enhance" | "speak" | "plan";

export const FEATURES: readonly Feature[] = ["characters", "image", "video", "recast", "enhance", "speak", "plan"];

export const FEATURE_LABEL: Record<Feature, string> = {
  characters: "Character sheets",
  image: "Image",
  video: "Video",
  recast: "Recast",
  enhance: "Make it real",
  speak: "Add a line",
  plan: "Director agent",
};

// Each feature's models, Router's first. Recast and Add a line on Router
// pick their model per mode (MiniMax H3, HappyHorse, Sync-3); the entry here
// stands for that whole path.
export const FEATURE_MODELS: Record<Feature, { router: readonly string[]; local: readonly string[] }> = {
  characters: { router: [MODEL_IDS.nanoBanana], local: [MODEL_IDS.localQwenEdit] },
  image: { router: [MODEL_IDS.nanoBanana], local: [MODEL_IDS.localQwenEdit] },
  video: { router: [MODEL_IDS.seedance, MODEL_IDS.minimaxH3], local: [MODEL_IDS.localWanBest, MODEL_IDS.localWanFast] },
  recast: { router: [MODEL_IDS.minimaxH3], local: [MODEL_IDS.localWanAnimate] },
  enhance: { router: [MODEL_IDS.freepikSkin], local: [MODEL_IDS.localSeedVR2] },
  speak: { router: [MODEL_IDS.minimaxH3], local: [MODEL_IDS.localWanSpeech] },
  plan: { router: [MODEL_IDS.directorAgent], local: [MODEL_IDS.localGemma] },
};

// How a feature's Router path reads in a picker, where one model stands for it.
const ROUTER_PATH_LABEL: Partial<Record<Feature, string>> = {
  recast: "MiniMax H3 and HappyHorse",
  speak: "ElevenLabs and MiniMax H3",
};

export interface Reach {
  hasKey: boolean;
  neverSpend: boolean;
  localEnabled: boolean;
  // What the last check found, or null when the ComfyUI didn't answer (or
  // hasn't been checked yet).
  localInstalled: Partial<Record<ModelFile["folder"], readonly string[]>> | null;
}

export interface ModelOption {
  id: string;
  label: string;
  backend: Backend;
  // Why it can't run now; the picker shows it and the footer blocks the run.
  blocked?: string;
}

export function routerListed(reach: Reach): boolean {
  return !reach.neverSpend && (reach.hasKey || !reach.localEnabled);
}

function localBlock(id: string, reach: Reach): string | undefined {
  if (!reach.localInstalled) return "Your ComfyUI isn't reachable. Check it in Settings.";
  const missing = missingFiles(id, reach.localInstalled);
  return missing.length ? `Missing on your ComfyUI: ${missing.map((f) => f.name).join(", ")}` : undefined;
}

export function featureOptions(feature: Feature, reach: Reach): ModelOption[] {
  const options: ModelOption[] = [];
  if (reach.localEnabled) {
    for (const id of FEATURE_MODELS[feature].local) {
      const blocked = localBlock(id, reach);
      options.push({ id, label: registryEntry(id)?.label ?? id, backend: "local", ...(blocked ? { blocked } : {}) });
    }
  }
  if (routerListed(reach)) {
    for (const id of FEATURE_MODELS[feature].router) {
      options.push({ id, label: ROUTER_PATH_LABEL[feature] ?? registryEntry(id)?.label ?? id, backend: "router" });
    }
  }
  return options;
}

// The saved default when it's listed; otherwise Router's with a key, then the
// first local model, then Router's (a first visit, which prompts for a key).
export function defaultModel(feature: Feature, reach: Reach, saved?: string): string {
  const options = featureOptions(feature, reach);
  if (saved && options.some((o) => o.id === saved)) return saved;
  const router = options.find((o) => o.backend === "router");
  if (reach.hasKey && router) return router.id;
  return options.find((o) => o.backend === "local")?.id ?? router?.id ?? FEATURE_MODELS[feature].router[0]!;
}

// The Router path for a feature, when a local model isn't picked.
export const routerDefault = (feature: Feature) => FEATURE_MODELS[feature].router[0]!;
