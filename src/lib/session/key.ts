// The visitor's Comfy API key. sessionStorage by default (cleared when the tab
// closes); "Remember on this device" keeps it in IndexedDB instead. The key is
// handed to the Router client and never put in React state, logs or the URL.
import { create } from "zustand";
import { checkKey, setRouterKey } from "@/lib/router/client";
import { toAppError } from "@/lib/router/errors";
import { getSettings, updateSettings } from "@/lib/store/settings";
import type { AppError } from "@/lib/types/errors";

const SESSION_ITEM = "portraius.comfyKey";

export type KeyLocation = "none" | "session" | "device";
export type KeyCheck = "idle" | "checking" | "ok" | "invalid";

interface KeyState {
  location: KeyLocation;
  check: KeyCheck;
  error?: AppError;
}

export const useKeyStore = create<KeyState>(() => ({ location: "none", check: "idle" }));

const session = {
  get(): string | null {
    try {
      return sessionStorage.getItem(SESSION_ITEM);
    } catch {
      return null;
    }
  },
  set(value: string): void {
    try {
      sessionStorage.setItem(SESSION_ITEM, value);
    } catch {
      // Storage blocked: the key still works until the page reloads.
    }
  },
  remove(): void {
    try {
      sessionStorage.removeItem(SESSION_ITEM);
    } catch {
      // Nothing stored.
    }
  },
};

export async function restoreKey(): Promise<void> {
  const fromSession = session.get();
  if (fromSession) {
    setRouterKey(fromSession);
    useKeyStore.setState({ location: "session", check: "idle", error: undefined });
    return;
  }
  const settings = await getSettings();
  if (settings.keyStorage === "device" && settings.rememberedKey) {
    setRouterKey(settings.rememberedKey);
    useKeyStore.setState({ location: "device", check: "idle", error: undefined });
    return;
  }
  setRouterKey(undefined);
  useKeyStore.setState({ location: "none", check: "idle", error: undefined });
}

export async function saveKey(key: string, remember: boolean): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) return;
  if (remember) {
    await updateSettings({ keyStorage: "device", rememberedKey: trimmed });
    session.remove();
  } else {
    session.set(trimmed);
    await updateSettings({ keyStorage: "session", rememberedKey: undefined });
  }
  setRouterKey(trimmed);
  useKeyStore.setState({ location: remember ? "device" : "session", check: "idle", error: undefined });
}

export async function forgetKey(): Promise<void> {
  session.remove();
  await updateSettings({ keyStorage: "session", rememberedKey: undefined });
  setRouterKey(undefined);
  useKeyStore.setState({ location: "none", check: "idle", error: undefined });
}

export async function verifyKey(): Promise<boolean> {
  useKeyStore.setState({ check: "checking", error: undefined });
  try {
    await checkKey();
    useKeyStore.setState({ check: "ok" });
    return true;
  } catch (err) {
    useKeyStore.setState({ check: "invalid", error: toAppError(err) });
    return false;
  }
}
