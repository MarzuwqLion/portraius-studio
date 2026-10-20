// Sync-3 lip sync (spec: Finishing, Lip sync; P2). A finished clip and the
// line it should speak, both as public URLs only (lib/media/host.ts). With
// sync_mode "cut_off" the longer of the two is cut to the shorter.
import type { AdapterImpl, AssetRef } from "@/lib/registry/capabilities";
import type { LipSyncInput } from "@/lib/registry/inputs";
import type { SynclabsSync3 as Schema } from "@/lib/registry/schemas";

type LipSyncBody = Schema.operations["runRouterModel"]["requestBody"]["content"]["application/json"];
export type Sync3Result = Schema.components["schemas"]["SyncLabsGeneration"];

const isPublic = (url: string) => /^https:\/\//.test(url);

export const sync3: AdapterImpl<LipSyncInput, Sync3Result> = {
  capabilities: ["video.lipsync"],
  delivery: "queue",
  limits: {},

  buildBody(input): LipSyncBody {
    if (!isPublic(input.videoUrl) || !isPublic(input.audioUrl)) throw new RangeError("Sync-3 takes the clip and the line as public links only.");
    return {
      input: [
        { type: "video", url: input.videoUrl },
        { type: "audio", url: input.audioUrl },
      ],
      options: { sync_mode: "cut_off" },
    };
  },

  // Sync Labs' own link, not rehosted: download at once.
  extractAssets(raw): AssetRef[] {
    return raw.outputUrl ? [{ kind: "video", url: raw.outputUrl }] : [];
  },
};
