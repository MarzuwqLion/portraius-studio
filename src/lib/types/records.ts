// Records stored in IndexedDB. Records hold blob IDs, never Blobs.

export type ConsentRecord = {
  subjectName: string;
  method: "self-check";
  statement: string;                  // the exact text the subject accepted
  acceptedAt: string;
  challenge: string[];                // e.g. ["turn-left", "smile", "look-up"]
  checkClip?: string;                 // path inside the zip, if kept
  matchScore: number;                 // check clip face vs source photos
  appVersion: string;
};

export type CharacterFile = {
  format: "portraius.character";
  version: 1;
  id: string;                         // uuid
  kind: "person" | "element"; origin: "photos" | "designed";
  elementType?: "outfit" | "prop" | "location" | "style";
  name: string;
  description: string;                // user-written, inserted into prompts
  createdAt: string;
  updatedAt: string;
  photos: { path: string; width: number; height: number }[];
  sheet: {
    composite: string;
    views: { front: string; threeQuarter: string; profile: string; fullBody: string; expressions?: string };
    model: string;                    // model ID that drew it
  };
  identity?: { descriptors: number[][]; mean: number[]; model: string; threshold: number };
  consent?: ConsentRecord;            // generation is blocked for a person without it
  voice?: { provider: "elevenlabs"; voiceId: string; label: string };
  tags: string[];
};

// A character with its files: what a .portraius zip holds.
export interface CharacterBundle {
  file: CharacterFile;
  // Zip path to bytes: photos, sheet images, thumb and (optionally) the consent clip.
  files: Map<string, Blob>;
}

export interface CharacterRecord {
  id: string;
  kind: CharacterFile["kind"];
  name: string;
  updatedAt: string;
  file: CharacterFile;
  // Path inside the .portraius zip -> blob ID.
  blobIds: Record<string, string>;
  // An import without a valid consent record can't be used in any generation.
  locked: boolean;
}

export type AssetKind = "image" | "video" | "audio" | "frame";

export interface GenerationAsset {
  blobId: string;
  kind: AssetKind;
  mime: string;
  bytes: number;
}

export interface Generation {
  id: string;
  type: "image" | "video" | "recast" | "scene";
  modelId: string;
  jobId: string;
  characterIds: string[];
  recipeId?: string;
  remixOf?: string;                // remixed from a shared recipe: its hash, for attribution
  identityScore?: number;          // the weakest cast member's score (video: median over frames)
  identityScores?: Record<string, number | null>;  // per character; null when their face wasn't found
  worstScore?: number;             // video: the lowest single frame
  scoreNote?: "stylised";          // scoring skipped for a stylised look
  assets: GenerationAsset[];
  prompt?: string;
  createdAt: number;
}

export interface Recipe {
  format: "portraius.recipe";
  version: 1;
  capability: string;
  model: string;
  slots: { slot: string; kind: "person" | "element" }[];
  prompt: string;
  camera?: Record<string, string>;
  params?: Record<string, unknown>;
  seed?: number;
}

export interface RecipeRecord {
  id: string;
  capability: string;
  source: "preset" | "mine" | "remix";
  updatedAt: number;
  recipe: Recipe;
}

export interface BlobRecord {
  id: string;
  blob: Blob;
  mime: string;
  bytes: number;
}

export interface Settings {
  id: "app";
  keyStorage: "session" | "device";
  // Set only when keyStorage is "device" ("Remember on this device").
  rememberedKey?: string;
  theme: "system" | "light" | "dark";
  autoRetry: boolean;
  keepDrafts: boolean;
  // The local engine (spec: Local engine). Unindexed, so no Dexie version.
  localEnabled?: boolean;
  localUrl?: string;
  neverSpend?: boolean;
  // A model ID per feature (lib/registry/availability.ts).
  defaultModels?: Record<string, string>;
}

export const DEFAULT_SETTINGS: Settings = {
  id: "app",
  keyStorage: "session",
  theme: "dark",
  autoRetry: true,
  keepDrafts: true,
};
