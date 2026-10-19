import { describe, expect, it, vi } from "vitest";
import { RouterHttpError, appError, errorText, toAppError } from "./errors";

const routerError = (errorType: string, fields: Partial<{ httpStatus: number; retryAfter: number | null; detail: unknown }> = {}) =>
  new RouterHttpError({ errorType, requestId: "req-1", httpStatus: fields.httpStatus ?? 400, retryAfter: fields.retryAfter ?? null, detail: fields.detail });

describe("toAppError (Contracts: Error mapping)", () => {
  it("lists invalid_input field paths, without the body prefix", () => {
    const err = routerError("invalid_input", { detail: [{ loc: ["body", "generationConfig", "imageConfig", "aspectRatio"] }, { loc: ["body", "contents"] }] });
    expect(toAppError(err)).toMatchObject({
      code: "invalid_input",
      message: "This model didn't accept: generationConfig.imageConfig.aspectRatio, contents.",
      retry: "never",
      action: "edit_input",
      fields: ["generationConfig.imageConfig.aspectRatio", "contents"],
    });
  });

  it("says one of the inputs when invalid_input has no detail (as Seedance sends)", () => {
    expect(toAppError(routerError("invalid_input", { detail: [] })).message).toBe("This model didn't accept: one of the inputs.");
  });

  it("names the refused side and whether refusals are charged", () => {
    expect(toAppError(routerError("content_policy_violation"), { refusalSubject: "output_audio", chargesOnRefusal: true })).toMatchObject({
      message: "The provider declined this audio. This model still charges for declined requests.",
      refusalSubject: "output_audio",
      action: "edit_input",
    });
    expect(toAppError(routerError("content_policy_violation"), { chargesOnRefusal: false }).message).toBe("The provider declined this request. You weren't charged.");
  });

  it("maps credits, keys and rollout errors to their actions", () => {
    expect(toAppError(routerError("insufficient_credits"))).toMatchObject({ action: "add_credits", retry: "never" });
    expect(toAppError(routerError("unauthorized"))).toMatchObject({ action: "check_key", message: "That key wasn't accepted, or it doesn't have Router access." });
    expect(toAppError(routerError("forbidden")).action).toBe("check_key");
    expect(toAppError(routerError("not_enabled"))).toMatchObject({ action: "check_key", message: "This isn't enabled for your key yet." });
  });

  it("waits in line, automatically, for rate and queue limits", () => {
    for (const type of ["rate_limited", "concurrency_limit_exceeded", "queue_backlog_full"]) {
      expect(toAppError(routerError(type, { retryAfter: 12 }))).toMatchObject({ message: "Waiting in line.", retry: "auto", action: "wait", retryAfter: 12 });
    }
  });

  it("offers a manual retry for provider failures", () => {
    for (const type of ["provider_error", "provider_timeout", "queue_timeout", "deadline_exceeded", "service_unavailable", "internal_error", "client_disconnected"]) {
      expect(toAppError(routerError(type))).toMatchObject({ message: "The provider didn't finish this one. Retry it?", retry: "manual" });
    }
  });

  it("treats an unknown error_type as internal_error but keeps its code", () => {
    expect(toAppError(routerError("brand_new_type"))).toMatchObject({ code: "brand_new_type", retry: "manual", message: "The provider didn't finish this one. Retry it?" });
  });

  it("reports a missing model as a registry bug", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(toAppError(routerError("model_not_found")).message).toBe("This model isn't available right now.");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("maps cancelled, not found and HTTP 410", () => {
    expect(toAppError(routerError("cancelled")).message).toBe("Cancelled.");
    expect(toAppError(routerError("request_not_found", { httpStatus: 404 }))).toMatchObject({ code: "request_not_found", message: "This result expired before it was saved." });
    expect(toAppError(routerError("gone", { httpStatus: 410 }))).toMatchObject({ code: "expired", message: "This result expired before it was saved." });
  });

  it("reads a sync run's ComfyError, which carries code and details.detail", () => {
    const err = { code: "invalid_input", requestId: "req-2", httpStatus: 422, details: { detail: [{ loc: ["body", "voice_id"] }] } };
    expect(toAppError(err)).toMatchObject({ code: "invalid_input", requestId: "req-2", fields: ["voice_id"] });
  });

  it("handles aborts, network failures and anything else", () => {
    expect(toAppError(Object.assign(new Error("aborted"), { name: "AbortError" })).code).toBe("cancelled");
    expect(toAppError(new TypeError("Failed to fetch"))).toMatchObject({ code: "network_error", retry: "manual" });
    expect(toAppError("??")).toMatchObject({ code: "unknown", retry: "manual" });
  });

  it("passes an AppError through unchanged", () => {
    const error = appError("download_failed", "x", { retry: "manual" });
    expect(toAppError(error)).toBe(error);
  });
});

describe("errorText", () => {
  it("always shows the request ID when there is one", () => {
    expect(errorText(toAppError(routerError("provider_error")))).toBe("The provider didn't finish this one. Retry it? Request ID req-1.");
    expect(errorText(appError("x", "No ID here."))).toBe("No ID here.");
  });
});
