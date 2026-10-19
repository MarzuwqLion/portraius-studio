// Kling V3 Omni (multi-shot and video edit). Built in M4.
import type { AdapterImpl } from "@/lib/registry/capabilities";
import { notBuilt } from "./not-built";

export interface KlingOmniResult {
  data?: { task_result?: { videos?: { url?: string }[] } };
}

export const klingOmni: AdapterImpl<unknown, KlingOmniResult> = {
  capabilities: ["video.multishot", "video.edit"],
  delivery: "queue",
  limits: { durationSec: [3, 10] },
  buildBody: () => notBuilt("Kling V3 Omni", "M4"),
  extractAssets: (raw) =>
    (raw.data?.task_result?.videos ?? []).flatMap((video) => (video.url ? [{ kind: "video" as const, url: video.url }] : [])),
};
