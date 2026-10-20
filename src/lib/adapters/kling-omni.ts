// Kling V3 Omni (spec: Recast, Director). Motion references, clip edits
// (Object Swap) and first and end frames. It accepts photoreal people, which
// Seedance refuses (M3 notes). Results come from Kling's own CDN, not rehosted.
import type { AdapterImpl, AssetRef } from "@/lib/registry/capabilities";
import type { KlingInput } from "@/lib/registry/inputs";
import type { KlingKlingV3Omni as Schema } from "@/lib/registry/schemas";

type KlingBody = Schema.operations["runRouterModel"]["requestBody"]["content"]["application/json"];
export type KlingOmniResult = Schema.components["schemas"]["KlingQueryTaskResponse"];
type Duration = NonNullable<KlingBody["duration"]>;

const DURATION: [number, number] = [3, 15];

// Kling takes images as raw base64, not data URIs.
const imageValue = (value: string) => (value.startsWith("data:") ? value.slice(value.indexOf(",") + 1) : value);

export const klingOmni: AdapterImpl<KlingInput, KlingOmniResult> = {
  capabilities: ["video.multishot", "video.edit"],
  delivery: "queue",
  limits: { durationSec: DURATION, resolutions: ["720p", "1080p"] },

  buildBody(input): KlingBody {
    const editing = input.video?.use === "base";
    if (input.endFrame && !input.firstFrame) throw new RangeError("An end frame needs a first frame.");
    if (!input.firstFrame && !input.ratio && !editing) throw new RangeError("Kling needs an aspect ratio without a first frame.");
    const [min, max] = DURATION;
    if (!editing && input.durationSec !== undefined && (!Number.isInteger(input.durationSec) || input.durationSec < min || input.durationSec > max)) {
      throw new RangeError(`Kling clips run ${min} to ${max} seconds.`);
    }
    const images: NonNullable<KlingBody["image_list"]> = [
      ...(input.firstFrame ? [{ image_url: imageValue(input.firstFrame), type: "first_frame" as const }] : []),
      ...(input.endFrame ? [{ image_url: imageValue(input.endFrame), type: "end_frame" as const }] : []),
      ...(input.referenceImages ?? []).map((url) => ({ image_url: imageValue(url) })),
    ];
    return {
      prompt: input.prompt,
      ...(images.length ? { image_list: images } : {}),
      ...(input.video ? { video_list: [{ video_url: input.video.url, refer_type: input.video.use, keep_original_sound: input.video.keepSound ? "yes" : "no" }] } : {}),
      mode: input.quality,
      ...(!editing && input.durationSec !== undefined ? { duration: String(input.durationSec) as Duration } : {}),
      ...(!input.firstFrame && input.ratio ? { aspect_ratio: input.ratio } : {}),
      sound: input.sound ? "on" : "off",
    };
  },

  extractAssets(raw): AssetRef[] {
    return (raw.data?.task_result?.videos ?? []).flatMap((video) => (video.url ? [{ kind: "video" as const, url: video.url }] : []));
  },
};
