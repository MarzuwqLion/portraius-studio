import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "./index";

// In-memory stand-ins for the R2 bucket and the rate limiter: only what the
// Worker calls.
class FakeBucket {
  objects = new Map<string, { bytes: Uint8Array; contentType?: string; customMetadata: Record<string, string> }>();

  async put(key: string, body: ReadableStream, options: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) {
    const bytes = new Uint8Array(await new Response(body).arrayBuffer());
    this.objects.set(key, { bytes, contentType: options.httpMetadata?.contentType, customMetadata: options.customMetadata ?? {} });
  }

  async head(key: string) {
    const stored = this.objects.get(key);
    return stored ? this.describe(key, stored) : null;
  }

  async get(key: string, options: { range?: Headers } = {}) {
    const stored = this.objects.get(key);
    if (!stored) return null;
    const match = /^bytes=(\d+)-(\d+)$/.exec(options.range?.get("Range") ?? "");
    const range = match ? { offset: Number(match[1]), length: Number(match[2]) - Number(match[1]) + 1 } : undefined;
    const bytes = range ? stored.bytes.slice(range.offset, range.offset + range.length) : stored.bytes;
    return { ...this.describe(key, stored), range, body: new Response(bytes).body };
  }

  async delete(key: string) {
    this.objects.delete(key);
  }

  private describe(key: string, stored: { bytes: Uint8Array; contentType?: string; customMetadata: Record<string, string> }) {
    return {
      key,
      size: stored.bytes.length,
      httpEtag: `"${key}"`,
      customMetadata: stored.customMetadata,
      writeHttpMetadata: (headers: Headers) => {
        if (stored.contentType) headers.set("Content-Type", stored.contentType);
      },
    };
  }
}

const GOOD_KEY = "Bearer good-key";
const SEEDANCE_URL = "https://storage.googleapis.com/partner-nodes-assets/byteplus/a/b/c/video.mp4?Expires=1&Signature=x";
const VIDEO = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 1, 2, 3, 4]);

let bucket: FakeBucket;
let allowRequests: boolean;
let env: Env;
let upstream: ReturnType<typeof vi.fn>;

function call(path: string, init: RequestInit & { origin?: string | null } = {}) {
  const headers = new Headers(init.headers);
  const origin = init.origin === undefined ? "http://localhost:5173" : init.origin;
  if (origin) headers.set("Origin", origin);
  headers.set("CF-Connecting-IP", "203.0.113.7");
  return worker.fetch(new Request(`https://portraius-proxy.example.workers.dev${path}`, { ...init, headers }), env);
}

function uploadVideo(auth = GOOD_KEY, body: Uint8Array = VIDEO) {
  return call("/upload", {
    method: "POST",
    body,
    headers: { Authorization: auth, "Content-Type": "video/mp4", "Content-Length": String(body.length) },
  });
}

