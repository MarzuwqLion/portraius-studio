// Contracts: Configuration. No secret ever goes in a VITE_ variable.
import { ROUTER_DEFAULT_BASE_URL } from "@/lib/router/hosts";

// import.meta.env is undefined when scripts run under tsx rather than Vite.
const env: Partial<ImportMetaEnv> = import.meta.env ?? {};

export const config = {
  routerBaseUrl: env.VITE_ROUTER_BASE_URL || ROUTER_DEFAULT_BASE_URL,
  mediaHost: env.VITE_MEDIA_HOST === "comfy-assets" ? "comfy-assets" : "worker",
  workerUrl: env.VITE_WORKER_URL || "",
} as const;
