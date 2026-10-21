// What a studio opens with when the Tour's "Try this with Walt" sends someone
// there (spec: Decisions, October 21, item 11): a preset, a cast, and for
// Recast the sample clip. It travels in the router's navigation state, not the
// URL, so the routes in Contracts don't change; a reload simply drops it.
import type { CastPick } from "./cast";

export interface Launch {
  presetId?: string;
  cast?: CastPick[];
  sampleClip?: boolean; // Recast: start from public/samples/concert-original.mp4
}

export function launchOf(state: unknown): Launch | undefined {
  if (!state || typeof state !== "object") return undefined;
  const s = state as Record<string, unknown>;
  const cast = Array.isArray(s.cast)
    ? s.cast.filter((c): c is CastPick => Boolean(c) && typeof (c as CastPick).slot === "string" && typeof (c as CastPick).characterId === "string")
    : undefined;
  const launch: Launch = {
    ...(typeof s.presetId === "string" ? { presetId: s.presetId } : {}),
    ...(cast?.length ? { cast } : {}),
    ...(s.sampleClip === true ? { sampleClip: true } : {}),
  };
  return Object.keys(launch).length ? launch : undefined;
}

export const SAMPLE_CLIP = "concert-original.mp4";
