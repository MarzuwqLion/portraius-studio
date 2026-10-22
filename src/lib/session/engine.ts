// Where generations run (spec: Local engine): the visitor's ComfyUI, the
// "Never spend credits" switch and a default model per feature. Kept in
// Settings; the ComfyUI's readiness comes from a check, held here.
import { useMemo } from "react";
import { create } from "zustand";
import { FEATURES, defaultModel, featureOptions, type Feature, type ModelOption, type Reach } from "@/lib/registry/availability";
import { allLocalFiles } from "@/lib/registry/local-models";
import { DEFAULT_LOCAL_URL, checkLocal, setLocalUrl, type LocalCheck } from "@/lib/router/client";
import { errorText, toAppError } from "@/lib/router/errors";
import { getSettings, updateSettings } from "@/lib/store/settings";
import { useKeyStore } from "./key";

export type LocalCheckState = "idle" | "checking" | "ok" | "unreachable";

interface EngineState {
  localEnabled: boolean;
  localUrl: string;
  neverSpend: boolean;
  defaults: Record<string, string>;
  check: LocalCheckState;
  info?: LocalCheck;
  error?: string;
}

export const useEngineStore = create<EngineState>(() => ({
  localEnabled: false,
  localUrl: DEFAULT_LOCAL_URL,
  neverSpend: false,
  defaults: {},
  check: "idle",
}));

const FOLDERS = [...new Set(allLocalFiles().map((f) => f.folder))];

export async function restoreEngine(): Promise<void> {
  const settings = await getSettings();
  const localUrl = settings.localUrl ?? DEFAULT_LOCAL_URL;
  const localEnabled = settings.localEnabled === true;
  setLocalUrl(localEnabled ? localUrl : undefined);
  useEngineStore.setState({ localEnabled, localUrl, neverSpend: settings.neverSpend === true, defaults: settings.defaultModels ?? {} });
  if (localEnabled) void verifyLocal();
}

export async function verifyLocal(): Promise<boolean> {
  useEngineStore.setState({ check: "checking", error: undefined });
  try {
    const info = await checkLocal(FOLDERS);
    useEngineStore.setState({ check: "ok", info });
    return true;
  } catch (err) {
    useEngineStore.setState({ check: "unreachable", info: undefined, error: errorText(toAppError(err)) });
    return false;
  }
}

export async function saveLocal(patch: { enabled?: boolean; url?: string }): Promise<void> {
  const state = useEngineStore.getState();
  const localEnabled = patch.enabled ?? state.localEnabled;
  const localUrl = (patch.url ?? state.localUrl).trim().replace(/\/+$/, "") || DEFAULT_LOCAL_URL;
  await updateSettings({ localEnabled, localUrl });
  setLocalUrl(localEnabled ? localUrl : undefined);
  useEngineStore.setState({ localEnabled, localUrl, ...(localEnabled ? {} : { check: "idle", info: undefined, error: undefined }) });
  if (localEnabled) await verifyLocal();
}

export async function saveNeverSpend(neverSpend: boolean): Promise<void> {
  await updateSettings({ neverSpend });
  useEngineStore.setState({ neverSpend });
}

export async function saveDefaultModel(feature: Feature, modelId: string): Promise<void> {
  const defaults = { ...useEngineStore.getState().defaults, [feature]: modelId };
  await updateSettings({ defaultModels: defaults });
  useEngineStore.setState({ defaults });
}

export function reachOf(state: EngineState, hasKey: boolean): Reach {
  return {
    hasKey,
    neverSpend: state.neverSpend,
    localEnabled: state.localEnabled,
    localInstalled: state.check === "ok" && state.info ? state.info.installed : null,
  };
}

// For code outside React: the model a feature runs on now.
export function currentModel(feature: Feature): string {
  const state = useEngineStore.getState();
  return defaultModel(feature, reachOf(state, useKeyStore.getState().location !== "none"), state.defaults[feature]);
}

export interface FeatureModels {
  modelId: string;
  option: ModelOption | undefined;
  options: ModelOption[];
  setModel: (id: string) => void;
}

// A studio's model picker: what's listed, what's picked, and a setter that
// keeps the pick as that feature's default.
export function useFeatureModels(feature: Feature): FeatureModels {
  const engine = useEngineStore();
  const hasKey = useKeyStore((s) => s.location !== "none");
  return useMemo(() => {
    const reach = reachOf(engine, hasKey);
    const options = featureOptions(feature, reach);
    const modelId = defaultModel(feature, reach, engine.defaults[feature]);
    return { modelId, option: options.find((o) => o.id === modelId), options, setModel: (id: string) => void saveDefaultModel(feature, id) };
  }, [engine, hasKey, feature]);
}

export { FEATURES };
