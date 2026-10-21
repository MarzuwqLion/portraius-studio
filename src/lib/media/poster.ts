// Poster stills (Decisions, October 21, U5, item 9): the first frame of a
// clip as a WebP, for browsers that can't play H.264 (or won't, like iOS
// Safari in Low Power Mode) and would otherwise show an empty box. Made by
// npm run posters and npm run thumbnails in a headless browser, decoding with
// ffmpeg.wasm so it works without the browser's own H.264 decoder.
import { loadFfmpeg } from "./video-prep";

// The clip's first frame, as a PNG.
export async function firstFrame(clip: Blob): Promise<Blob> {
  const ffmpeg = await loadFfmpeg();
  const id = crypto.randomUUID();
  const input = `poster-in-${id}.mp4`;
  const output = `poster-out-${id}.png`;
  try {
    await ffmpeg.writeFile(input, new Uint8Array(await clip.arrayBuffer()));
    const code = await ffmpeg.exec(["-i", input, "-frames:v", "1", output]);
    if (code !== 0) throw new Error("No frame could be read from the clip.");
    return new Blob([(await ffmpeg.readFile(output)) as Uint8Array<ArrayBuffer>], { type: "image/png" });
  } finally {
    await ffmpeg.deleteFile(input).catch(() => undefined);
    await ffmpeg.deleteFile(output).catch(() => undefined);
  }
}

// A WebP of the clip's first frame, no longer than longSide on its long side
// and under maxBytes.
export async function posterStill(clip: Blob, longSide: number, maxBytes: number): Promise<Blob> {
  const bitmap = await createImageBitmap(await firstFrame(clip));
  const scale = Math.min(1, longSide / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.82, 0.7, 0.55, 0.4]) {
    const out = await canvas.convertToBlob({ type: "image/webp", quality });
    if (out.size < maxBytes) return out;
  }
  throw new Error(`poster over ${Math.round(maxBytes / 1024)} KB`);
}

// Where a clip's poster sits: beside it, with the same base name.
export function posterName(clip: string): string {
  return clip.replace(/\.mp4$/, ".webp");
}
