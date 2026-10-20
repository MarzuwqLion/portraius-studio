import { describe, expect, it } from "vitest";
import { AI_COMMENT, crc32, tagBytes } from "./ai-tag";

const ascii = (text: string) => new TextEncoder().encode(text);
const latin1 = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
}

// ---- PNG ----

function chunk(type: string, data: Uint8Array): Uint8Array {
  const body = concat(ascii(type), data);
  return concat(u32(data.length), body, u32(crc32(body)));
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = (...chunks: Uint8Array[]) => concat(PNG_SIGNATURE, ...chunks, chunk("IEND", new Uint8Array()));

function readChunks(bytes: Uint8Array): { type: string; data: Uint8Array; crcOk: boolean }[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset);
  const out = [];
  let at = 8;
  while (at < bytes.length) {
    const length = dv.getUint32(at);
    const type = latin1(bytes.subarray(at + 4, at + 8));
    const crcOk = dv.getUint32(at + 8 + length) === crc32(bytes.subarray(at + 4, at + 8 + length));
    out.push({ type, data: bytes.subarray(at + 8, at + 8 + length), crcOk });
    at += 12 + length;
  }
  return out;
}

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(ascii("123456789"))).toBe(0xcbf43926);
  });
});

describe("PNG", () => {
  const ihdr = chunk("IHDR", new Uint8Array(13));
  const idat = chunk("IDAT", new Uint8Array([1, 2, 3]));

  it("adds an XMP iTXt chunk after IHDR with a valid CRC", () => {
    const { bytes, outcome } = tagBytes(png(ihdr, idat), "image/png");
    expect(outcome).toBe("added");
    const chunks = readChunks(bytes);
    expect(chunks.map((c) => c.type)).toEqual(["IHDR", "iTXt", "IDAT", "IEND"]);
    expect(chunks.every((c) => c.crcOk)).toBe(true);
    const text = latin1(chunks[1]!.data);
    expect(text.startsWith("XML:com.adobe.xmp\0")).toBe(true);
    expect(text).toContain(AI_COMMENT);
    expect(text).toContain("digitalsourcetype/trainedAlgorithmicMedia");
  });

  it("is a no-op the second time", () => {
    const once = tagBytes(png(ihdr, idat), "image/png").bytes;
    const twice = tagBytes(once, "image/png");
    expect(twice.outcome).toBe("already");
    expect(twice.bytes).toBe(once);
  });

  it("leaves a file with C2PA Content Credentials untouched", () => {
    const signed = png(ihdr, chunk("caBX", ascii("jumb c2pa")), idat);
    const { bytes, outcome } = tagBytes(signed, "image/png");
    expect(outcome).toBe("c2pa");
    expect(bytes).toBe(signed);
  });

  it("replaces an older XMP packet instead of adding a second one", () => {
    const old = chunk("iTXt", concat(ascii("XML:com.adobe.xmp"), new Uint8Array(5), ascii("<x:xmpmeta/>")));
    const chunks = readChunks(tagBytes(png(ihdr, old, idat), "image/png").bytes);
    expect(chunks.filter((c) => c.type === "iTXt")).toHaveLength(1);
    expect(latin1(chunks[1]!.data)).toContain(AI_COMMENT);
  });
});

// ---- JPEG ----

function segment(marker: number, payload: Uint8Array): Uint8Array {
  const head = new Uint8Array([0xff, marker, 0, 0]);
  new DataView(head.buffer).setUint16(2, payload.length + 2);
  return concat(head, payload);
}

const SOI = new Uint8Array([0xff, 0xd8]);
const SCAN = new Uint8Array([0xff, 0xda, 0x00, 0x02, 9, 9, 9, 0xff, 0xd9]);

function markers(bytes: Uint8Array): number[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset);
  const out = [];
  let at = 2;
  while (bytes[at + 1] !== 0xda) {
    out.push(bytes[at + 1]!);
    at += 2 + dv.getUint16(at + 2);
  }
  return out;
}

