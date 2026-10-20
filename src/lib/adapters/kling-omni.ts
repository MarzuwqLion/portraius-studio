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
export const MAX_ONE_TAKE_SHOTS = 6;
export const MAX_SHOT_PROMPT = 512;

// Kling takes images as raw base64, not data URIs.
const imageValue = (value: string) => (value.startsWith("data:") ? value.slice(value.indexOf(",") + 1) : value);

function checkShots(shots: NonNullable<KlingInput["shots"]>, editing: boolean): number {
  if (editing) throw new RangeError("A one-take can't edit a clip.");
  if (!shots.length || shots.length > MAX_ONE_TAKE_SHOTS) throw new RangeError(`A one-take has 1 to ${MAX_ONE_TAKE_SHOTS} shots.`);
  for (const shot of shots) {
    if (!shot.prompt.trim() || shot.prompt.length > MAX_SHOT_PROMPT) throw new RangeError(`Each shot's prompt runs 1 to ${MAX_SHOT_PROMPT} characters.`);
    if (!Number.isInteger(shot.durationSec) || shot.durationSec < 1) throw new RangeError("Each shot lasts at least 1 whole second.");
  }
  return shots.reduce((t, s) => t + s.durationSec, 0);
}

export const klingOmni: AdapterImpl<KlingInput, KlingOmniResult> = {
  capabilities: ["video.multishot", "video.edit"],
  delivery: "queue",
  limits: { durationSec: DURATION, resolutions: ["720p", "1080p"] },

  buildBody(input): KlingBody {
    const editing = input.video?.use === "base";
    if (input.endFrame && !input.firstFrame) throw new RangeError("An end frame needs a first frame.");
    if (!input.firstFrame && !input.ratio && !editing) throw new RangeError("Kling needs an aspect ratio without a first frame.");
    const durationSec = input.shots ? checkShots(input.shots, editing) : input.durationSec;
    const [min, max] = DURATION;
    if (!editing && durationSec !== undefined && (!Number.isInteger(durationSec) || durationSec < min || durationSec > max)) {
      throw new RangeError(`Kling clips run ${min} to ${max} seconds.`);
    }
    const images: NonNullable<KlingBody["image_list"]> = [
      ...(input.firstFrame ? [{ image_url: imageValue(input.firstFrame), type: "first_frame" as const }] : []),
      ...(input.endFrame ? [{ image_url: imageValue(input.endFrame), type: "end_frame" as const }] : []),
      ...(input.referenceImages ?? []).map((url) => ({ image_url: imageValue(url) })),
    ];
    return {
      // With multi_shot, Kling ignores `prompt`; each shot carries its own.
      ...(input.shots
        ? {
            multi_shot: true,
            shot_type: "customize" as const,
            multi_prompt: input.shots.map((shot, i) => ({ index: i + 1, prompt: shot.prompt, duration: String(shot.durationSec) })),
          }
        : { prompt: input.prompt }),
      ...(images.length ? { image_list: images } : {}),
      ...(input.video ? { video_list: [{ video_url: input.video.url, refer_type: input.video.use, keep_original_sound: input.video.keepSound ? "yes" : "no" }] } : {}),
      mode: input.quality,
      ...(!editing && durationSec !== undefined ? { duration: String(durationSec) as Duration } : {}),
      ...(!input.firstFrame && input.ratio ? { aspect_ratio: input.ratio } : {}),
      sound: input.sound ? "on" : "off",
    };
  },

  extractAssets(raw): AssetRef[] {
    return (raw.data?.task_result?.videos ?? []).flatMap((video) => (video.url ? [{ kind: "video" as const, url: video.url }] : []));
  },
};
