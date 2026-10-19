// MiniMax H3 (spec: Video studio). The selectable second video model,
// labelled "H3 (2K)" and never the default: 4 to 15 s at 768P or 2K, no draft
// mode, and keyframe roles can't be mixed with reference roles.
import type { AdapterImpl, AssetRef } from "@/lib/registry/capabilities";
import type { H3Input } from "@/lib/registry/inputs";
import type { MinimaxMinimaxH3 as Schema } from "@/lib/registry/schemas";

type H3Body = Schema.operations["runRouterModel"]["requestBody"]["content"]["application/json"];
type ContentItem = Schema.components["schemas"]["MinimaxV2ContentItem"];
export type MinimaxH3Result = Schema.components["schemas"]["MinimaxV2TaskResultResponse"];

const DURATION: [number, number] = [4, 15];

export const minimaxH3: AdapterImpl<H3Input, MinimaxH3Result> = {
  capabilities: ["video.generate"],
  delivery: "queue",
  limits: { durationSec: DURATION, resolutions: ["768P", "2K"] },

  buildBody(input): H3Body {
    const [min, max] = DURATION;
    if (!Number.isInteger(input.durationSec) || input.durationSec < min || input.durationSec > max) {
      throw new RangeError(`H3 clips run ${min} to ${max} seconds.`);
    }
    const keyframes = Boolean(input.firstFrame || input.lastFrame);
    const references = Boolean(input.referenceImages?.length || input.referenceVideos?.length);
    if (keyframes && references) throw new RangeError("H3 takes a first or last frame, or reference media, not both.");
    if (input.lastFrame && !input.firstFrame) throw new RangeError("A last frame needs a first frame.");
    if (!keyframes && !input.ratio) throw new RangeError("Text to video on H3 needs an aspect ratio.");

    const content: ContentItem[] = [{ type: "text", text: input.prompt }];
    if (input.firstFrame) content.push({ type: "image_url", role: "first_frame", image_url: { url: input.firstFrame } });
    if (input.lastFrame) content.push({ type: "image_url", role: "last_frame", image_url: { url: input.lastFrame } });
    for (const url of input.referenceImages ?? []) content.push({ type: "image_url", role: "reference_image", image_url: { url } });
    for (const url of input.referenceVideos ?? []) content.push({ type: "video_url", role: "reference_video", video_url: { url } });

    return {
      content,
      duration: input.durationSec,
      resolution: input.resolution,
      // A first frame decides the shape; text to video needs a fixed ratio.
      ratio: keyframes ? "adaptive" : input.ratio!,
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
    };
  },

  // Rehosted for 12 hours.
  extractAssets(raw): AssetRef[] {
    const url = raw.task?.content?.url;
    return url ? [{ kind: "video", url }] : [];
  },
};
