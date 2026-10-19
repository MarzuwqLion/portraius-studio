// The only module that imports @comfyorg/sdk. Every Router call checks the
// model against the registry allowlist and carries the visitor's key, which
// lives only in this module (and in the SDK's private binding).
import { comfy } from "@comfyorg/sdk";
import { config } from "@/lib/config";
import { isAllowedModel } from "@/lib/registry/models";
import type { JobEstimate } from "@/lib/types/jobs";
import { RouterHttpError, appError } from "./errors";
import { COMFY_CLOUD_API_URL } from "./hosts";

// Router caps a request body at 100 MiB.
export const MAX_BODY_BYTES = 100 * 1024 * 1024;

let apiKey: string | undefined;

export function setRouterKey(key: string | undefined): void {
  apiKey = key?.trim() || undefined;
  comfy.config({ credentials: apiKey, baseUrl: config.routerBaseUrl });
}

export function hasRouterKey(): boolean {
  return apiKey !== undefined;
}

function requireKey(): string {
  if (!apiKey) throw appError("no_key", "Add your Comfy API key in Settings first.", { action: "check_key" });
  return apiKey;
}

function requireModel(modelId: string): void {
  if (!isAllowedModel(modelId)) {
    throw appError("model_not_allowed", "This model isn't in Portraius Studio's model list.");
  }
}

function checkedBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw appError("invalid_body", "The request body must be a JSON object.");
  }
  const bytes = new TextEncoder().encode(JSON.stringify(body)).byteLength;
  if (bytes > MAX_BODY_BYTES) {
    throw appError("body_too_large", "These inputs are over Router's 100 MB limit. Use fewer or smaller references.", { action: "edit_input" });
  }
  return body as Record<string, unknown>;
}

function modelPath(modelId: string): string {
  return modelId.split("/").map(encodeURIComponent).join("/");
}

// ---- Session spend, from X-Comfy-Credits-Used ----

type CreditsListener = (totalCredits: number) => void;
let sessionCredits = 0;
const creditListeners = new Set<CreditsListener>();

function recordCredits(raw: string | null | undefined): void {
  const credits = raw ? Number(raw) : NaN;
  if (!Number.isFinite(credits)) return;
  sessionCredits += credits;
  for (const listener of creditListeners) listener(sessionCredits);
}

export function onSessionCredits(listener: CreditsListener): () => void {
  creditListeners.add(listener);
  listener(sessionCredits);
  return () => creditListeners.delete(listener);
}

function warnIfFallback(servingProvider: string | null | undefined, requestId: string | null): void {
  if (servingProvider) console.warn("Router served this call from a fallback provider", { servingProvider, requestId });
}

// ---- Raw fetch, for routes the SDK doesn't cover ----