describe("JPEG", () => {
  const jfif = segment(0xe0, ascii("JFIF\0\x01\x01"));
  const dqt = segment(0xdb, new Uint8Array(65));

  it("adds an APP1 XMP segment after the JFIF header and keeps the scan", () => {
    const { bytes, outcome } = tagBytes(concat(SOI, jfif, dqt, SCAN), "image/jpeg");
    expect(outcome).toBe("added");
    expect(markers(bytes)).toEqual([0xe0, 0xe1, 0xdb]);
    expect(latin1(bytes)).toContain(`http://ns.adobe.com/xap/1.0/\0`);
    expect(latin1(bytes)).toContain(AI_COMMENT);
    expect(bytes.subarray(bytes.length - SCAN.length)).toEqual(SCAN);
  });

  it("leaves a C2PA JUMBF file untouched", () => {
    const signed = concat(SOI, jfif, segment(0xeb, ascii("JP\0\x01jumbc2pa")), SCAN);
    expect(tagBytes(signed, "image/jpeg").outcome).toBe("c2pa");
  });

  it("is a no-op the second time", () => {
    const once = tagBytes(concat(SOI, jfif, SCAN), "image/jpeg").bytes;
    expect(tagBytes(once, "image/jpeg").outcome).toBe("already");
  });
});

// ---- MP4 ----

function box(type: string, ...children: Uint8Array[]): Uint8Array {
  const body = concat(...children);
  return concat(u32(8 + body.length), ascii(type), body);
}

function stco(offsets: number[]): Uint8Array {
  return box("stco", new Uint8Array(4), u32(offsets.length), ...offsets.map(u32));
}

function moov(offsets: number[], ...extra: Uint8Array[]): Uint8Array {
  return box("moov", box("mvhd", new Uint8Array(100)), box("trak", box("mdia", box("minf", box("stbl", stco(offsets))))), ...extra);
}

function readOffsets(bytes: Uint8Array): number[] {
  const at = latin1(bytes).indexOf("stco") - 4;
  const dv = new DataView(bytes.buffer, bytes.byteOffset);
  const count = dv.getUint32(at + 12);
  return Array.from({ length: count }, (_, i) => dv.getUint32(at + 16 + i * 4));
}

const ftyp = box("ftyp", ascii("isomisom"));
const mdat = box("mdat", ascii("frame-one frame-two"));

describe("MP4", () => {
  it("adds moov/udta/©cmt and shifts chunk offsets when moov comes first", () => {
    const sizeBefore = ftyp.length + moov([0, 0]).length;
    const offsets = [sizeBefore + 8, sizeBefore + 18];
    const source = concat(ftyp, moov(offsets), mdat);
    const { bytes, outcome } = tagBytes(source, "video/mp4");
    expect(outcome).toBe("added");
    const delta = bytes.length - source.length;
    expect(readOffsets(bytes)).toEqual(offsets.map((o) => o + delta));
    // The shifted offsets still point at the same frame bytes.
    expect(latin1(bytes.subarray(readOffsets(bytes)[0]!, readOffsets(bytes)[0]! + 9))).toBe("frame-one");
    const text = latin1(bytes);
    expect(text).toContain("udta");
    expect(text).toContain(`©cmt`);
    expect(text).toContain(AI_COMMENT);
    // moov's size field covers the new atom.
    const moovAt = ftyp.length;
    expect(new DataView(bytes.buffer).getUint32(moovAt)).toBe(moov(offsets).length + delta);
  });

  it("leaves offsets alone when mdat comes first, and grows an existing udta", () => {
    const offsets = [ftyp.length + 8];
    const udta = box("udta", box("meta", new Uint8Array(4)));
    const source = concat(ftyp, mdat, moov(offsets, udta));
    const { bytes } = tagBytes(source, "video/mp4");
    expect(readOffsets(bytes)).toEqual(offsets);
    expect(latin1(bytes).match(/udta/g)).toHaveLength(1);
    const udtaAt = latin1(bytes).indexOf("udta") - 4;
    expect(new DataView(bytes.buffer).getUint32(udtaAt)).toBe(udta.length + (bytes.length - source.length));
  });

  it("leaves a C2PA-signed MP4 untouched", () => {
    const uuid = box("uuid", new Uint8Array([0xd8, 0xfe, 0xc3, 0xd6, 0x1b, 0x0e, 0x48, 0x3c, 0x92, 0x97, 0x58, 0x28, 0x87, 0x7e, 0xc4, 0x81]), ascii("c2pa"));
    const signed = concat(ftyp, uuid, mdat, moov([0]));
    expect(tagBytes(signed, "video/mp4")).toEqual({ bytes: signed, outcome: "c2pa" });
  });

  it("is a no-op the second time", () => {
    const once = tagBytes(concat(ftyp, mdat, moov([16])), "video/mp4").bytes;
    expect(tagBytes(once, "video/mp4").outcome).toBe("already");
  });

  it("hands back anything it can't parse unchanged", () => {
    const junk = ascii("not a video at all");
    expect(tagBytes(junk, "video/mp4")).toEqual({ bytes: junk, outcome: "unsupported" });
    expect(tagBytes(junk, "audio/mpeg").outcome).toBe("unsupported");
  });
});
