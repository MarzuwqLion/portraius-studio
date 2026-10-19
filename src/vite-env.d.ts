/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROUTER_BASE_URL?: string;
  readonly VITE_MEDIA_HOST?: "comfy-assets" | "worker";
  readonly VITE_WORKER_URL?: string;
  readonly VITE_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
