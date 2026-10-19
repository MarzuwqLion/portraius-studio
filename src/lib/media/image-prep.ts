// Browser image prep (spec: What the browser does, Media prep): every image is
// resized to a 2048 px long edge at most and saved as JPEG quality 90.
// Re-encoding through a canvas drops EXIF, including GPS location.
import type { InlineImage } from "@/lib/registry/inputs";

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
}

function canvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

export async function decodeImage(source: Blob): Promise<ImageBitmap> {
  // from-image applies the photo's EXIF rotation before the EXIF is dropped.
  return createImageBitmap(source, { imageOrientation: "from-image" });
}

export async function drawToCanvas(source: Blob, maxEdge = 2048): Promise<HTMLCanvasElement> {
  const bitmap = await decodeImage(source);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const c = canvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  return c;
}

function toBlob(c: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("The image couldn't be encoded."))), type, quality));
}

export async function prepareImage(source: Blob, options: { maxEdge?: number; quality?: number } = {}): Promise<PreparedImage> {
  const c = await drawToCanvas(source, options.maxEdge ?? 2048);
  return { blob: await toBlob(c, "image/jpeg", options.quality ?? 0.9), width: c.width, height: c.height };
}

export async function makeThumb(source: Blob, edge = 480): Promise<Blob> {
  return (await prepareImage(source, { maxEdge: edge, quality: 0.85 })).blob;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("The image couldn't be read."));
    reader.readAsDataURL(blob);
  });
}

// An image ready to send to a model: prepped JPEG, as raw base64.
export async function toInlineImage(source: Blob): Promise<InlineImage> {
  const { blob } = await prepareImage(source);
  return { mime: "image/jpeg", base64: await blobToBase64(blob) };
}
