import { afterEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({ routerBaseUrl: "https://api.comfy.org", mediaHost: "worker", workerUrl: "" }));
vi.mock("@/lib/config", () => ({ config }));

import { downloadAsset, fetchUrlFor, sniffMime } from "./download";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

const SEEDANCE_URL = "https://storage.googleapis.com/partner-nodes-assets/byteplus/a/b/c/video.mp4?Expires=1&Signature=x";
const FREEPIK_URL = "https://ai-statics.magnific.com/content/magnific-image-upscale-fast/result.png";

afterEach(() => {
  config.workerUrl = "";
  vi.unstubAllGlobals();
});

describe("sniffMime", () => {
  it("reads the formats the registry models return", () => {
    expect(sniffMime(bytes(PNG))).toBe("image/png");
    expect(sniffMime(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(bytes("RIFF", [0, 0, 0, 0], "WEBP"))).toBe("image/webp");
    expect(sniffMime(bytes("RIFF", [0, 0, 0, 0], "WAVE"))).toBe("audio/wav");
    expect(sniffMime(bytes([0, 0, 0, 0x18], "ftypisom"))).toBe("video/mp4");
    expect(sniffMime(bytes([0, 0, 0, 0x14], "ftypqt  "))).toBe("video/quicktime");
    expect(sniffMime(bytes("ID3", [4, 0]))).toBe("audio/mpeg");
  });

  it("returns undefined for anything else", () => {
    expect(sniffMime(bytes("<html>"))).toBeUndefined();
  });
});

describe("fetchUrlFor", () => {
  it("fetches hosts that send CORS headers directly", () => {
    expect(fetchUrlFor(FREEPIK_URL)).toBe(FREEPIK_URL);
  });

  it("sends Comfy's rehosted Seedance links through the Worker", () => {
    config.workerUrl = "https://proxy.example.workers.dev";
    expect(fetchUrlFor(SEEDANCE_URL)).toBe(`https://proxy.example.workers.dev/fetch?url=${encodeURIComponent(SEEDANCE_URL)}`);
  });

  it("fails with download_failed when that link needs a Worker and none is set", () => {
    expect(() => fetchUrlFor(SEEDANCE_URL)).toThrow(expect.objectContaining({ code: "download_failed" }));
  });

  it("matches the bucket, not the whole storage host", () => {
    const other = "https://storage.googleapis.com/some-other-bucket/file.mp4";
    expect(fetchUrlFor(other)).toBe(other);
  });
});

describe("downloadAsset", () => {
  it("types an octet-stream download from its bytes", async () => {
    const fetchMock = vi.fn(async () => new Response(bytes(PNG, [0, 0, 0, 0]), { headers: { "Content-Type": "application/octet-stream" } }));
    vi.stubGlobal("fetch", fetchMock);
    const blob = await downloadAsset({ kind: "image", url: FREEPIK_URL });
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(12);
    expect(fetchMock).toHaveBeenCalledWith(FREEPIK_URL, expect.objectContaining({ credentials: "omit" }));
  });

  it("keeps a declared content type", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes(PNG), { headers: { "Content-Type": "image/webp" } })));
    expect((await downloadAsset({ kind: "image", url: FREEPIK_URL })).type).toBe("image/webp");
  });

  it("falls back to the kind's default when the bytes are unknown", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes("not a known format"))));
    expect((await downloadAsset({ kind: "video", url: FREEPIK_URL })).type).toBe("video/mp4");
  });

  it("decodes inline base64 without a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const blob = await downloadAsset({ kind: "image", base64: btoa(String.fromCharCode(...PNG)), mime: "image/png" });
    expect(blob.type).toBe("image/png");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
