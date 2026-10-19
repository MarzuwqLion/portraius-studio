// MiniMax H3 (selectable video model, never the default). Built in M3.
import type { AdapterImpl } from "@/lib/registry/capabilities";
import { notBuilt } from "./not-built";

export interface MinimaxH3Result {
  task?: { content?: { url?: string } };
}

export const minimaxH3: AdapterImpl<unknown, MinimaxH3Result> = {
  capabilities: ["video.generate"],
  delivery: "queue",
  limits: { durationSec: [4, 15], resolutions: ["768P", "2K"] },
  buildBody: () => notBuilt("MiniMax H3", "M3"),
  // Rehosted for 12 hours.
  extractAssets: (raw) => (raw.task?.content?.url ? [{ kind: "video", url: raw.task.content.url }] : []),
};
