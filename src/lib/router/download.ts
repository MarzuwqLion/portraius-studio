// Fetches every result asset and returns it as a Blob, so the library stores
// bytes rather than links that expire in 12 to 24 hours.
import { config } from "@/lib/config";
import type { AssetRef } from "@/lib/registry/capabilities";
import { appError } from "./errors";
import { WORKER_FETCH_PREFIXES } from "./hosts";

const DEFAULT_MIME: Record<AssetRef["kind"], string> = {
  image: "image/png",
  frame: "image/png",
  video: "video/mp4",
  audio: "audio/mpeg",
};

// Content types that say nothing about the bytes. Freepik's links answer with
// application/octet-stream, so the type is read from the file itself.
const VAGUE_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream"]);

export function base64ToBlob(base64: string, mime: string): Blob {
  const data = base64.includes(",") && base64.startsWith("data:") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

// Recognises the formats the registry's models return from their first bytes.
export function sniffMime(head: Uint8Array): string | undefined {
  if (head[0] === 0x89 && ascii(head, 1, 4) === "PNG") return "image/png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP") return "image/webp";
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WAVE") return "audio/wav";
  if (ascii(head, 4, 8) === "ftyp") return ascii(head, 8, 10) === "qt" ? "video/quicktime" : "video/mp4";
  if (ascii(head, 0, 3) === "ID3" || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0)) return "audio/mpeg";
  return undefined;
}

// Where the browser fetches an asset link from: directly, or through the
// Worker's /fetch route for hosts that send no CORS headers.
export function fetchUrlFor(url: string): string {
  if (!WORKER_FETCH_PREFIXES.some((prefix) => url.startsWith(prefix))) return url;
  if (!config.workerUrl) {
    throw appError("download_failed", "This result's host needs Portraius Studio's download proxy, which isn't set up here.", { retry: "manual" });
  }
  return `${config.workerUrl}/fetch?url=${encodeURIComponent(url)}`;
}

export async function downloadAsset(ref: AssetRef, signal?: AbortSignal): Promise<Blob> {
  if (ref.base64) return base64ToBlob(ref.base64, ref.mime ?? DEFAULT_MIME[ref.kind]);
  if (!ref.url) throw appError("download_failed", "This result has no file to save.", { retry: "manual" });
  // Asset links are signed; the visitor's key is never sent with them.
  const response = await fetch(fetchUrlFor(ref.url), { credentials: "omit", referrerPolicy: "no-referrer", signal });
  if (!response.ok) {
    throw appError("download_failed", "The result couldn't be saved from its link. Retry it?", { retry: "manual" });
  }
  const blob = await response.blob();
  let mime = ref.mime ?? blob.type;
  if (VAGUE_TYPES.has(mime)) {
    mime = sniffMime(new Uint8Array(await blob.slice(0, 16).arrayBuffer())) ?? DEFAULT_MIME[ref.kind];
  }
  return blob.type === mime ? blob : new Blob([blob], { type: mime });
}
