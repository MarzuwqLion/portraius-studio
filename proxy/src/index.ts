// Portraius Studio's Cloudflare Worker (spec: Architecture, The Worker). M1
// found two things the browser can't do alone: upload inputs that providers
// must fetch by URL (Unknowns row 2) and download results from hosts that send
// no CORS headers (row 3: Comfy's rehosted Seedance results, and from M7 Sync
// Labs' lip syncs). This Worker does both and
// nothing else. It never stores a key: uploads are checked against Router once
// and only a hash of the key is remembered, for 10 minutes.
import { needsWorkerFetch } from "../../src/lib/router/hosts";

export interface Env {
  MEDIA: R2Bucket;
  LIMITER: RateLimit;
  // Comma-separated origins allowed besides localhost, e.g. the GitHub Pages site.
  ALLOWED_ORIGINS: string;
}

const ROUTER_URL = "https://api.comfy.org";
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const KEY_CHECK_TTL_MS = 10 * 60 * 1000;
// The bucket's lifecycle rule deletes objects after 1 day (R2 rules count in
// whole days); the app deletes each upload as soon as its job ends.
const LINK_LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_REDIRECTS = 2;

const UPLOAD_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mpeg": "mp3",
  "image/png": "png",
  "image/jpeg": "jpg",
};
const OBJECT_KEY = /^[0-9a-f]{32}\.(mp4|mov|wav|mp3|png|jpg)$/;
const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// ---- Responses ----

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  if (LOCALHOST.test(origin)) return origin;
  const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  return allowed.includes(origin) ? origin : null;
}

function withCors(response: Response, origin: string | null): Response {
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.append("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function fail(status: number, error: string, detail: string, headers: HeadersInit = {}): Response {
  return json({ error, detail }, status, headers);
}

// ---- Key check ----

const checkedKeys = new Map<string, number>();

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Returns an error response, or null when Router accepts the caller's key.
async function checkKey(request: Request): Promise<Response | null> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ") || auth.length <= "Bearer ".length) {
    return fail(401, "unauthorized", "Send your Comfy API key as a Bearer token.");
  }
  const now = Date.now();
  const hash = await sha256(auth);
  if ((checkedKeys.get(hash) ?? 0) > now) return null;
  const res = await fetch(`${ROUTER_URL}/v2/models?limit=1`, { headers: { Authorization: auth } });
  if (res.status === 401 || res.status === 403) return fail(401, "unauthorized", "Router didn't accept that key.");
  if (!res.ok) return fail(502, "key_check_failed", `Router answered ${res.status} to the key check.`);
  if (checkedKeys.size > 1000) {
    for (const [k, until] of checkedKeys) if (until <= now) checkedKeys.delete(k);
  }
  checkedKeys.set(hash, now + KEY_CHECK_TTL_MS);
  return null;
}

// ---- Routes ----

