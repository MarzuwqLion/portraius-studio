// Contracts: Error mapping. Branches on error_type (RouterError.errorType, or
// ComfyError.code from a sync run), never on the detail text.
import type { AppError } from "@/lib/types/errors";

// Thrown by the client's own fetch calls (estimate, catalog). Carries the same
// fields the SDK's RouterError does, so the mapper treats both alike.
export class RouterHttpError extends Error {
  readonly errorType: string;
  readonly requestId: string | null;
  readonly httpStatus: number;
  readonly retryAfter: number | null;
  readonly detail: unknown;

  constructor(options: { errorType: string; requestId: string | null; httpStatus: number; retryAfter: number | null; detail?: unknown; message?: string }) {
    super(options.message ?? `Router answered ${options.httpStatus} ${options.errorType}`);
    this.name = "RouterHttpError";
    this.errorType = options.errorType;
    this.requestId = options.requestId;
    this.httpStatus = options.httpStatus;
    this.retryAfter = options.retryAfter;
    this.detail = options.detail;
  }
}

export interface ErrorContext {
  // From the queue's completion body or the X-Comfy-Refusal-Subject header.
  refusalSubject?: string;
  // From the catalog's billing.charges_on_policy_rejection.
  chargesOnRefusal?: boolean;
}

const WAIT_TYPES = new Set(["rate_limited", "concurrency_limit_exceeded", "queue_backlog_full"]);
const PROVIDER_TYPES = new Set([
  "provider_error", "provider_timeout", "queue_timeout", "deadline_exceeded",
  "service_unavailable", "internal_error", "client_disconnected",
]);
const KNOWN_TYPES = new Set([
  ...WAIT_TYPES, ...PROVIDER_TYPES,
  "invalid_input", "content_policy_violation", "insufficient_credits", "unauthorized",
  "forbidden", "not_enabled", "model_not_found", "cancelled", "request_not_found",
]);

const SUBJECT_WORDS: Record<string, string> = {
  input: "request",
  input_text: "prompt",
  input_image: "image",
  input_video: "clip",
  input_audio: "audio",
  output: "result",
  output_image: "image",
  output_video: "video",
  output_audio: "audio",
};

interface RouterLike {
  errorType: string;
  requestId: string | null;
  httpStatus: number | null;
  retryAfter: number | null;
  detail?: unknown;
}

function asRouterLike(err: unknown): RouterLike | null {
  if (!err || typeof err !== "object") return null;
  const e = err as Record<string, unknown>;
  // SDK RouterError (queue) and our RouterHttpError carry errorType.
  // SDK ComfyError (sync run) carries code, with the detail under details.detail.
  const type = typeof e.errorType === "string" ? e.errorType : typeof e.code === "string" && "requestId" in e ? e.code : null;
  if (!type) return null;
  const details = e.details as Record<string, unknown> | undefined;
  return {
    errorType: type,
    requestId: typeof e.requestId === "string" ? e.requestId : null,
    httpStatus: typeof e.httpStatus === "number" ? e.httpStatus : null,
    retryAfter: typeof e.retryAfter === "number" ? e.retryAfter : null,
    detail: e.detail ?? details?.detail,
  };
}

function fieldsFrom(detail: unknown): string[] {
  if (!Array.isArray(detail)) return [];
  return detail
    .map((d) => (d && typeof d === "object" && Array.isArray((d as { loc?: unknown }).loc) ? (d as { loc: unknown[] }).loc : null))
    .filter((loc): loc is unknown[] => loc !== null)
    .map((loc) => loc.filter((part) => part !== "body").join("."))
    .filter(Boolean);
}

export function isAppError(value: unknown): value is AppError {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.code === "string" && typeof v.message === "string" && (v.retry === "auto" || v.retry === "manual" || v.retry === "never");
}

export function appError(code: string, message: string, extra: Partial<AppError> = {}): AppError {
  return { code, message, retry: "never", ...extra };
}

export function toAppError(err: unknown, context: ErrorContext = {}): AppError {
  if (isAppError(err)) return err;

  if (err instanceof Error && err.name === "AbortError") {
    return { code: "cancelled", message: "Cancelled.", retry: "never" };
  }

  const router = asRouterLike(err);
  if (!router) {
    if (err instanceof TypeError) {
      return { code: "network_error", message: "Couldn't reach Comfy. Check your connection, then retry.", retry: "manual" };
    }
    return { code: "unknown", message: "Something went wrong.", retry: "manual" };
  }

  const requestId = router.requestId ?? undefined;
  const base = { code: router.errorType, ...(requestId ? { requestId } : {}) };
  const type = router.httpStatus === 410 ? "request_not_found" : KNOWN_TYPES.has(router.errorType) ? router.errorType : "internal_error";

  switch (type) {
    case "invalid_input": {
      const fields = fieldsFrom(router.detail);
      const list = fields.length ? fields.join(", ") : "one of the inputs";
      return { ...base, message: `This model didn't accept: ${list}.`, retry: "never", action: "edit_input", fields };
    }
    case "content_policy_violation": {
      const subject = SUBJECT_WORDS[context.refusalSubject ?? ""] ?? "request";
      const charge =
        context.chargesOnRefusal === true ? " This model still charges for declined requests."
        : context.chargesOnRefusal === false ? " You weren't charged."
        : "";
      return {
        ...base,
        message: `The provider declined this ${subject}.${charge}`,
        retry: "never",
        action: "edit_input",
        ...(context.refusalSubject ? { refusalSubject: context.refusalSubject } : {}),
      };
    }
    case "insufficient_credits":
      return { ...base, message: "Your Comfy workspace is out of credits.", retry: "never", action: "add_credits" };
    case "unauthorized":
    case "forbidden":
      return { ...base, message: "That key wasn't accepted, or it doesn't have Router access.", retry: "never", action: "check_key" };
    case "not_enabled":
      return { ...base, message: "This isn't enabled for your key yet.", retry: "never", action: "check_key" };
    case "model_not_found":
      // A registry bug, not something the visitor can fix.
      console.error("Router does not know a registry model", { requestId });
      return { ...base, message: "This model isn't available right now.", retry: "never" };
    case "cancelled":
      return { ...base, message: "Cancelled.", retry: "never" };
    case "request_not_found":
      return { ...base, code: router.httpStatus === 410 ? "expired" : base.code, message: "This result expired before it was saved.", retry: "never" };
    default:
      if (WAIT_TYPES.has(type)) {
        return { ...base, message: "Waiting in line.", retry: "auto", action: "wait", ...(router.retryAfter !== null ? { retryAfter: router.retryAfter } : {}) };
      }
      return { ...base, message: "The provider didn't finish this one. Retry it?", retry: "manual" };
  }
}

// For display: every message carries the request ID when there is one.
export function errorText(error: AppError): string {
  return error.requestId ? `${error.message} Request ID ${error.requestId}.` : error.message;
}
