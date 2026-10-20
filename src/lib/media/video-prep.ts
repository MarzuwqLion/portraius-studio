// Clip prep with ffmpeg.wasm (spec: What the browser does, Media prep): trim to
// an engine's limits and re-encode to H.264 MP4. The single-thread core is
// self-hosted in public/ffmpeg/ (GitHub Pages can't send the isolation headers
// the multi-thread core needs) and loads on first use.
import type { FFmpeg } from "@ffmpeg/ffmpeg";

let loading: Promise<FFmpeg> | null = null;

export function loadFfmpeg(): Promise<FFmpeg> {
  loading ??= (async () => {
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import("@ffmpeg/ffmpeg"), import("@ffmpeg/util")]);
    const ffmpeg = new FFmpeg();
    const base = `${import.meta.env.BASE_URL}ffmpeg`;
    // Blob URLs, because the worker import()s the core and Vite's dev server
    // won't serve public/ files to import().
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    });
    return ffmpeg;
  })().catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

export interface ClipInfo {
  durationSec: number;
  width: number;
  height: number;
}

// Duration and size from the browser's own decoder; no ffmpeg needed.
export async function clipInfo(blob: Blob): Promise<ClipInfo> {
  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("This clip can't be played in the browser. Try an MP4 or MOV."));
    });
    return { durationSec: video.duration, width: video.videoWidth, height: video.videoHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface TrimOptions {
  startSec: number;
  endSec: number;
  maxHeight?: number;   // scale down past this, keeping the shape
  minHeight?: number;   // scale up to this (Kling's edit input needs 720 px)
  fps?: number;         // resample, e.g. into Kling's 24 to 60 fps
  keepAudio?: boolean;
}

export function trimArgs(input: string, output: string, o: TrimOptions): string[] {
  const filters: string[] = [];
  if (o.maxHeight) filters.push(`scale=-2:'min(ih,${o.maxHeight})'`);
  if (o.minHeight) filters.push(`scale=-2:'max(ih,${o.minHeight})'`);
  if (o.fps) filters.push(`fps=${o.fps}`);
  return [
    "-ss", o.startSec.toFixed(3),
    "-i", input,
    "-t", (o.endSec - o.startSec).toFixed(3),
    ...(filters.length ? ["-vf", filters.join(",")] : []),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
    ...(o.keepAudio ? ["-c:a", "aac", "-b:a", "128k"] : ["-an"]),
    "-movflags", "+faststart",
    output,
  ];
}

// The trimmed, re-encoded clip as an MP4 Blob.
export async function trimClip(source: Blob, options: TrimOptions, onProgress?: (share: number) => void): Promise<Blob> {
  if (options.endSec <= options.startSec) throw new RangeError("The clip needs some length.");
  const ffmpeg = await loadFfmpeg();
  const id = crypto.randomUUID();
  const input = `in-${id}`;
  const output = `out-${id}.mp4`;
  const progress = ({ progress }: { progress: number }) => onProgress?.(Math.min(1, Math.max(0, progress)));
  ffmpeg.on("progress", progress);
  try {
    await ffmpeg.writeFile(input, new Uint8Array(await source.arrayBuffer()));
    const code = await ffmpeg.exec(trimArgs(input, output, options));
    if (code !== 0) throw new Error("The clip couldn't be trimmed. Try another file.");
    const data = await ffmpeg.readFile(output);
    return new Blob([data as Uint8Array<ArrayBuffer>], { type: "video/mp4" });
  } finally {
    ffmpeg.off("progress", progress);
    await ffmpeg.deleteFile(input).catch(() => undefined);
    await ffmpeg.deleteFile(output).catch(() => undefined);
  }
}
