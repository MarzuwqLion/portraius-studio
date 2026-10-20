// Freepik skin enhancer (spec: Finishing, Realism pass). One still in, the
// same still with real skin texture out. A "Strength" slider scales the three
// settings together; 80 gives the spec's defaults.
import type { AdapterImpl } from "@/lib/registry/capabilities";
import type { EnhanceImageInput } from "@/lib/registry/inputs";
import type { FreepikAiSkinEnhancerFaithful as Schema } from "@/lib/registry/schemas";

type SkinBody = Schema.operations["runRouterModel"]["requestBody"]["content"]["application/json"];
export type FreepikSkinResult = Schema.components["schemas"]["FreepikTaskResponse"];

export const DEFAULT_STRENGTH = 80;

export const freepikSkin: AdapterImpl<EnhanceImageInput, FreepikSkinResult> = {
  capabilities: ["image.enhance"],
  delivery: "queue",
  limits: {},

  buildBody(input): SkinBody {
    if (!input.image.base64) throw new RangeError("The realism pass needs an image.");
    const strength = Math.min(100, Math.max(0, Math.round(input.strength)));
    return {
      // Raw base64: what the M1 check sent, and Freepik's "Base64 encoding".
      image: input.image.base64,
      skin_detail: strength,
      sharpen: Math.round(strength / 8),
      smart_grain: Math.round(strength / 20),
    };
  },

  // Freepik's own links (Magnific's CDN), not rehosted: download at once.
  extractAssets: (raw) => (raw.data?.generated ?? []).map((url) => ({ kind: "image" as const, url })),
};
