// Origins the browser may reach. The CSP connect-src and the download allowlist
// both read from here, so a host is added in one place.

export const ROUTER_DEFAULT_BASE_URL = "https://api.comfy.org";

// Comfy Cloud's asset store, the default media host (VITE_MEDIA_HOST=comfy-assets).
export const COMFY_CLOUD_API_URL = "https://cloud.comfy.org/api/v2";

// Result asset hosts the browser downloads from directly. Filled from the M1
// download checks (docs/notes/m1-findings.md).
export const ASSET_HOSTS: readonly string[] = [];

export function connectSources(options: { routerBaseUrl?: string; workerUrl?: string }): string[] {
  const origins = new Set<string>([ROUTER_DEFAULT_BASE_URL]);
  for (const url of [options.routerBaseUrl, options.workerUrl]) {
    if (url) origins.add(new URL(url).origin);
  }
  for (const host of ASSET_HOSTS) origins.add(`https://${host}`);
  return [...origins];
}
