// Wan 2.7 and HappyHorse 1.0 video edit (Object Swap candidates, M4 A/B).
// Both take the clip and an optional reference image as media items.
import type { AdapterImpl, AssetRef } from "@/lib/registry/capabilities";
import type { VideoEditInput } from "@/lib/registry/inputs";
import type { WanWan27Videoedit as Schema } from "@/lib/registry/schemas";

type WanBody = Schema.operations["runRouterModel"]["requestBody"]["content"]["application/json"];
export type WanEditResult = Schema.components["schemas"]["WanTaskQueryResponse"];

export const wanEdit: AdapterImpl<VideoEditInput, WanEditResult> = {
  capabilities: ["video.edit"],
  delivery: "queue",
  limits: { resolutions: ["720P"] },
  buildBody(input): WanBody {
    return {
      input: {
        prompt: input.prompt,
        media: [{ type: "video", url: input.videoUrl }, ...(input.referenceImageUrl ? [{ type: "reference_image" as const, url: input.referenceImageUrl }] : [])],
      },
      parameters: { resolution: "720P", audio_setting: input.keepAudio ? "origin" : "auto", prompt_extend: false },
    };
  },
  extractAssets(raw): AssetRef[] {
    const url = raw.output?.video_url ?? raw.output?.results?.find((r) => r.url)?.url;
    return url ? [{ kind: "video", url }] : [];
  },
};
