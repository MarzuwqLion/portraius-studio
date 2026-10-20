// Spec: Security (metadata row). Every file the app hands out says it's
// AI-generated: PNG and JPEG carry an XMP packet (the IPTC digital source type
// plus a description), MP4 a comment. Done on the bytes, with no re-encode.
//
// A file that already carries its provider's signed C2PA Content Credentials
// (Nano Banana's PNGs, Seedance's MP4s and last frames) is handed out as it
// is: the credential already declares it AI-generated, and one added byte
// would break its signature (docs/notes/m6-notes.md).

export const AI_COMMENT = "AI-generated with Portraius Studio";

export type TagOutcome = "added" | "already" | "c2pa" | "unsupported";

const XMP_PACKET = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"
    xmp:CreatorTool="Portraius Studio"
    Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia">
   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${AI_COMMENT}</rdf:li></rdf:Alt></dc:description>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="r"?>`;

const utf8 = (text: string) => new TextEncoder().encode(text);
const latin1 = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);
const COMMENT_LATIN1 = latin1(utf8(AI_COMMENT));
const mentionsTag = (bytes: Uint8Array) => latin1(bytes).includes(COMMENT_LATIN1);

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

// ---- PNG: an iTXt chunk named XML:com.adobe.xmp, right after IHDR ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface PngChunk {
  type: string;
  start: number; // offset of the length field
  end: number;   // offset after the CRC
  data: Uint8Array;
}

function pngChunks(bytes: Uint8Array): PngChunk[] | undefined {
  const chunks: PngChunk[] = [];
  const dv = view(bytes);
  let at = 8;
  while (at + 12 <= bytes.length) {
    const length = dv.getUint32(at);
    const end = at + 12 + length;
    if (end > bytes.length) return undefined;
    const type = latin1(bytes.subarray(at + 4, at + 8));
    chunks.push({ type, start: at, end, data: bytes.subarray(at + 8, at + 8 + length) });
    at = end;
    if (type === "IEND") return chunks;
  }
  return undefined;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = view(out);
  dv.setUint32(0, data.length);
  out.set(utf8(type), 4);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

const XMP_KEYWORD = "XML:com.adobe.xmp";

function tagPng(bytes: Uint8Array): { bytes: Uint8Array; outcome: TagOutcome } {
  const chunks = pngChunks(bytes);
  if (!chunks || chunks[0]?.type !== "IHDR") return { bytes, outcome: "unsupported" };
  if (chunks.some((c) => c.type === "caBX")) return { bytes, outcome: "c2pa" };
  const text = chunks.filter((c) => c.type === "iTXt" || c.type === "tEXt" || c.type === "zTXt");
  if (text.some((c) => mentionsTag(c.data))) return { bytes, outcome: "already" };
  // keyword, compression flag and method, empty language tag and translated keyword
  const data = concat([utf8(XMP_KEYWORD), new Uint8Array([0, 0, 0, 0, 0]), utf8(XMP_PACKET)]);
  // One XMP packet per file: an older one is replaced.
  const kept = chunks.filter((c) => !(c.type === "iTXt" && latin1(c.data.subarray(0, XMP_KEYWORD.length + 1)) === `${XMP_KEYWORD}\0`));
  const parts = [bytes.subarray(0, 8)];
  for (const chunk of kept) {
    parts.push(bytes.subarray(chunk.start, chunk.end));
    if (chunk.type === "IHDR") parts.push(pngChunk("iTXt", data));
  }
  return { bytes: concat(parts), outcome: "added" };
}

// ---- JPEG: an APP1 XMP segment after SOI and any JFIF or Exif header ----

const XMP_NS = "http://ns.adobe.com/xap/1.0/\0";

interface JpegSegment {
  marker: number;
  start: number;
  end: number;
  payload: Uint8Array;
}

// Segments up to the start of the image data.
function jpegSegments(bytes: Uint8Array): JpegSegment[] | undefined {
  const dv = view(bytes);
  const segments: JpegSegment[] = [];
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return undefined;
    const marker = bytes[at + 1]!;
    if (marker === 0xda) return segments; // start of scan
    const length = dv.getUint16(at + 2);
    const end = at + 2 + length;
    if (end > bytes.length) return undefined;
    segments.push({ marker, start: at, end, payload: bytes.subarray(at + 4, end) });
    at = end;
  }
  return undefined;
}

function tagJpeg(bytes: Uint8Array): { bytes: Uint8Array; outcome: TagOutcome } {
  const segments = jpegSegments(bytes);
  if (!segments) return { bytes, outcome: "unsupported" };
  // C2PA manifests ride in APP11 as JUMBF boxes.
  if (segments.some((s) => s.marker === 0xeb && latin1(s.payload).includes("c2pa"))) return { bytes, outcome: "c2pa" };
  if (segments.some((s) => (s.marker === 0xe1 || s.marker === 0xfe) && mentionsTag(s.payload))) return { bytes, outcome: "already" };
  const isXmp = (s: JpegSegment) => s.marker === 0xe1 && latin1(s.payload.subarray(0, XMP_NS.length)) === XMP_NS;
  const payload = concat([utf8(XMP_NS), utf8(XMP_PACKET)]);
  const segment = new Uint8Array(4 + payload.length);
  segment.set([0xff, 0xe1], 0);
  view(segment).setUint16(2, payload.length + 2);
  segment.set(payload, 4);
  // After the JFIF (APP0) and Exif (APP1) headers, which readers expect first.
  const lead = segments.findIndex((s) => !(s.marker === 0xe0 || (s.marker === 0xe1 && !isXmp(s))));
  const insertAt = lead === -1 ? segments.length : lead;
  const parts = [bytes.subarray(0, 2)];
  segments.forEach((s, i) => {
    if (i === insertAt) parts.push(segment);
    if (!isXmp(s)) parts.push(bytes.subarray(s.start, s.end));
  });
  if (insertAt === segments.length) parts.push(segment);
  const tail = segments.at(-1)?.end ?? 2;
  parts.push(bytes.subarray(tail));
  return { bytes: concat(parts), outcome: "added" };
}

// ---- MP4: a QuickTime ©cmt atom in moov/udta ----

interface Box {
  type: string;
  start: number;
  end: number;
  header: number;
}

const C2PA_UUID = "d8fec3d61b0e483c92975828877ec481";

function boxes(bytes: Uint8Array, start: number, end: number): Box[] | undefined {
  const dv = view(bytes);
  const out: Box[] = [];
  let at = start;
  while (at + 8 <= end) {
    let size = dv.getUint32(at);
    let header = 8;
    if (size === 1) {
      if (at + 16 > end) return undefined;
      size = Number(dv.getBigUint64(at + 8));
      header = 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < header || at + size > end) return undefined;
    out.push({ type: latin1(bytes.subarray(at + 4, at + 8)), start: at, end: at + size, header });
    at += size;
  }
  return out;
}

const child = (bytes: Uint8Array, box: Box, type: string) => boxes(bytes, box.start + box.header, box.end)?.find((b) => b.type === type);

// Chunk offsets point at absolute file positions, so they move when bytes are
// added before mdat.
function shiftChunkOffsets(bytes: Uint8Array, moov: Box, delta: number): void {
  const dv = view(bytes);
  for (const trak of boxes(bytes, moov.start + moov.header, moov.end)?.filter((b) => b.type === "trak") ?? []) {
    const mdia = child(bytes, trak, "mdia");
    const minf = mdia && child(bytes, mdia, "minf");
    const stbl = minf && child(bytes, minf, "stbl");
    if (!stbl) continue;
    for (const table of boxes(bytes, stbl.start + stbl.header, stbl.end) ?? []) {
      const count = table.type === "stco" || table.type === "co64" ? dv.getUint32(table.start + 12) : 0;
      for (let i = 0; i < count; i++) {
        if (table.type === "stco") {
          const at = table.start + 16 + i * 4;
          dv.setUint32(at, dv.getUint32(at) + delta);
        } else {
          const at = table.start + 16 + i * 8;
          dv.setBigUint64(at, dv.getBigUint64(at) + BigInt(delta));
        }
      }
    }
  }
}

function commentAtom(text: string): Uint8Array {
  const body = utf8(text);
  const atom = new Uint8Array(12 + body.length);
  const dv = view(atom);
  dv.setUint32(0, atom.length);
  atom.set([0xa9, 0x63, 0x6d, 0x74], 4); // ©cmt
  dv.setUint16(8, body.length);
  dv.setUint16(10, 0x55c4); // "und", packed ISO 639-2
  atom.set(body, 12);
  return atom;
}

function tagMp4(bytes: Uint8Array): { bytes: Uint8Array; outcome: TagOutcome } {
  const top = boxes(bytes, 0, bytes.length);
  const moov = top?.find((b) => b.type === "moov");
  if (!top || !moov || moov.header !== 8 || top.some((b) => b.type === "moof")) return { bytes, outcome: "unsupported" };
  if (top.some((b) => b.type === "uuid" && [...bytes.subarray(b.start + 8, b.start + 24)].map((x) => x.toString(16).padStart(2, "0")).join("") === C2PA_UUID)) {
    return { bytes, outcome: "c2pa" };
  }
  if (mentionsTag(bytes.subarray(moov.start, moov.end))) return { bytes, outcome: "already" };

  const atom = commentAtom(AI_COMMENT);
  const udta = child(bytes, moov, "udta");
  let newMoov: Uint8Array;
  if (udta && udta.header === 8) {
    // A QuickTime list may end in a 32-bit zero; the new atom goes before it.
    const terminated = udta.end - udta.start >= 12 && view(bytes).getUint32(udta.end - 4) === 0;
    const split = terminated ? udta.end - 4 : udta.end;
    newMoov = concat([bytes.subarray(moov.start, udta.start), bytes.subarray(udta.start, split), atom, bytes.subarray(split, moov.end)]);
    const dv = view(newMoov);
    dv.setUint32(udta.start - moov.start, udta.end - udta.start + atom.length);
  } else {
    const box = new Uint8Array(8 + atom.length);
    view(box).setUint32(0, box.length);
    box.set(utf8("udta"), 4);
    box.set(atom, 8);
    newMoov = concat([bytes.subarray(moov.start, moov.end), box]);
  }
  const delta = newMoov.length - (moov.end - moov.start);
  view(newMoov).setUint32(0, newMoov.length);

  const out = concat([bytes.subarray(0, moov.start), newMoov, bytes.subarray(moov.end)]);
  const mdat = top.find((b) => b.type === "mdat");
  if (mdat && mdat.start > moov.start) shiftChunkOffsets(out, { ...moov, end: moov.start + newMoov.length }, delta);
  return { bytes: out, outcome: "added" };
}

// ---- Entry points ----

export function tagBytes(bytes: Uint8Array, mime: string): { bytes: Uint8Array; outcome: TagOutcome } {
  try {
    if (mime === "image/png") return tagPng(bytes);
    if (mime === "image/jpeg") return tagJpeg(bytes);
    if (mime === "video/mp4" || mime === "video/quicktime") return tagMp4(bytes);
  } catch {
    // A file this can't parse goes out unchanged rather than half-edited.
  }
  return { bytes, outcome: "unsupported" };
}

export async function tagAiGenerated(blob: Blob): Promise<Blob> {
  const { bytes, outcome } = tagBytes(new Uint8Array(await blob.arrayBuffer()), blob.type);
  return outcome === "added" ? new Blob([bytes as Uint8Array<ArrayBuffer>], { type: blob.type }) : blob;
}
