import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nanoRecorded from "../../../test/fixtures/nano-banana-2.1.result.json";
import seedanceRecorded from "../../../test/fixtures/seedance-2.5.draft.result.json";
import { MODEL_IDS } from "@/lib/registry/models";
import { RouterHttpError } from "@/lib/router/errors";
import { db } from "@/lib/store/db";
import type { Job } from "@/lib/types/jobs";

const router = vi.hoisted(() => ({
  submit: vi.fn(),
  status: vi.fn(),
  result: vi.fn(),
  cancel: vi.fn(),
  deleteAsset: vi.fn(),
}));
vi.mock("@/lib/router/client", () => router);

const download = vi.hoisted(() => ({ downloadAsset: vi.fn() }));
vi.mock("@/lib/router/download", () => download);

import { cancelJob, resumeJobs, setScorer, settled, startJob, timing } from "./runner";

const imageInput = {
  model: { prompt: "A teapot", references: [], aspectRatio: "1:1" as const, size: "1K" as const, quality: "fast" as const },
  characterIds: [],
  prompt: "A teapot",
};
const videoInput = {
  model: { stage: "draft" as const, prompt: "A teapot steams", durationSec: 4, generateAudio: false },
  characterIds: [],
};

const status = (s: string, extra: Record<string, unknown> = {}) => ({
  status: s,
  completed: s === "COMPLETED",
  queuePosition: null,
  errorType: null,
  retryAfterMs: null,
  raw: {},
  ...extra,
});

function routerError(errorType: string, httpStatus = 400) {
  return new RouterHttpError({ errorType, requestId: "req-err", httpStatus, retryAfter: null });
}

async function seed(fields: Partial<Job>): Promise<Job> {
  const job: Job = {
    id: crypto.randomUUID(),
    kind: "image",
    modelId: MODEL_IDS.nanoBanana,
    idempotencyKey: "k",
    input: imageInput,
    status: "queued",
    requestId: "req-1",
    generationIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...fields,
  };
  await db.jobs.put(job);
  return job;
}

