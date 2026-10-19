// ElevenLabs v4 voice (P2). Sync only: the response body is the audio. Built in M7.
import type { AdapterImpl } from "@/lib/registry/capabilities";
import { notBuilt } from "./not-built";

export const elevenLabs: AdapterImpl<unknown, unknown> = {
  capabilities: ["audio.tts"],
  delivery: "sync",
  limits: {},
  buildBody: () => notBuilt("ElevenLabs", "M7"),
  extractAssets: () => notBuilt("ElevenLabs", "M7"),
};