async function routerFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const key = requireKey();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${key}`);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(`${config.routerBaseUrl}${path}`, { ...init, headers });
  if (!response.ok) throw await httpError(response);
  return response;
}

async function httpError(response: Response): Promise<RouterHttpError> {
  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    // Not JSON; the headers still carry the error type and request ID.
  }
  const retryAfter = Number(response.headers.get("Retry-After"));
  return new RouterHttpError({
    errorType: response.headers.get("X-Comfy-Error-Type") ?? (typeof body.error_type === "string" ? body.error_type : "internal_error"),
    requestId: response.headers.get("X-Comfy-Request-Id") ?? (typeof body.request_id === "string" ? body.request_id : null),
    httpStatus: response.status,
    retryAfter: Number.isFinite(retryAfter) && response.headers.has("Retry-After") ? retryAfter : null,
    detail: body.detail,
  });
}

// ---- Key check ----

export async function checkKey(signal?: AbortSignal): Promise<void> {
  requireKey();
  await comfy.models.list({ limit: 1, signal }).page();
}

// ---- Queue ----

export interface SubmitResult {
  requestId: string;
}

export async function submit(
  modelId: string,
  body: unknown,
  options: { idempotencyKey: string; signal?: AbortSignal },
): Promise<SubmitResult> {
  requireKey();
  requireModel(modelId);
  const handle = await comfy.models.submit(modelId, checkedBody(body), {
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
  return { requestId: handle.requestId };
}

export interface StatusResult {
  status: string; // IN_QUEUE | IN_PROGRESS | COMPLETED
  completed: boolean;
  queuePosition: number | null;
  errorType: string | null;
  retryAfterMs: number | null;
  raw: Record<string, unknown>;
}

export async function status(modelId: string, requestId: string, signal?: AbortSignal): Promise<StatusResult> {
  requireKey();
  requireModel(modelId);
  const update = await comfy.models.handle(modelId, requestId).status({ signal });
  return {
    status: update.status,
    completed: update.completed,
    queuePosition: update.queuePosition,
    errorType: update.errorType,
    retryAfterMs: update.retryAfterMs,
    raw: update.raw,
  };
}

export interface ResultData {
  data: unknown;
  requestId: string | null;
  creditsUsed: string | null;
}

// Reads a finished request. Rejects with the typed Router error when the
// request completed with an error_type.
export async function result(modelId: string, requestId: string, signal?: AbortSignal): Promise<ResultData> {
  requireKey();
  requireModel(modelId);
  const res = await comfy.models.handle(modelId, requestId).get({ signal });
  warnIfFallback(res.servingProvider, res.requestId);
  recordCredits(res.creditsUsed);
  return { data: res.data, requestId: res.requestId, creditsUsed: res.creditsUsed ?? null };
}

export async function cancel(modelId: string, requestId: string): Promise<void> {
  requireKey();
  requireModel(modelId);
  await comfy.models.handle(modelId, requestId).cancel();
}

// ---- Sync run: only for models that return bytes, never with a fallback ----

export interface SyncResult {
  kind: "json" | "binary";
  data: unknown;
  contentType?: string;
  requestId: string | null;
}

export async function run(
  modelId: string,
  body: unknown,
  options: { idempotencyKey?: string; signal?: AbortSignal } = {},
): Promise<SyncResult> {
  requireKey();
  requireModel(modelId);
  const res = await comfy.models.run(modelId, checkedBody(body), {
    fallbackProvider: false,
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
  warnIfFallback(res.servingProvider, res.requestId);
  recordCredits(res.creditsUsed);
  return res.kind === "binary"
    ? { kind: "binary", data: res.data, contentType: res.contentType, requestId: res.requestId }
    : { kind: "json", data: res.data, requestId: res.requestId };
}

// ---- Estimate ----

export interface EstimateResult {
  // false when the route answers 403 not_enabled: hide the figure.
  enabled: boolean;
  estimate: JobEstimate;
  reason?: string;
}

export function parseEstimate(raw: unknown): JobEstimate & { reason?: string } {
  const e = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  if (e.source === "exact" && num(e.amount_cents) !== undefined) {
    return { source: "exact", amountCents: num(e.amount_cents) };
  }
  if (e.source === "estimated" && num(e.min_amount_cents) !== undefined && num(e.max_amount_cents) !== undefined) {
    return { source: "estimated", minCents: num(e.min_amount_cents), maxCents: num(e.max_amount_cents) };
  }
  return { source: "unknown", ...(typeof e.reason === "string" ? { reason: e.reason } : {}) };
}

export async function estimate(modelId: string, body: unknown, signal?: AbortSignal): Promise<EstimateResult> {
  requireModel(modelId);
  try {
    const response = await routerFetch(`/v2/models/${modelPath(modelId)}/estimate`, {
      method: "POST",
      body: JSON.stringify(checkedBody(body)),
      signal,
    });
    const { reason, ...parsed } = parseEstimate(await response.json());
    return { enabled: true, estimate: parsed, ...(reason ? { reason } : {}) };
  } catch (err) {
    if (err instanceof RouterHttpError && err.errorType === "not_enabled") {
      return { enabled: false, estimate: { source: "unknown" } };
    }
    throw err;
  }
}

// ---- Comfy Cloud asset store (media hosting for inputs that must be URLs) ----

export interface HostedAsset {
  id: string;
  url: string;
  expiresAt: string | null;
}

export async function uploadAsset(
  file: Blob,
  options: { filePath: string; contentType: string; signal?: AbortSignal },
): Promise<HostedAsset> {
  const key = requireKey();
  // The metadata fields must come before the file part.
  const form = new FormData();
  form.append("content_type", options.contentType);
  form.append("file_path", options.filePath);
  form.append("file", file, options.filePath);
  const response = await fetch(`${COMFY_CLOUD_API_URL}/assets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: options.signal,
  });
  if (!response.ok) throw await httpError(response);
  const asset = (await response.json()) as { id: string; url: string; url_expires_at?: string | null };
  return { id: asset.id, url: asset.url, expiresAt: asset.url_expires_at ?? null };
}

export async function deleteAsset(id: string): Promise<void> {
  const key = requireKey();
  const response = await fetch(`${COMFY_CLOUD_API_URL}/assets/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!response.ok && response.status !== 404) throw await httpError(response);
}

// ---- Diagnostics: which Comfy response headers the browser can read ----

export async function probeRouterHeaders(probeModelId: string): Promise<Record<string, string | null>> {
  requireModel(probeModelId);
  const key = requireKey();
  const auth = { Authorization: `Bearer ${key}` };
  const ok = await fetch(`${config.routerBaseUrl}/v2/models?limit=1`, { headers: auth });
  // A status read for a request ID that doesn't exist answers 404 request_not_found.
  const missing = await fetch(
    `${config.routerBaseUrl}/v2/models/${modelPath(probeModelId)}/requests/00000000-0000-4000-8000-000000000000/status`,
    { headers: auth },
  );
  return {
    "catalog status": String(ok.status),
    "X-Comfy-Request-Id (200)": ok.headers.get("X-Comfy-Request-Id"),
    "missing request status": String(missing.status),
    "X-Comfy-Request-Id (error)": missing.headers.get("X-Comfy-Request-Id"),
    "X-Comfy-Error-Type": missing.headers.get("X-Comfy-Error-Type"),
    "Retry-After": missing.headers.get("Retry-After"),
  };
}

// ---- Catalog and schemas ----

export async function catalogModel(modelId: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  requireModel(modelId);
  const response = await routerFetch(`/v2/models/${modelPath(modelId)}`, { signal });
  return (await response.json()) as Record<string, unknown>;
}

export async function modelSchema(
  modelId: string,
  etag?: string | null,
): Promise<{ unchanged: boolean; document?: unknown; etag: string | null }> {
  requireKey();
  requireModel(modelId);
  const res = await comfy.models.schema(modelId, { etag: etag ?? null });
  return res.unchanged ? { unchanged: true, etag: res.etag } : { unchanged: false, document: res.document, etag: res.etag };
}
