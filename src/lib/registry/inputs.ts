// App-level inputs (spec: Adapter contract). UI code talks in these; each
// adapter turns them into its model's native body.

// An image after browser prep (2048 px long edge, JPEG 90, EXIF stripped),
// as raw base64 with no data: prefix.
export interface InlineImage {
  mime: string;
  base64: string;
}

export type ImageAspectRatio =
  | "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9" | "21:9"
  | "1:4" | "4:1" | "1:8" | "8:1";

export interface GenerateImageInput {
  prompt: string;              // compiled by lib/prompts/compile.ts
  references: InlineImage[];   // in the order the prompt's reference legend names them
  source?: InlineImage;        // edit mode: sent before the references
  aspectRatio: ImageAspectRatio;
  size: "1K" | "2K" | "4K";
  quality: "fast" | "best";
}

export type VideoRatio = "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9";

// Every clip starts as a 480p draft; the final is rendered from the draft's ID.
export interface GenerateVideoInput {
  stage: "draft";
  prompt: string;
  firstFrame?: string;         // data URI or public URL
  lastFrame?: string;          // needs firstFrame
  referenceImages?: string[];  // data URIs or public URLs
  referenceVideos?: string[];  // public URLs only (lib/media/host.ts)
  referenceAudios?: string[];  // data URIs or public URLs
  durationSec: number | "auto";
  ratio?: VideoRatio;          // ignored with a first frame: the frame's shape decides
  generateAudio: boolean;
  seed?: number;
}

export interface RenderFinalInput {
  stage: "final";
  draftTaskId: string;
}

export type VideoInput = GenerateVideoInput | RenderFinalInput;
