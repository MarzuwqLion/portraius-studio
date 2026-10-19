// Seedance 2.5 (spec: Video studio, Draft then final). Drafts render at 480p;
// the final submits only the draft's task ID and inherits everything else.
import type { AdapterImpl, AssetRef } from "@/lib/registry/capabilities";
import type { GenerateVideoInput, VideoInput } from "@/lib/registry/inputs";
import type { ByteplusDreaminaSeedance25260628 as Schema } from "@/lib/registry/schemas";

type SeedanceBody = Schema.operations["runRouterModel"]["requestBody"]["content"]["application/json"];
type ContentItem = Schema.components["schemas"]["BytePlusVideoGenerationContent"];
// The schema leaves out the draft flag the result carries (seen in M1).
export type SeedanceResult = Schema.components["schemas"]["BytePlusVideoGenerationQueryResponse"] & { draft?: boolean };

const DURATION: [number, number] = [4, 30];

function duration(input: GenerateVideoInput): number {
  // With a reference video, Seedance may read the prompt as a video edit, which
  // only takes -1 (M1: a fixed duration came back invalid_input).
  if (input.durationSec === "auto" || input.referenceVideos?.length) return -1;
  const [min, max] = DURATION;
  if (!Number.isInteger(input.durationSec) || input.durationSec < min || input.durationSec > max) {
    throw new RangeError(`Seedance clips run ${min} to ${max} seconds.`);
  }
  return input.durationSec;
}

export const seedance: AdapterImpl<VideoInput, SeedanceResult> = {
  capabilities: ["video.generate"],
  delivery: "queue",
  limits: { durationSec: DURATION, resolutions: ["480p", "1080p"] },

  buildBody(input): SeedanceBody {
    if (input.stage === "final") {
      return { content: [{ type: "draft_task", draft_task: { id: input.draftTaskId } }], resolution: "1080p" };
    }
    const frames = Boolean(input.firstFrame || input.lastFrame);
    const referenceVideo = Boolean(input.referenceVideos?.length);
    if (input.lastFrame && !input.firstFrame) throw new RangeError("A last frame needs a first frame.");
    // Unknowns row 8: kept apart until M3 confirms Seedance takes both.
    if (frames && input.referenceImages?.length) throw new RangeError("Use a first frame or reference images, not both.");
    if (input.referenceVideos?.some((url) => !/^(https:|asset:)/.test(url))) {
      throw new RangeError("Reference videos must be public URLs.");
    }

    const content: ContentItem[] = [{ type: "text", text: input.prompt }];
    if (input.firstFrame) content.push({ type: "image_url", role: "first_frame", image_url: { url: input.firstFrame } });
    if (input.lastFrame) content.push({ type: "image_url", role: "last_frame", image_url: { url: input.lastFrame } });
    for (const url of input.referenceImages ?? []) content.push({ type: "image_url", role: "reference_image", image_url: { url } });
    for (const url of input.referenceVideos ?? []) content.push({ type: "video_url", role: "reference_video", video_url: { url } });
    for (const url of input.referenceAudios ?? []) content.push({ type: "audio_url", role: "reference_audio", audio_url: { url } });

    return {
      content,
      draft: true,
      resolution: "480p",
      duration: duration(input),
      // A first frame decides the shape, and a reference video can make the
      // task an edit, which takes only adaptive (M1: "make it a sunny day" with
      // 16:9 came back invalid_input; adaptive rendered).
      ratio: frames || referenceVideo ? "adaptive" : (input.ratio ?? "16:9"),
      generate_audio: input.generateAudio,
      return_last_frame: true,
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
    };
  },

  extractAssets(raw) {
    const assets: AssetRef[] = [];
    if (raw.content?.video_url) assets.push({ kind: "video", url: raw.content.video_url });
    if (raw.content?.last_frame_url) assets.push({ kind: "frame", url: raw.content.last_frame_url });
    return assets;
  },

  draftTaskId(raw) {
    return raw.draft && raw.id ? raw.id : undefined;
  },
};
