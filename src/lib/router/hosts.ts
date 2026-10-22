// Origins the browser may reach. The CSP connect-src and the download allowlist
// both read from here, so a host is added in one place.

export const ROUTER_DEFAULT_BASE_URL = "https://api.comfy.org";

// Comfy Cloud's asset store (VITE_MEDIA_HOST=comfy-assets). Browsers can't reach it (M1), so
// the default media host is the Worker.
export const COMFY_CLOUD_API_URL = "https://cloud.comfy.org/api/v2";

// Result asset hosts the browser downloads from directly: they send CORS
// headers (docs/notes/m1-findings.md). Freepik serves from Magnific's CDN;
// Kling from its own, whose host name carries a number (v15-kling-fdl...);
// HappyHorse from an Alibaba OSS bucket on the accelerate endpoint
// (dashscope-463f.oss-accelerate...). Both with Access-Control-Allow-Origin: *
// (M7). These only matter on the built site: the CSP lists them.
export const ASSET_HOSTS: readonly string[] = ["ai-statics.magnific.com", "*.klingai.com", "*.oss-accelerate.aliyuncs.com"];

// Result asset locations that send no CORS headers, so the browser fetches them
// through the Worker's /fetch route (Unknowns row 3). Comfy rehosts Seedance
// results in this bucket. Sync Labs' result link answers any request carrying
// an Origin header (every browser fetch) with a 500, and otherwise redirects
// to a presigned link in its S3 bucket, which the Worker follows (M7).
export const WORKER_FETCH_PREFIXES: readonly string[] = [
  "https://storage.googleapis.com/partner-nodes-assets/",
  "https://api.sync.so/v2/generations/",
  "https://private-sync-user-generations-v2.s3.amazonaws.com/generations/",
];

// When Comfy can't rehost a Seedance link it passes on BytePlus's own (M3: a
// draft's video_url on ark-acg-ap-southeast-1.tos-ap-southeast-1.volces.com).
export const WORKER_FETCH_HOSTS: readonly RegExp[] = [/^ark-acg-[a-z0-9-]+.tos-[a-z0-9-]+.volces.com$/];

// Whether a result link has to go through the Worker. Checked on the parsed,
// normalised URL, so ../ segments and lookalike hosts don't match.
export function needsWorkerFetch(link: string | URL): boolean {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return WORKER_FETCH_PREFIXES.some((prefix) => url.href.startsWith(prefix)) || WORKER_FETCH_HOSTS.some((host) => host.test(url.hostname));
}

// The visitor's own ComfyUI (spec: Local engine). An https page may call
// plain-http loopback, on any port; other hosts need the app run locally.
export const LOCAL_COMFY_ORIGINS: readonly string[] = ["http://127.0.0.1:*", "http://localhost:*"];

export function connectSources(options: { routerBaseUrl?: string; workerUrl?: string }): string[] {
  const origins = new Set<string>([ROUTER_DEFAULT_BASE_URL, ...LOCAL_COMFY_ORIGINS]);
  for (const url of [options.routerBaseUrl, options.workerUrl]) {
    if (url) origins.add(new URL(url).origin);
  }
  for (const host of ASSET_HOSTS) origins.add(`https://${host}`);
  return [...origins];
}
