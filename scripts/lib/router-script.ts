// Shared helpers for scripts that make real Router calls with the shell's
// COMFY_API_KEY. The key is read once and handed to the Router client; it is
// never printed or written anywhere.
import * as router from "../../src/lib/router/client.ts";

export function useShellKey(): void {
  const key = process.env.COMFY_API_KEY?.trim();
  if (!key) {
    console.error("Set COMFY_API_KEY in your shell first. It is read from the environment only.");
    process.exit(2);
  }
  router.setRouterKey(key);
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function pollToCompletion(modelId: string, requestId: string, limitMs = 15 * 60_000) {
  const started = Date.now();
  const trail: { status: string; queuePosition: number | null; atMs: number }[] = [];
  for (;;) {
    const s = await router.status(modelId, requestId);
    const last = trail[trail.length - 1];
    if (!last || last.status !== s.status || last.queuePosition !== s.queuePosition) {
      trail.push({ status: s.status, queuePosition: s.queuePosition, atMs: Date.now() - started });
    }
    if (s.completed) return { trail, errorType: s.errorType, raw: s.raw };
    if (Date.now() - started > limitMs) throw new Error(`${modelId} ${requestId} still ${s.status} after ${limitMs / 1000}s`);
    await sleep(Math.min(Math.max(s.retryAfterMs ?? 2000, 1000), 10_000));
  }
}

// Recorded fixtures keep the response shape but not the bytes or the signatures:
// long base64 strings become a placeholder, and signed URLs lose their query.
export function stripForFixture(value: unknown): unknown {
  if (typeof value === "string") {
    if (/^https?:\/\//.test(value)) {
      const u = new URL(value);
      return u.search ? `${u.origin}${u.pathname}?signed-query-stripped` : value;
    }
    if (value.length > 512 && /^[A-Za-z0-9+/=\s]+$/.test(value.slice(0, 512))) {
      return `<base64 stripped: ${value.length} chars>`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(stripForFixture);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripForFixture(v)]));
  }
  return value;
}

export function describeError(err: unknown): Record<string, unknown> {
  const e = err as { name?: string; message?: string; errorType?: string; code?: string; requestId?: string | null; httpStatus?: number; detail?: unknown };
  return {
    name: e?.name,
    message: e?.message?.slice(0, 400),
    errorType: e?.errorType ?? e?.code,
    requestId: e?.requestId,
    httpStatus: e?.httpStatus,
    detail: e?.detail,
  };
}
