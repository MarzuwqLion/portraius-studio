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

// quiet: a background re-check, which leaves the card as it is until the answer comes.
export async function verifyLocal(options: { quiet?: boolean } = {}): Promise<boolean> {
  if (!options.quiet) useEngineStore.setState({ check: "checking", error: undefined });
  try {
    const info = await checkLocal(FOLDERS);
    useEngineStore.setState({ check: "ok", info });
    return true;
  } catch (err) {
    useEngineStore.setState({ check: "unreachable", info: undefined, error: errorText(toAppError(err)) });
    return false;
  }
}

// The ComfyUI was only checked at start and from Settings, so one started
// after the app, or back after a restart, read "isn't reachable" everywhere
// until Check again (4090 app checks, October 23). It's checked again when
// the tab comes back into view, every 15 s while it's unreachable, and every
// minute while it's fine, which is how a running job learns it went away.
const RECHECK_UNREACHABLE_MS = 15_000;
const RECHECK_OK_MS = 60_000;

export function watchLocal(): () => void {
  let last = 0;
  const recheck = (force: boolean) => {
    const { localEnabled, check } = useEngineStore.getState();
    if (!localEnabled || check === "checking") return;
    const due = check === "unreachable" ? RECHECK_UNREACHABLE_MS : RECHECK_OK_MS;
    if (!force && Date.now() - last < due) return;
    last = Date.now();
    void verifyLocal({ quiet: true });
  };
  const onVisible = () => document.visibilityState === "visible" && recheck(true);
  document.addEventListener("visibilitychange", onVisible);
  const timer = setInterval(() => recheck(false), 5_000);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    clearInterval(timer);
  };
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
