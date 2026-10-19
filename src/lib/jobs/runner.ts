// Drives jobs through the state machine: submit, poll, collect, download and
// score (spec: Rules for every call; Contracts: Job state machine). Framework-
// free; the UI starts jobs here and reads them through lib/jobs/hooks.ts.
// Every status change goes through machine.applyEvent().
import { adapterFor } from "@/lib/registry/adapters";
import type { AssetRef } from "@/lib/registry/capabilities";
import * as router from "@/lib/router/client";
import { downloadAsset } from "@/lib/router/download";
import { appError, toAppError } from "@/lib/router/errors";
import { db } from "@/lib/store/db";
import type { AppError } from "@/lib/types/errors";
import { isFinal, type Job } from "@/lib/types/jobs";
import type { Generation, GenerationAsset } from "@/lib/types/records";
import { applyEvent, createJob, recoveryFor, type JobEvent, type NewJob } from "./machine";

// What a job stores as its input: the adapter's app-level input plus what the
// library needs. Kept whole so a retry or a recipe can rebuild the request.
export interface JobInput<I = unknown> {
  model: I;
  characterIds: string[];  // cast members in it; their faces are scored after download
  prompt?: string;         // shown in the library and used for alt text
  recipeId?: string;
  stylised?: boolean;      // a stylised look: identity scoring is skipped
  request?: unknown;       // the studio's own request, so retries and recipes can rebuild it
  // Work to start when this job is done, such as Still first's video draft.
  next?: unknown;
}

export type StartJob<I> = Pick<NewJob, "kind" | "modelId" | "estimate" | "parentJobId" | "uploads"> & { input: JobInput<I> };

// Scores a finished job's generations (lib/identity, M5). Until then nothing
// is scored and jobs with a cast pass straight through scoring.
export type Scorer = (job: Job, generationIds: string[]) => Promise<void>;
let scorer: Scorer = async () => undefined;
export function setScorer(next: Scorer): void {
  scorer = next;
}

