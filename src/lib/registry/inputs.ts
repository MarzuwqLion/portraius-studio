// App-level inputs (spec: Adapter contract). UI code talks in these; each
// adapter turns them into its model's native body.

// An image after browser prep (2048 px long edge, JPEG 90, EXIF stripped),
// as raw base64 with no data: prefix.
export interface InlineImage {
  mime: "image/png" | "image/jpeg" | "image/webp";
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
  seed?: number;
}

export type VideoRatio = "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9" | "9:21";

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

// MiniMax H3: no draft mode, 4 to 15 s, 768P or 2K. Keyframes and reference
// media can't be mixed in one request.
export interface H3Input {
  stage: "generate";
  prompt: string;
  firstFrame?: string;
  lastFrame?: string;
  referenceImages?: string[];
  referenceVideos?: string[];
  durationSec: number;
  ratio?: VideoRatio;          // required for text to video; ignored with a first frame
  resolution: "768P" | "2K";
  seed?: number;
}

// Kling V3 Omni: reference images are named <<<image_1>>>... and a video
// <<<video_1>>> in the prompt. A video is a motion reference ("feature") or
// the clip to edit ("base", which keeps the clip's own length).
export interface KlingInput {
  prompt: string;
  referenceImages?: string[];  // raw base64 or public URLs
  firstFrame?: string;
  endFrame?: string;           // needs firstFrame
  video?: { url: string; use: "feature" | "base"; keepSound?: boolean };
  durationSec?: number;        // 3 to 15; ignored when editing a clip
  ratio?: "16:9" | "9:16" | "1:1"; // required without a first frame
  quality: "std" | "pro";      // 720p or 1080p
  sound?: boolean;
  // One-take multi-shot (Director): 1 to 6 shots in one clip, each with its
  // own prompt (512 characters at most) and whole seconds. They replace
  // `prompt` and `durationSec`, and add up to 3 to 15 s.
  shots?: { prompt: string; durationSec: number }[];
}

// A text- or image-guided edit of one clip (Object Swap candidates).
export interface VideoEditInput {
  prompt: string;
  videoUrl: string;            // public URL (lib/media/host.ts)
  referenceImageUrl?: string;  // public URL of the replacement; BFL takes none
  keepAudio?: boolean;
}

// The realism pass on one still (Freepik skin enhancer). Strength runs 0 to
// 100; 80 gives the spec's defaults (skin detail 80, sharpen 10, grain 4).
export interface EnhanceImageInput {
  image: InlineImage;
  strength: number;
}