beforeEach(async () => {
  await Promise.all([db.jobs.clear(), db.generations.clear(), db.blobs.clear()]);
  for (const fn of [...Object.values(router), download.downloadAsset]) fn.mockReset();
  timing.sleep = async () => undefined;
  router.submit.mockResolvedValue({ requestId: "req-1" });
  router.deleteAsset.mockResolvedValue(undefined);
  router.cancel.mockResolvedValue(undefined);
  download.downloadAsset.mockImplementation(async (ref: { kind: string; mime?: string }) =>
    new Blob([`bytes of ${ref.kind}`], { type: ref.mime ?? (ref.kind === "video" ? "video/mp4" : "image/jpeg") }),
  );
  setScorer(async () => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a job from submit to done", () => {
  it("queues, polls, collects and saves a Nano Banana image", async () => {
    router.status
      .mockResolvedValueOnce(status("IN_QUEUE", { queuePosition: 2 }))
      .mockResolvedValueOnce(status("IN_PROGRESS"))
      .mockResolvedValueOnce(status("COMPLETED"));
    router.result.mockResolvedValue({ data: nanoRecorded, requestId: "r", creditsUsed: null });

    const started = await startJob({ kind: "image", modelId: MODEL_IDS.nanoBanana, input: imageInput });
    expect(started.status).toBe("submitting");
    const job = await settled(started.id, 5000);

    expect(job).toMatchObject({ status: "done", requestId: "req-1", generationIds: [`${job.id}-g0`] });
    expect(job.rawResult).toBeUndefined();
    expect(router.submit).toHaveBeenCalledWith(MODEL_IDS.nanoBanana, expect.objectContaining({ contents: expect.any(Array) }), { idempotencyKey: job.idempotencyKey });

    const generation = await db.generations.get(`${job.id}-g0`);
    expect(generation).toMatchObject({ type: "image", modelId: MODEL_IDS.nanoBanana, jobId: job.id, prompt: "A teapot" });
    // Only the final image, not the thought image.
    expect(generation!.assets).toHaveLength(1);
    expect(await db.blobs.get(generation!.assets[0]!.blobId)).toMatchObject({ mime: "image/png" });
  });

  it("saves a Seedance draft's video, last frame and draft task ID", async () => {
    router.status.mockResolvedValue(status("COMPLETED"));
    router.result.mockResolvedValue({ data: seedanceRecorded, requestId: "r", creditsUsed: null });

    const started = await startJob({ kind: "video", modelId: MODEL_IDS.seedance, input: videoInput });
    const job = await settled(started.id, 5000);

    expect(job).toMatchObject({ status: "done", draftTaskId: seedanceRecorded.id });
    const generation = await db.generations.get(job.generationIds[0]!);
    expect(generation!.assets.map((a) => [a.kind, a.mime])).toEqual([["video", "video/mp4"], ["frame", "image/jpeg"]]);
  });

  it("scores jobs with a cast before calling them done", async () => {
    const scored: string[][] = [];
    setScorer(async (_job, ids) => void scored.push(ids));
    router.status.mockResolvedValue(status("COMPLETED"));
    router.result.mockResolvedValue({ data: nanoRecorded, requestId: "r", creditsUsed: null });

    const started = await startJob({ kind: "image", modelId: MODEL_IDS.nanoBanana, input: { ...imageInput, characterIds: ["char-1"] } });
    const job = await settled(started.id, 5000);
    expect(job.status).toBe("done");
    expect(scored).toEqual([[`${job.id}-g0`]]);
    expect((await db.generations.get(job.generationIds[0]!))!.characterIds).toEqual(["char-1"]);
  });

  it("deletes the job's uploads when it ends", async () => {
    router.status.mockResolvedValue(status("COMPLETED"));
    router.result.mockResolvedValue({ data: seedanceRecorded, requestId: "r", creditsUsed: null });
    const started = await startJob({ kind: "video", modelId: MODEL_IDS.seedance, input: videoInput, uploads: ["abc.mp4", "def.wav"] });
    await settled(started.id, 5000);
    expect(router.deleteAsset.mock.calls).toEqual([["abc.mp4"], ["def.wav"]]);
  });
});

describe("failures", () => {
  it("never stores a job the adapter refuses", async () => {
    await expect(startJob({ kind: "video", modelId: MODEL_IDS.seedance, input: { ...videoInput, model: { ...videoInput.model, durationSec: 2 } } })).rejects.toThrow(RangeError);
    expect(await db.jobs.count()).toBe(0);
  });

  it("fails a submit Router refuses, with the mapped error", async () => {
    router.submit.mockRejectedValue(routerError("insufficient_credits", 402));
    const job = await settled((await startJob({ kind: "image", modelId: MODEL_IDS.nanoBanana, input: imageInput })).id, 5000);
    expect(job).toMatchObject({ status: "failed", error: { code: "insufficient_credits", action: "add_credits", requestId: "req-err" } });
  });

  it("retries a submit that hit a network error with the same idempotency key", async () => {
    router.submit.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue({ requestId: "req-1" });
    router.status.mockResolvedValue(status("COMPLETED"));
    router.result.mockResolvedValue({ data: nanoRecorded, requestId: "r", creditsUsed: null });
    const job = await settled((await startJob({ kind: "image", modelId: MODEL_IDS.nanoBanana, input: imageInput })).id, 5000);
    expect(job.status).toBe("done");
    expect(router.submit.mock.calls[0]![2]).toEqual(router.submit.mock.calls[1]![2]);
  });

  it("fails a run that completed with an error_type", async () => {
    router.status.mockResolvedValue(status("COMPLETED", { errorType: "content_policy_violation" }));
    router.result.mockRejectedValue(routerError("content_policy_violation"));
    const job = await settled((await startJob({ kind: "image", modelId: MODEL_IDS.nanoBanana, input: imageInput })).id, 5000);
    expect(job).toMatchObject({ status: "failed", error: { code: "content_policy_violation" } });
  });

  it("fails with download_failed after three attempts", async () => {
    router.status.mockResolvedValue(status("COMPLETED"));
    router.result.mockResolvedValue({ data: seedanceRecorded, requestId: "r", creditsUsed: null });
    download.downloadAsset.mockRejectedValue(new TypeError("Failed to fetch"));
    const job = await settled((await startJob({ kind: "video", modelId: MODEL_IDS.seedance, input: videoInput })).id, 5000);
    expect(job).toMatchObject({ status: "failed", error: { code: "download_failed" } });
    // Two assets per attempt, three attempts.
    expect(download.downloadAsset).toHaveBeenCalledTimes(6);
  });

  it("fails with no_output when the model returned no file", async () => {
    router.status.mockResolvedValue(status("COMPLETED"));
    router.result.mockResolvedValue({ data: { candidates: [{ content: { parts: [{ text: "No." }] } }] }, requestId: "r", creditsUsed: null });
    const job = await settled((await startJob({ kind: "image", modelId: MODEL_IDS.nanoBanana, input: imageInput })).id, 5000);
    expect(job).toMatchObject({ status: "failed", error: { code: "no_output" } });
  });

  it("expires a request Router no longer has", async () => {
    router.status.mockRejectedValue(routerError("request_not_found", 410));
    const job = await seed({ status: "running" });
    await resumeJobs();
    expect(await settled(job.id, 5000)).toMatchObject({ status: "expired", error: { code: "expired" } });
  });
});

describe("cancel", () => {
  it("sends the cancel and ends cancelled when Router confirms", async () => {
    const job = await seed({ status: "running" });
    router.status.mockResolvedValue(status("COMPLETED", { errorType: "cancelled" }));
    router.result.mockRejectedValue(routerError("cancelled"));
    await cancelJob(job.id);
    expect(router.cancel).toHaveBeenCalledWith(MODEL_IDS.nanoBanana, "req-1");
    expect(await settled(job.id, 5000)).toMatchObject({ status: "cancelled" });
  });

  it("still saves a run that finished before the cancel landed", async () => {
    const job = await seed({ status: "queued" });
    router.status.mockResolvedValue(status("COMPLETED"));
    router.result.mockResolvedValue({ data: nanoRecorded, requestId: "r", creditsUsed: null });
    await cancelJob(job.id);
    expect(await settled(job.id, 5000)).toMatchObject({ status: "done" });
  });
});

describe("resumeJobs after a reload", () => {
  it("fails a job lost before its submit", async () => {
    const job = await seed({ status: "submitting", requestId: undefined });
    await resumeJobs();
    expect(await db.jobs.get(job.id)).toMatchObject({ status: "failed", error: { code: "lost_before_submit" } });
    expect(router.submit).not.toHaveBeenCalled();
  });

  it("rebuilds the handle of a queued job and finishes it", async () => {
    const job = await seed({ status: "queued" });
    router.status.mockResolvedValue(status("COMPLETED"));
    router.result.mockResolvedValue({ data: nanoRecorded, requestId: "r", creditsUsed: null });
    await resumeJobs();
    expect(await settled(job.id, 5000)).toMatchObject({ status: "done" });
    expect(router.status).toHaveBeenCalledWith(MODEL_IDS.nanoBanana, "req-1");
    expect(router.submit).not.toHaveBeenCalled();
  });

  it("reruns a download from the stored raw result without asking Router again", async () => {
    const job = await seed({ status: "downloading", rawResult: nanoRecorded, completedAt: Date.now() });
    await resumeJobs();
    expect(await settled(job.id, 5000)).toMatchObject({ status: "done" });
    expect(router.status).not.toHaveBeenCalled();
    expect(router.result).not.toHaveBeenCalled();
  });

  it("expires a download whose links are past 24 hours", async () => {
    const job = await seed({ status: "downloading", rawResult: seedanceRecorded, completedAt: Date.now() - 25 * 60 * 60 * 1000 });
    await resumeJobs();
    expect(await settled(job.id, 5000)).toMatchObject({ status: "expired" });
    expect(download.downloadAsset).not.toHaveBeenCalled();
  });

  it("reruns scoring for a job that stopped mid-score", async () => {
    const scored: string[][] = [];
    setScorer(async (_job, ids) => void scored.push(ids));
    const job = await seed({ status: "scoring", generationIds: ["g-1"], rawResult: nanoRecorded });
    await resumeJobs();
    expect(await settled(job.id, 5000)).toMatchObject({ status: "done" });
    expect(scored).toEqual([["g-1"]]);
  });

  it("leaves finished jobs alone", async () => {
    await seed({ status: "done" });
    await resumeJobs();
    expect(router.status).not.toHaveBeenCalled();
  });
});