// Exposed so tests can run without real waits.
export const timing = {
  pollMs: 2000,
  maxPollMs: 10_000,
  backoffMs: (attempt: number) => 1000 * 2 ** attempt,
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

const RESULT_TTL_MS = 24 * 60 * 60 * 1000;
const STEP_ATTEMPTS = 3;
const WAIT_ATTEMPTS = 3;

const driving = new Set<string>();

// One driver per job across tabs: a Web Lock when the browser has them.
async function drive(id: string, work: () => Promise<void>): Promise<void> {
  if (driving.has(id)) return;
  driving.add(id);
  try {
    const locks = globalThis.navigator?.locks;
    if (locks) {
      await locks.request(`portraius-job-${id}`, { ifAvailable: true }, async (lock) => {
        if (lock) await work();
      });
    } else {
      await work();
    }
  } catch (err) {
    // A driver never throws into the UI; the job record carries any failure.
    console.error("job driver stopped", { id, error: (err as Error).message });
  } finally {
    driving.delete(id);
  }
}

// Follow-up work registered by the studios: automatic drift retries, Still
// first's video draft, a final's missing last frame.
type DoneListener = (job: Job) => void | Promise<void>;
const doneListeners = new Set<DoneListener>();
export function onJobDone(listener: DoneListener): () => void {
  doneListeners.add(listener);
  return () => doneListeners.delete(listener);
}

async function apply(id: string, event: JobEvent): Promise<Job> {
  const job = await applyEvent(id, event);
  if (isFinal(job.status)) await releaseUploads(job);
  if (job.status === "done" && (event.type === "assets_saved" || event.type === "scores_saved")) {
    for (const listener of doneListeners) {
      void Promise.resolve(listener(job)).catch((err) => console.error("after-job work failed", { id, error: (err as Error).message }));
    }
  }
  return job;
}

// "When a job reaches done, failed, cancelled or expired, delete its uploads."
async function releaseUploads(job: Job): Promise<void> {
  for (const id of job.uploads ?? []) {
    await router.deleteAsset(id).catch(() => undefined);
  }
}

function inputOf(job: Job): JobInput {
  return job.input as JobInput;
}

function isExpiry(error: AppError): boolean {
  return error.code === "expired" || error.code === "request_not_found";
}

// ---- Starting ----

export async function startJob<I>(spec: StartJob<I>): Promise<Job> {
  const adapter = adapterFor(spec.modelId);
  if (adapter.delivery !== "queue") throw new Error(`${spec.modelId} runs synchronously; sync jobs arrive in M7.`);
  // Build the body first, so an input the adapter refuses never becomes a job.
  const body = adapter.buildBody(spec.input.model);
  const job = await createJob({ ...spec, idempotencyKey: crypto.randomUUID() });
  void drive(job.id, () => submitThenPoll(job, body));
  return job;
}

async function submitThenPoll(job: Job, body: unknown): Promise<void> {
  let networkRetries = 0;
  let waits = 0;
  for (;;) {
    try {
      // The same idempotency key on every attempt: Router answers a repeat
      // with the request it already accepted.
      const { requestId } = await router.submit(job.modelId, body, { idempotencyKey: job.idempotencyKey });
      await apply(job.id, { type: "accepted", requestId });
      break;
    } catch (err) {
      const error = toAppError(err);
      if (error.code === "network_error" && networkRetries < 2) {
        await timing.sleep(timing.backoffMs(networkRetries++));
        continue;
      }
      if (error.retry === "auto" && waits < WAIT_ATTEMPTS) {
        await timing.sleep((error.retryAfter ?? 0) * 1000 || timing.backoffMs(waits));
        waits++;
        continue;
      }
      await apply(job.id, { type: "submit_failed", error });
      return;
    }
  }
  await pollUntilDone(job.id);
}

// ---- Queue ----

async function pollUntilDone(id: string): Promise<void> {
  let transientFailures = 0;
  for (;;) {
    const job = await db.jobs.get(id);
    if (!job || isFinal(job.status) || !job.requestId) return;
    if (job.status === "downloading") return downloadStep(id);

    let status: router.StatusResult;
    try {
      status = await router.status(job.modelId, job.requestId);
      transientFailures = 0;
    } catch (err) {
      const error = toAppError(err);
      if (isExpiry(error)) {
        await apply(id, job.status === "cancelling" ? { type: "completed_with_error", error: appError("cancelled", "Cancelled.") } : { type: "expired" });
        return;
      }
      if (error.code === "network_error" || error.retry === "auto") {
        await timing.sleep(Math.min((error.retryAfter ?? 0) * 1000 || timing.backoffMs(transientFailures++), timing.maxPollMs));
        continue;
      }
      // Anything else (a missing or refused key) stops this driver; the job
      // waits where it is and resumes with resumeJobs().
      console.warn("stopped polling", { id, code: error.code });
      return;
    }

    if (!status.completed) {
      await apply(id, { type: "queue_status", status: status.status, queuePosition: status.queuePosition });
      await timing.sleep(Math.min(Math.max(status.retryAfterMs ?? timing.pollMs, timing.pollMs), timing.maxPollMs));
      continue;
    }

    try {
      // A completion with an error_type rejects here with the typed error,
      // which carries the detail the status read doesn't.
      const res = await router.result(job.modelId, job.requestId);
      const draftTaskId = adapterFor(job.modelId).draftTaskId?.(res.data);
      await apply(id, { type: "completed", rawResult: res.data, ...(draftTaskId ? { draftTaskId } : {}) });
      return downloadStep(id);
    } catch (err) {
      const error = toAppError(err);
      if (isExpiry(error)) {
        await apply(id, job.status === "cancelling" ? { type: "completed_with_error", error: appError("cancelled", "Cancelled.") } : { type: "expired" });
      } else if (error.code === "network_error") {
        await timing.sleep(timing.backoffMs(transientFailures++));
        continue;
      } else {
        await apply(id, { type: "completed_with_error", error });
      }
      return;
    }
  }
}

// ---- Download and scoring ----

const GENERATION_TYPE: Record<Job["kind"], Generation["type"] | null> = {
  sheet: "image",
  image: "image",
  enhance: "image",
  video: "video",
  lipsync: "video",
  shot: "video",
  recast: "recast",
  tts: null,
};

async function withRetries(work: () => Promise<void>): Promise<AppError | null> {
  let last: AppError | null = null;
  for (let attempt = 0; attempt < STEP_ATTEMPTS; attempt++) {
    try {
      await work();
      return null;
    } catch (err) {
      last = toAppError(err);
      // A missing Worker or an empty result won't change on retry.
      if (last.retry === "never" || last.code === "no_output") return last;
      if (attempt < STEP_ATTEMPTS - 1) await timing.sleep(timing.backoffMs(attempt));
    }
  }
  return last;
}

async function downloadStep(id: string): Promise<void> {
  const job = await db.jobs.get(id);
  if (!job || job.status !== "downloading") return;
  if (job.completedAt !== undefined && Date.now() - job.completedAt > RESULT_TTL_MS) {
    await apply(id, { type: "expired" });
    return;
  }

  const input = inputOf(job);
  const generationId = `${job.id}-g0`;
  const error = await withRetries(async () => {
    const refs: AssetRef[] = adapterFor(job.modelId).extractAssets(job.rawResult);
    if (!refs.length) throw appError("no_output", "The model finished without returning a file. Retry it?", { retry: "manual" });
    const type = GENERATION_TYPE[job.kind];
    if (!type) throw appError("unsupported", `${job.kind} results are saved from M7.`, { retry: "never" });

    const blobs = await Promise.all(refs.map((ref) => downloadAsset(ref)));
    const assets: GenerationAsset[] = blobs.map((blob, i) => ({ blobId: `${job.id}-a${i}`, kind: refs[i]!.kind, mime: blob.type, bytes: blob.size }));
    const generation: Generation = {
      id: generationId,
      type,
      modelId: job.modelId,
      jobId: job.id,
      characterIds: input.characterIds ?? [],
      assets,
      createdAt: Date.now(),
      ...(input.recipeId ? { recipeId: input.recipeId } : {}),
      ...(input.prompt ? { prompt: input.prompt } : {}),
    };
    // IDs come from the job, so a rerun after a reload overwrites, never duplicates.
    await db.transaction("rw", db.blobs, db.generations, async () => {
      await db.blobs.bulkPut(blobs.map((blob, i) => ({ id: assets[i]!.blobId, blob, mime: blob.type, bytes: blob.size })));
      await db.generations.put(generation);
    });
  });

  if (error) {
    // Keep errors that say something about the result; anything else becomes
    // the machine's plain download_failed.
    const specific = ["download_failed", "no_output", "unsupported"].includes(error.code);
    await apply(id, { type: "step_failed", step: "download", ...(specific ? { error } : {}) });
    return;
  }
  const next = await apply(id, { type: "assets_saved", generationIds: [generationId], needsScoring: (input.characterIds ?? []).length > 0 });
  if (next.status === "scoring") await scoringStep(id);
}

async function scoringStep(id: string): Promise<void> {
  const job = await db.jobs.get(id);
  if (!job || job.status !== "scoring") return;
  const error = await withRetries(() => scorer(job, job.generationIds));
  await apply(id, error ? { type: "step_failed", step: "scoring" } : { type: "scores_saved" });
}

// ---- Retry, cancel and reload ----

// A new job with the same request, linked to the one it retries.
export async function retryJob(id: string, changes: { input?: JobInput } = {}): Promise<Job> {
  const job = await db.jobs.get(id);
  if (!job) throw new Error("That job is gone.");
  return startJob({ kind: job.kind, modelId: job.modelId, input: changes.input ?? (job.input as JobInput), parentJobId: job.id });
}


export async function cancelJob(id: string): Promise<void> {
  const job = await apply(id, { type: "cancel_requested" });
  if (!job.requestId) return;
  await router.cancel(job.modelId, job.requestId).catch((err) => console.warn("cancel request failed", { id, code: toAppError(err).code }));
  // The poll loop sees COMPLETED with error_type cancelled, or a finished run.
  void drive(id, () => pollUntilDone(id));
}

// Picks up every unfinished job after a page reload (Contracts: the last row
// of the state machine table). Safe to call again; jobs already being driven
// in this tab or another are skipped.
export async function resumeJobs(): Promise<void> {
  const pending = await db.jobs.filter((job) => !isFinal(job.status)).toArray();
  await Promise.all(
    pending.map(async (job) => {
      if (driving.has(job.id)) return;
      switch (recoveryFor(job)) {
        case "fail_lost":
          await apply(job.id, { type: "lost_before_submit" });
          return;
        case "poll":
          return drive(job.id, () => pollUntilDone(job.id));
        case "download":
          return drive(job.id, () => downloadStep(job.id));
        case "score":
          return drive(job.id, () => scoringStep(job.id));
        case "none":
          return;
      }
    }),
  );
}

// Resolves once a job reaches a final state (for scripts and tests).
export async function settled(id: string, timeoutMs = 15 * 60_000): Promise<Job> {
  const started = Date.now();
  for (;;) {
    const job = await db.jobs.get(id);
    if (job && isFinal(job.status)) return job;
    if (Date.now() - started > timeoutMs) throw new Error(`Job ${id} still ${job?.status} after ${timeoutMs / 1000}s`);
    await timing.sleep(Math.min(timing.pollMs, 250));
  }
}