async function upload(request: Request, env: Env): Promise<Response> {
  const type = (request.headers.get("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase();
  const extension = UPLOAD_TYPES[type];
  if (!extension) return fail(415, "unsupported_type", "Uploads must be MP4, MOV, WAV, MP3, PNG or JPEG.");
  const length = Number(request.headers.get("Content-Length"));
  if (!Number.isInteger(length) || length <= 0 || !request.body) return fail(411, "length_required", "Send the file with its Content-Length.");
  if (length > MAX_UPLOAD_BYTES) return fail(413, "too_large", "Uploads are capped at 100 MB.");
  const denied = await checkKey(request);
  if (denied) return denied;

  const id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = `${id}.${extension}`;
  const expiresAt = new Date(Date.now() + LINK_LIFETIME_MS).toISOString();
  await env.MEDIA.put(key, request.body, { httpMetadata: { contentType: type }, customMetadata: { expiresAt } });
  return json({ id: key, url: `${new URL(request.url).origin}/m/${key}`, expiresAt }, 201);
}

function contentRange(object: R2Object): string {
  const range = object.range as { offset?: number; length?: number; suffix?: number } | undefined;
  let offset = range?.offset ?? 0;
  let length = range?.length ?? object.size - offset;
  if (range?.suffix !== undefined) {
    offset = object.size - range.suffix;
    length = range.suffix;
  }
  return `bytes ${offset}-${offset + length - 1}/${object.size}`;
}

function isExpired(object: R2Object): boolean {
  const expiresAt = Date.parse(object.customMetadata?.expiresAt ?? "");
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

async function serveMedia(request: Request, env: Env, key: string): Promise<Response> {
  const object =
    request.method === "HEAD"
      ? await env.MEDIA.head(key)
      : await env.MEDIA.get(key, { range: request.headers, onlyIf: request.headers });
  if (!object || isExpired(object)) return fail(404, "not_found", "This link has expired or never existed.");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "no-store");
  if (request.method === "HEAD") {
    headers.set("Content-Length", String(object.size));
    return new Response(null, { headers });
  }
  if (!("body" in object)) return new Response(null, { status: 304, headers });
  const body = (object as R2ObjectBody).body;
  if (request.headers.has("Range") && object.range) {
    headers.set("Content-Range", contentRange(object));
    return new Response(body, { status: 206, headers });
  }
  return new Response(body, { headers });
}

async function deleteMedia(request: Request, env: Env, key: string): Promise<Response> {
  const denied = await checkKey(request);
  if (denied) return denied;
  await env.MEDIA.delete(key);
  return new Response(null, { status: 204 });
}

async function proxyFetch(request: Request): Promise<Response> {
  let target: URL;
  try {
    target = new URL(new URL(request.url).searchParams.get("url") ?? "");
  } catch {
    return fail(400, "bad_url", "Pass the asset link as ?url=.");
  }
  // href is normalised, so ../ and %2e%2e segments can't step out of the prefix.
  if (!needsWorkerFetch(target)) {
    return fail(403, "host_not_allowed", "This Worker only fetches Portraius Studio's result hosts.");
  }
  // Redirects are followed only to links that are allowed too (Sync Labs
  // sends its results on to S3), so an allowed link can't lead anywhere else.
  let upstream = await fetch(target.href, { redirect: "manual" });
  for (let hops = 0; upstream.status >= 300 && upstream.status < 400; hops++) {
    const location = upstream.headers.get("Location");
    let next: URL | undefined;
    try {
      next = location ? new URL(location, target) : undefined;
    } catch {
      next = undefined;
    }
    if (!next || hops >= MAX_REDIRECTS || !needsWorkerFetch(next)) return fail(502, "redirected", "The asset host answered with a redirect.");
    target = next;
    upstream = await fetch(target.href, { redirect: "manual" });
  }
  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const name of ["Content-Type", "Content-Length", "ETag", "Last-Modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.ok ? upstream.body : null, { status: upstream.status, headers });
}

async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  const method = request.method;
  if (pathname === "/upload" && method === "POST") return upload(request, env);
  if (pathname === "/fetch" && method === "GET") return proxyFetch(request);
  const media = /^\/m\/([^/]+)$/.exec(pathname);
  if (media) {
    const key = media[1]!;
    if (!OBJECT_KEY.test(key)) return fail(404, "not_found", "This link has expired or never existed.");
    if (method === "GET" || method === "HEAD") return serveMedia(request, env, key);
    if (method === "DELETE") return deleteMedia(request, env, key);
  }
  return fail(404, "not_found", "No such route.");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(request, env);
    // Browsers on other sites get nothing. Providers fetching /m/ send no Origin.
    if (request.headers.has("Origin") && !origin) return fail(403, "origin_not_allowed", "This Worker only serves Portraius Studio.");
    if (request.method === "OPTIONS") {
      return withCors(
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Methods": "GET, HEAD, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
            "Access-Control-Max-Age": "600",
          },
        }),
        origin,
      );
    }
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const { success } = await env.LIMITER.limit({ key: ip });
    if (!success) return withCors(fail(429, "rate_limited", "Too many requests. Wait a minute.", { "Retry-After": "60" }), origin);
    try {
      return withCors(await route(request, env), origin);
    } catch (err) {
      console.error("proxy error", (err as Error).message);
      return withCors(fail(502, "proxy_error", "The Worker couldn't finish this request."), origin);
    }
  },
} satisfies ExportedHandler<Env>;
