// BFL video edit (Object Swap candidate, M4 A/B). Text-guided only: it takes
// no reference image, so the replacement has to be described in words.
import type { AdapterImpl, AssetRef } from "@/lib/registry/capabilities";
import type { VideoEditInput } from "@/lib/registry/inputs";
import type { BflVideoEditV1 as Schema } from "@/lib/registry/schemas";

type BflBody = Schema.operations["runRouterModel"]["requestBody"]["content"]["application/json"];
export type BflEditResult = Schema.components["schemas"]["BFLFlux3ResultResponse"];

export const bflEdit: AdapterImpl<VideoEditInput, BflEditResult> = {
  capabilities: ["video.edit"],
  delivery: "queue",
  limits: {},
  buildBody(input): BflBody {
    return { prompt: input.prompt, video: input.videoUrl };
  },
  extractAssets(raw): AssetRef[] {
    return raw.result?.sample ? [{ kind: "video", url: raw.result.sample }] : [];
  },
};
