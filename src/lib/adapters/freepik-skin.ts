// Freepik skin enhancer (realism pass, P1). Built in M6.
import type { AdapterImpl } from "@/lib/registry/capabilities";
import { notBuilt } from "./not-built";

export interface FreepikSkinResult {
  data?: { generated?: string[] };
}

export const freepikSkin: AdapterImpl<unknown, FreepikSkinResult> = {
  capabilities: ["image.enhance"],
  delivery: "queue",
  limits: {},
  buildBody: () => notBuilt("skin enhancer", "M6"),
  // Freepik's own links (Magnific's CDN), not rehosted.
  extractAssets: (raw) => (raw.data?.generated ?? []).map((url) => ({ kind: "image" as const, url })),
};
