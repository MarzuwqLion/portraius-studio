// M1 day-one checks (spec: Architecture, Day-one risks; Unknowns rows 1 to 6).
// Development builds only. Runs real Router calls with the visitor's key at the
// cheapest settings, and records what the browser could and couldn't do.
// Results never include the key, and signed URLs are cut to origin and path.
import { MODEL_IDS } from "@/lib/registry/models";
import * as router from "@/lib/router/client";
import { downloadAsset } from "@/lib/router/download";
import { toAppError } from "@/lib/router/errors";

export interface CheckResult {
  id: string;
  rows: string;
  title: string;
  outcome: "pass" | "fail" | "info";
  details: Record<string, unknown>;
  ms: number;
}

type Report = (result: CheckResult) => void;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname.length > 60 ? `${u.pathname.slice(0, 60)}...` : u.pathname}`;
  } catch {
    return "(not a URL)";
  }
}

function describeError(err: unknown): Record<string, unknown> {
  const app = toAppError(err);
  const e = err as { name?: string; message?: string; httpStatus?: number };
  return { name: e?.name, message: e?.message?.slice(0, 300), httpStatus: e?.httpStatus, code: app.code, requestId: app.requestId };
}

async function timed(id: string, rows: string, title: string, report: Report, fn: () => Promise<Omit<CheckResult, "id" | "rows" | "title" | "ms">>) {
  const started = performance.now();
  try {
    const result = await fn();
    report({ id, rows, title, ...result, ms: Math.round(performance.now() - started) });
  } catch (err) {
    report({ id, rows, title, outcome: "fail", details: describeError(err), ms: Math.round(performance.now() - started) });
  }
}

async function pollToCompletion(modelId: string, requestId: string, limitMs = 12 * 60_000) {
  const started = Date.now();
  const trail: { status: string; queuePosition: number | null; retryAfterMs: number | null; atMs: number }[] = [];
  for (;;) {
    const s = await router.status(modelId, requestId);
    const last = trail[trail.length - 1];
    if (!last || last.status !== s.status || last.queuePosition !== s.queuePosition) {
      trail.push({ status: s.status, queuePosition: s.queuePosition, retryAfterMs: s.retryAfterMs, atMs: Date.now() - started });
    }
    if (s.completed) return { trail, errorType: s.errorType, raw: s.raw };
    if (Date.now() - started > limitMs) throw new Error(`still ${s.status} after ${limitMs / 1000}s`);
    await sleep(Math.min(Math.max(s.retryAfterMs ?? 2000, 1000), 10_000));
  }
}

const IMAGE_PROMPT =
  "Studio portrait of a designed character: a woman in her sixties with silver braids and a green linen jacket, " +
  "neutral grey seamless backdrop, soft window light, 85mm lens.";

function nanoBody(thinkingLevel?: "MINIMAL" | "HIGH") {
  return {
    contents: [{ role: "user", parts: [{ text: IMAGE_PROMPT }] }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { aspectRatio: "1:1", imageSize: "1K" },
      ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
    },
  };
}

const seedanceDraftBody = {
  content: [{ type: "text", text: "Slow push-in on a ceramic teapot steaming on a wooden table beside a rainy window." }],
  draft: true,
  resolution: "480p",
  duration: 4,
  ratio: "16:9",
  generate_audio: false,
  return_last_frame: true,
  seed: 7,
};

interface GeminiPart {
  inlineData?: { mimeType?: string; data?: string };
  fileData?: { mimeType?: string; fileUri?: string };
}

function geminiImage(data: unknown): GeminiPart | undefined {
  const parts = (data as { candidates?: { content?: { parts?: GeminiPart[] } }[] })?.candidates?.[0]?.content?.parts ?? [];
  return parts.find((p) => p.inlineData?.data || p.fileData?.fileUri);
}

export async function runDayOneChecks(report: Report): Promise<void> {
  let imageBase64: string | undefined;
  let imageMime = "image/png";
  let video: Blob | undefined;

  await timed("catalog", "1, 5", "List models from the browser (CORS, SDK)", report, async () => {
    await router.checkKey();
    return { outcome: "pass", details: { note: "comfy.models.list().page() resolved in the browser" } };
  });

  await timed("headers", "4", "Read Comfy response headers", report, async () => {
    const headers = await router.probeRouterHeaders(MODEL_IDS.nanoBanana);
    const readable = headers["X-Comfy-Request-Id (200)"] !== null && headers["X-Comfy-Error-Type"] !== null;
    return { outcome: readable ? "pass" : "fail", details: headers };
  });

  await timed("estimate", "6", "Estimate a Nano Banana 2.1 image", report, async () => {
    const result = await router.estimate(MODEL_IDS.nanoBanana, nanoBody("MINIMAL"));
    return { outcome: result.enabled ? "pass" : "fail", details: { ...result } };
  });

  await timed("nano-queue", "1, 3, 5", "Queue a Nano Banana 2.1 image, poll, collect", report, async () => {
    let body = nanoBody("MINIMAL");
    let thinking = "MINIMAL accepted";
    let submitted: router.SubmitResult;
    try {
      submitted = await router.submit(MODEL_IDS.nanoBanana, body, { idempotencyKey: crypto.randomUUID() });
    } catch (err) {
      if (toAppError(err).code !== "invalid_input") throw err;
      thinking = `MINIMAL refused (${toAppError(err).message}); retried without thinkingConfig`;
      body = nanoBody();
      submitted = await router.submit(MODEL_IDS.nanoBanana, body, { idempotencyKey: crypto.randomUUID() });
    }
    const polled = await pollToCompletion(MODEL_IDS.nanoBanana, submitted.requestId);
    const res = await router.result(MODEL_IDS.nanoBanana, submitted.requestId);
    const part = geminiImage(res.data);
    let delivery = "none";
    let bytes = 0;
    if (part?.inlineData?.data) {
      delivery = "inlineData (base64)";
      imageBase64 = part.inlineData.data;
      imageMime = part.inlineData.mimeType ?? imageMime;
      bytes = Math.round((imageBase64.length * 3) / 4);
    } else if (part?.fileData?.fileUri) {
      delivery = `fileData.fileUri on ${safeUrl(part.fileData.fileUri)}`;
      const blob = await downloadAsset({ kind: "image", url: part.fileData.fileUri, mime: part.fileData.mimeType });
      bytes = blob.size;
    }
    return {
      outcome: part ? "pass" : "fail",
      details: { requestId: submitted.requestId, resultRequestId: res.requestId, creditsUsed: res.creditsUsed, thinking, statusTrail: polled.trail, delivery, mime: imageMime, bytes },
    };
  });

  await timed("seedance-download", "3", "Seedance 2.5 4 s 480p draft, then download its video and last frame", report, async () => {
    const est = await router.estimate(MODEL_IDS.seedance, seedanceDraftBody).catch((err) => ({ error: describeError(err) }));
    const submitted = await router.submit(MODEL_IDS.seedance, seedanceDraftBody, { idempotencyKey: crypto.randomUUID() });
    const polled = await pollToCompletion(MODEL_IDS.seedance, submitted.requestId);
    const res = await router.result(MODEL_IDS.seedance, submitted.requestId);
    const data = res.data as { id?: string; content?: { video_url?: string; last_frame_url?: string } };
    const details: Record<string, unknown> = {
      requestId: submitted.requestId,
      draftTaskId: data.id,
      creditsUsed: res.creditsUsed,
      estimate: est,
      statusTrail: polled.trail,
      videoHost: data.content?.video_url ? safeUrl(data.content.video_url) : null,
      lastFrameHost: data.content?.last_frame_url ? safeUrl(data.content.last_frame_url) : null,
    };
    if (!data.content?.video_url) return { outcome: "fail", details: { ...details, note: "no video_url" } };
    video = await downloadAsset({ kind: "video", url: data.content.video_url });
    details.videoBytes = video.size;
    details.videoMime = video.type;
    if (data.content.last_frame_url) {
      const frame = await downloadAsset({ kind: "frame", url: data.content.last_frame_url });
      details.lastFrameBytes = frame.size;
      details.lastFrameMime = frame.type;
    }
    return { outcome: "pass", details };
  });

  await timed("freepik-download", "3", "Freepik skin enhancer, then download from Freepik's own link", report, async () => {
    if (!imageBase64) return { outcome: "info", details: { note: "skipped: no image from the Nano Banana check" } };
    const body = { image: imageBase64, skin_detail: 60, sharpen: 0, smart_grain: 2 };
    const submitted = await router.submit(MODEL_IDS.freepikSkin, body, { idempotencyKey: crypto.randomUUID() });
    const polled = await pollToCompletion(MODEL_IDS.freepikSkin, submitted.requestId);
    const res = await router.result(MODEL_IDS.freepikSkin, submitted.requestId);
    const url = (res.data as { data?: { generated?: string[] } }).data?.generated?.[0];
    if (!url) return { outcome: "fail", details: { requestId: submitted.requestId, statusTrail: polled.trail, note: "no generated URL" } };
    const blob = await downloadAsset({ kind: "image", url });
    return {
      outcome: "pass",
      details: { requestId: submitted.requestId, creditsUsed: res.creditsUsed, statusTrail: polled.trail, host: safeUrl(url), bytes: blob.size, mime: blob.type, inputMime: imageMime },
    };
  });

  await timed("cloud-upload", "2", "Upload a clip to Comfy Cloud's asset store from the browser", report, async () => {
    const file = video ?? new Blob(["portraius m1 check"], { type: "text/plain" });
    const hosted = await router.uploadAsset(file, {
      filePath: video ? "portraius-m1-check.mp4" : "portraius-m1-check.txt",
      contentType: video ? "video/mp4" : "text/plain",
    });
    const anonymous = await fetch(hosted.url, { credentials: "omit" }).then((r) => r.status).catch((err) => `fetch failed: ${(err as Error).message}`);
    await router.deleteAsset(hosted.id).catch(() => undefined);
    return { outcome: "pass", details: { host: safeUrl(hosted.url), expiresAt: hosted.expiresAt, anonymousFetchStatus: anonymous } };
  });
}
