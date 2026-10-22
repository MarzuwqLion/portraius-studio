// Builds the ComfyUI API prompts the local adapters send (spec: Local engine,
// Rules 3). Node names and inputs follow ComfyUI master of October 2026 and
// Comfy's own templates for each model; npm run local:check holds every graph
// against a ComfyUI's /object_info. Network-free: files become uploads that
// lib/router/local.ts sends at submit.
import type { AssetRef } from "@/lib/registry/capabilities";
import type { InlineImage } from "@/lib/registry/inputs";
import { LOCAL_INPUT, type LocalBody, type LocalPrompt, type LocalResult, type LocalUpload, type LocalValue } from "@/lib/registry/local-body";
import type { ModelFile } from "@/lib/registry/local-models";

export type Link = [string, number];

// Wan's usual negative prompt, as Comfy's Wan templates ship it.
export const WAN_NEGATIVE =
  "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走";

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
};

// FNV-1a, twice with different seeds: a stable name for the same bytes, so a
// retry overwrites its own upload instead of adding another.
function hash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

export class LocalGraph {
  private readonly prompt: LocalPrompt = {};
  private readonly uploads = new Map<string, LocalUpload>();
  private next = 1;

  add(classType: string, inputs: Record<string, LocalValue | Link>, title?: string): string {
    const id = String(this.next++);
    this.prompt[id] = { class_type: classType, inputs, ...(title ? { _meta: { title } } : {}) };
    return id;
  }

  // An input file for a loader: one already in the ComfyUI (local-input:...),
  // a data URI, or an inline image. Returns the name the loader takes.
  file(ref: string | InlineImage, fallbackMime: string): string {
    if (typeof ref === "string" && ref.startsWith(LOCAL_INPUT)) return ref.slice(LOCAL_INPUT.length);
    let mime = fallbackMime;
    let data: string;
    if (typeof ref === "string") {
      if (!ref.startsWith("data:")) throw new RangeError("A local model takes files as data, or as files already in your ComfyUI, not as links.");
      mime = ref.slice(5, ref.indexOf(";")) || fallbackMime;
      data = ref;
    } else {
      mime = ref.mime;
      data = ref.base64;
    }
    const name = `portraius-${hash(data)}.${EXTENSION[mime] ?? "bin"}`;
    this.uploads.set(name, { name, mime, data });
    return name;
  }

  body(): LocalBody {
    return { prompt: this.prompt, uploads: [...this.uploads.values()] };
  }
}

export const out = (node: string, index = 0): Link => [node, index];

// ---- Shared nodes ----

export const unet = (g: LocalGraph, file: ModelFile) => g.add("UNETLoader", { unet_name: file.name, weight_dtype: "default" });
export const clip = (g: LocalGraph, file: ModelFile, type: string) => g.add("CLIPLoader", { clip_name: file.name, type, device: "default" });
export const vae = (g: LocalGraph, file: ModelFile) => g.add("VAELoader", { vae_name: file.name });
export const lora = (g: LocalGraph, model: Link, file: ModelFile, strength = 1) => g.add("LoraLoaderModelOnly", { model, lora_name: file.name, strength_model: strength });
export const text = (g: LocalGraph, clipNode: string, prompt: string) => g.add("CLIPTextEncode", { text: prompt, clip: out(clipNode) });
export const loadImage = (g: LocalGraph, ref: string | InlineImage) => g.add("LoadImage", { image: g.file(ref, "image/jpeg") });
export const loadVideo = (g: LocalGraph, ref: string) => g.add("LoadVideo", { file: g.file(ref, "video/mp4") });
export const loadAudio = (g: LocalGraph, ref: string) => g.add("LoadAudio", { audio: g.file(ref, "audio/wav") });

export function saveImage(g: LocalGraph, images: Link, prefix: string): string {
  return g.add("SaveImage", { images, filename_prefix: `portraius/${prefix}` });
}

export function saveVideo(g: LocalGraph, images: Link, fps: number | Link, prefix: string, audio?: Link): string {
  const video = g.add("CreateVideo", { images, fps, ...(audio ? { audio } : {}) });
  return g.add("SaveVideo", { video: out(video), filename_prefix: `portraius/${prefix}`, format: "auto", "format.codec": "auto" });
}

// ---- Sizes ----

// "16:9" as a number.
export function ratioValue(ratio: string): number {
  const [w, h] = ratio.split(":").map(Number);
  return w && h ? w / h : 1;
}

// A width and height near `megapixels` with this shape, each a multiple of `step`.
export function frameSize(aspect: number, megapixels: number, step: number): [number, number] {
  const pixels = megapixels * 1024 * 1024;
  const round = (v: number) => Math.max(step, Math.round(v / step) * step);
  return [round(Math.sqrt(pixels * aspect)), round(Math.sqrt(pixels / aspect))];
}

// Frames for a clip: video models take 4n + 1.
export function frameCount(seconds: number, fps: number): number {
  return Math.max(5, Math.round((seconds * fps) / 4) * 4 + 1);
}

// ---- Results ----

const KIND_BY_EXTENSION: Record<string, AssetRef["kind"]> = {
  png: "image", jpg: "image", jpeg: "image", webp: "image",
  mp4: "video", webm: "video", mov: "video", mkv: "video",
  flac: "audio", wav: "audio", mp3: "audio", opus: "audio", m4a: "audio",
};

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mkv: "video/x-matroska",
  flac: "audio/flac", wav: "audio/wav", mp3: "audio/mpeg", opus: "audio/ogg", m4a: "audio/mp4",
};

// The files of one kind a finished local job saved, in node order.
export function localAssets(raw: LocalResult, kind: AssetRef["kind"]): AssetRef[] {
  const refs: AssetRef[] = [];
  const nodes = Object.keys(raw?.outputs ?? {}).sort((a, b) => Number(a) - Number(b));
  for (const node of nodes) {
    for (const file of raw.outputs[node]!.files) {
      const extension = file.filename.split(".").pop()?.toLowerCase() ?? "";
      if (KIND_BY_EXTENSION[extension] !== kind) continue;
      refs.push({ kind, url: file.url, ...(MIME_BY_EXTENSION[extension] ? { mime: MIME_BY_EXTENSION[extension] } : {}) });
    }
  }
  return refs;
}

// The text a finished local job showed (Preview as Text).
export function localText(raw: LocalResult): string {
  return Object.values(raw?.outputs ?? {})
    .flatMap((o) => o.text)
    .join("\n")
    .trim();
}
