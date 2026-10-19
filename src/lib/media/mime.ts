// File types from their first bytes, for downloads whose host sends a vague
// Content-Type and for files inside imported character zips.

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
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "video/webm";
  if (ascii(head, 0, 3) === "ID3" || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0)) return "audio/mpeg";
  return undefined;
}
