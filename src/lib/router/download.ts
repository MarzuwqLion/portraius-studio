// Fetches every result asset and returns it as a Blob, so the library stores
// bytes rather than links that expire in 12 to 24 hours.
import type { AssetRef } from "@/lib/registry/capabilities";
import { appError } from "./errors";

const DEFAULT_MIME: Record<AssetRef["kind"], string> = {
  image: "image/png",
  frame: "image/png",
  video: "video/mp4",
  audio: "audio/mpeg",
};

export function base64ToBlob(base64: string, mime: string): Blob {
  const data = base64.includes(",") && base64.startsWith("data:") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function downloadAsset(ref: AssetRef, signal?: AbortSignal): Promise<Blob> {
  if (ref.base64) return base64ToBlob(ref.base64, ref.mime ?? DEFAULT_MIME[ref.kind]);
  if (!ref.url) throw appError("download_failed", "This result has no file to save.", { retry: "manual" });
  // Asset links are signed; the visitor's key is never sent with them.
  const response = await fetch(ref.url, { credentials: "omit", referrerPolicy: "no-referrer", signal });
  if (!response.ok) {
    throw appError("download_failed", "The result couldn't be saved from its link. Retry it?", { retry: "manual" });
  }
  const blob = await response.blob();
  const mime = ref.mime ?? (blob.type || DEFAULT_MIME[ref.kind]);
  return blob.type === mime ? blob : new Blob([blob], { type: mime });
}
