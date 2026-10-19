// Sync-3 lip sync (P2). Inputs are public URLs only. Built in M7.
import type { AdapterImpl } from "@/lib/registry/capabilities";
import { notBuilt } from "./not-built";

export interface Sync3Result {
  outputUrl?: string;
}

export const sync3: AdapterImpl<unknown, Sync3Result> = {
  capabilities: ["video.lipsync"],
  delivery: "queue",
  limits: {},
  buildBody: () => notBuilt("Sync-3", "M7"),
  // Sync Labs' own link, not rehosted.
  extractAssets: (raw) => (raw.outputUrl ? [{ kind: "video", url: raw.outputUrl }] : []),
};
