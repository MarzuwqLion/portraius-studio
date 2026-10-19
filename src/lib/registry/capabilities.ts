// Spec: Model registry and Comfy Router integration, Adapter contract.

export type Capability =
  | "image.generate" | "image.edit" | "character.sheet"
  | "video.generate" | "video.edit" | "video.multishot"
  | "image.enhance" | "audio.tts" | "video.lipsync" | "text.plan" | "vision.judge";

export interface AssetRef {
  kind: "image" | "video" | "audio" | "frame";
  url?: string;        // expiring link, download immediately
  base64?: string;     // inline bytes
  mime?: string;
}

export type ModelId = `${string}/${string}`;

export interface ModelAdapter<I, Raw> {
  id: ModelId;                          // canonical Router model ID
  capabilities: Capability[];
  delivery: "queue" | "sync";
  limits: { maxRefImages?: number; durationSec?: [number, number]; resolutions?: string[] };
  buildBody(input: I): unknown;         // app input -> model-native JSON
  extractAssets(raw: Raw): AssetRef[];  // native result -> assets to download
}

// What an adapter module exports. The registry attaches the model ID, so IDs
// stay in lib/registry/models.ts.
export type AdapterImpl<I, Raw> = Omit<ModelAdapter<I, Raw>, "id">;