beforeEach(() => {
  bucket = new FakeBucket();
  allowRequests = true;
  env = {
    MEDIA: bucket as unknown as R2Bucket,
    LIMITER: { limit: async () => ({ success: allowRequests }) } as RateLimit,
    ALLOWED_ORIGINS: "https://marzuwqlion.github.io",
  };
  upstream = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://api.comfy.org/")) {
      const auth = new Headers(init?.headers).get("Authorization");
      return new Response("{}", { status: auth === GOOD_KEY || auth === "Bearer other-key" ? 200 : 401 });
    }
    if (url.startsWith("https://storage.googleapis.com/partner-nodes-assets/redirect")) {
      return new Response(null, { status: 302, headers: { Location: "https://example.com/" } });
    }
    if (url.startsWith("https://storage.googleapis.com/")) {
      return new Response(VIDEO, { headers: { "Content-Type": "video/mp4", "Content-Length": String(VIDEO.length) } });
    }
    return new Response(null, { status: 599 });
  });
  vi.stubGlobal("fetch", upstream);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CORS", () => {
  it("answers preflights from localhost and the Pages site", async () => {
    for (const origin of ["http://localhost:5173", "https://marzuwqlion.github.io"]) {
      const res = await call("/upload", { method: "OPTIONS", origin });
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(origin);
      expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    }
  });

  it("refuses every other site", async () => {
    const res = await call(`/fetch?url=${encodeURIComponent(SEEDANCE_URL)}`, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("rate limit", () => {
  it("answers 429 with Retry-After once the IP is over its limit", async () => {
    allowRequests = false;
    const res = await call(`/fetch?url=${encodeURIComponent(SEEDANCE_URL)}`);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });
});

describe("/upload and /m/:key", () => {
  it("stores the file under a random key and serves it publicly", async () => {
    const res = await uploadVideo();
    expect(res.status).toBe(201);
    const hosted = (await res.json()) as { id: string; url: string; expiresAt: string };
    expect(hosted.id).toMatch(/^[0-9a-f]{32}\.mp4$/);
    expect(hosted.url).toBe(`https://portraius-proxy.example.workers.dev/m/${hosted.id}`);
    expect(Date.parse(hosted.expiresAt)).toBeGreaterThan(Date.now());

    const served = await call(`/m/${hosted.id}`, { origin: null });
    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("video/mp4");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(VIDEO);
  });

  it("serves byte ranges", async () => {
    const { id } = (await (await uploadVideo()).json()) as { id: string };
    const res = await call(`/m/${id}`, { origin: null, headers: { Range: "bytes=4-7" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(`bytes 4-7/${VIDEO.length}`);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(VIDEO.slice(4, 8));
  });

  it("checks a key with Router once and remembers it for later uploads", async () => {
    await uploadVideo("Bearer other-key");
    await uploadVideo("Bearer other-key");
    const keyChecks = upstream.mock.calls.filter(([url]) => String(url).startsWith("https://api.comfy.org/"));
    expect(keyChecks).toHaveLength(1);
  });

  it("refuses uploads without a key Router accepts", async () => {
    expect((await call("/upload", { method: "POST", body: VIDEO, headers: { "Content-Type": "video/mp4", "Content-Length": "12" } })).status).toBe(401);
    expect((await uploadVideo("Bearer wrong-key")).status).toBe(401);
    expect(bucket.objects.size).toBe(0);
  });

  it("refuses types outside the allowlist and files over 100 MB", async () => {
    const html = await call("/upload", { method: "POST", body: "<html>", headers: { Authorization: GOOD_KEY, "Content-Type": "text/html", "Content-Length": "6" } });
    expect(html.status).toBe(415);
    const big = await call("/upload", {
      method: "POST",
      body: VIDEO,
      headers: { Authorization: GOOD_KEY, "Content-Type": "video/mp4", "Content-Length": String(100 * 1024 * 1024 + 1) },
    });
    expect(big.status).toBe(413);
  });

  it("deletes with a key, and the link stops working", async () => {
    const { id } = (await (await uploadVideo()).json()) as { id: string };
    expect((await call(`/m/${id}`, { method: "DELETE" })).status).toBe(401);
    expect((await call(`/m/${id}`, { method: "DELETE", headers: { Authorization: GOOD_KEY } })).status).toBe(204);
    expect((await call(`/m/${id}`, { origin: null })).status).toBe(404);
  });

  it("stops serving a link after it expires", async () => {
    const { id } = (await (await uploadVideo()).json()) as { id: string };
    bucket.objects.get(id)!.customMetadata.expiresAt = new Date(Date.now() - 1000).toISOString();
    expect((await call(`/m/${id}`, { origin: null })).status).toBe(404);
  });

  it("only serves keys the Worker could have made", async () => {
    expect((await call("/m/..%2Fsecret", { origin: null })).status).toBe(404);
    expect((await call("/m/notes.txt", { origin: null })).status).toBe(404);
  });
});

describe("/fetch", () => {
  it("streams an allowed result link back with CORS headers", async () => {
    const res = await call(`/fetch?url=${encodeURIComponent(SEEDANCE_URL)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(VIDEO);
    expect(upstream).toHaveBeenCalledWith(SEEDANCE_URL, { redirect: "manual" });
  });

  it("streams BytePlus's own storage links, which Comfy sometimes passes on", async () => {
    const tos = "https://ark-acg-ap-southeast-1.tos-ap-southeast-1.volces.com/dreamina-seedance-2-5/1/Video/clip.mp4?X-Tos-Signature=x";
    const res = await call(`/fetch?url=${encodeURIComponent(tos)}`);
    expect(res.status).toBe(599); // the fake upstream answers 599 for any host it doesn't know
    expect(upstream).toHaveBeenCalledWith(tos, { redirect: "manual" });
  });

  it("refuses hosts and buckets outside the allowlist", async () => {
    for (const url of [
      "https://ark-acg-ap-southeast-1.tos-ap-southeast-1.volces.com.evil.example/clip.mp4",
      "https://example.com/video.mp4",
      "https://storage.googleapis.com/another-bucket/video.mp4",
      "https://storage.googleapis.com/partner-nodes-assets/../another-bucket/video.mp4",
      "https://storage.googleapis.com/partner-nodes-assets/%2e%2e/another-bucket/video.mp4",
      "http://storage.googleapis.com/partner-nodes-assets/video.mp4",
      "not a url",
    ]) {
      const res = await call(`/fetch?url=${encodeURIComponent(url)}`);
      expect([400, 403]).toContain(res.status);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("doesn't follow redirects", async () => {
    const res = await call(`/fetch?url=${encodeURIComponent("https://storage.googleapis.com/partner-nodes-assets/redirect")}`);
    expect(res.status).toBe(502);
  });

  it("passes an expired link's status through without its body", async () => {
    upstream.mockResolvedValueOnce(new Response("<Error>Expired</Error>", { status: 400 }));
    const res = await call(`/fetch?url=${encodeURIComponent(SEEDANCE_URL)}`);
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("");
  });
});
