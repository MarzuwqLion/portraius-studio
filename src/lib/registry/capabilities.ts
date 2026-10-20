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

// What a synchronous model that answers with bytes (ElevenLabs) hands its
// adapter: the response body and its Content-Type.
export interface BinaryResult {
  bytes: Uint8Array;
  contentType: string;
}

export interface ModelAdapter<I, Raw> {
  id: ModelId;                          // canonical Router model ID
  capabilities: Capability[];
  delivery: "queue" | "sync";
  limits: { maxRefImages?: number; durationSec?: [number, number]; resolutions?: string[] };
  buildBody(input: I): unknown;         // app input -> model-native JSON
  extractAssets(raw: Raw): AssetRef[];  // native result -> assets to download
  draftTaskId?(raw: Raw): string | undefined;  // models with draft then final (Seedance 2.5)
}

// What an adapter module exports. The registry attaches the model ID, so IDs
// stay in lib/registry/models.ts.
export type AdapterImpl<I, Raw> = Omit<ModelAdapter<I, Raw>, "id">;
