// Contracts: Job state machine. The only module that changes a job's status.
// transition() is pure and covers every row of the Contracts table;
// applyEvent() runs it inside a Dexie transaction so two polling loops (or two
// tabs) can't interleave writes to the same job.
import { appError } from "@/lib/router/errors";
import { db } from "@/lib/store/db";
import type { AppError } from "@/lib/types/errors";
import { isFinal, type Job, type JobStatus } from "@/lib/types/jobs";

export type JobEvent =
  | { type: "accepted"; requestId: string }                                   // the 201
  | { type: "submit_failed"; error: AppError }                                // error before a 201
  | { type: "queue_status"; status: string; queuePosition: number | null }    // IN_QUEUE or IN_PROGRESS
  | { type: "completed"; rawResult: unknown; draftTaskId?: string }           // COMPLETED, no error_type
  | { type: "completed_with_error"; error: AppError }                         // COMPLETED with an error_type
  | { type: "cancel_requested" }
  | { type: "assets_saved"; generationIds: string[]; needsScoring: boolean }
  | { type: "scores_saved" }
  | { type: "step_failed"; step: "download" | "scoring"; error?: AppError }  // after the runner's 3 retries
  | { type: "expired" }                                                       // 410, or 24 h past completion
  | { type: "lost_before_submit" };                                           // reload found submitting, no requestId

export class InvalidTransition extends Error {
  constructor(from: JobStatus, event: JobEvent["type"]) {
    super(`A ${from} job can't take ${event}`);
    this.name = "InvalidTransition";
  }
}

// What the runner does with a job it finds after a page reload.
export type Recovery = "fail_lost" | "poll" | "download" | "score" | "none";

export function recoveryFor(job: Job): Recovery {
  if (isFinal(job.status)) return "none";
  switch (job.status) {
    case "submitting":
      return job.requestId ? "poll" : "fail_lost";
    case "downloading":
      return "download";
    case "scoring":
      return "score";
    default:
      // queued, running and cancelling rebuild the handle and keep polling.
      return "poll";
  }
}

const IN_QUEUE: readonly JobStatus[] = ["queued", "running"];
const AWAITING_RESULT: readonly JobStatus[] = ["queued", "running", "cancelling"];

const STEP_ERRORS = {
  download: () => appError("download_failed", "The result couldn't be saved from its link. Retry it?", { retry: "manual" }),
  scoring: () => appError("scoring_failed", "The result was saved, but its identity score couldn't be worked out. Retry it?", { retry: "manual" }),
};

function expectFrom(job: Job, event: JobEvent, from: readonly JobStatus[]): void {
  if (!from.includes(job.status)) throw new InvalidTransition(job.status, event.type);
}

function finish(job: Job, status: JobStatus, now: number, fields: Partial<Job> = {}): Job {
  return { ...job, ...fields, status, updatedAt: now, completedAt: job.completedAt ?? now };
}

// Returns the job after the event. A final job ignores every event (late polls
// and duplicate callbacks land here), and returns the same object.
export function transition(job: Job, event: JobEvent, now = Date.now()): Job {
  if (isFinal(job.status)) return job;
  const step = (status: JobStatus, fields: Partial<Job> = {}): Job => ({ ...job, ...fields, status, updatedAt: now });

  switch (event.type) {
    case "accepted":
      expectFrom(job, event, ["submitting"]);
      return step("queued", { requestId: event.requestId });

    case "submit_failed":
      expectFrom(job, event, ["submitting"]);
      return finish(job, "failed", now, { error: event.error });

    case "lost_before_submit":
      expectFrom(job, event, ["submitting"]);
      return finish(job, "failed", now, {
        error: appError("lost_before_submit", "This job was interrupted before Comfy received it. Retry it?", { retry: "manual" }),
      });

    case "queue_status": {
      expectFrom(job, event, AWAITING_RESULT);
      if (job.status === "cancelling") return job;
      if (event.status === "IN_PROGRESS") {
        return job.status === "running" ? job : step("running", { queuePosition: undefined });
      }
      if (event.status === "IN_QUEUE" && job.status === "queued") {
        const queuePosition = event.queuePosition ?? undefined;
        return queuePosition === job.queuePosition ? job : step("queued", { queuePosition });
      }
      return job;
    }

    case "completed":
      // A cancelled run that finished anyway is still downloaded.
      expectFrom(job, event, AWAITING_RESULT);
      return step("downloading", {
        rawResult: event.rawResult,
        queuePosition: undefined,
        completedAt: now,
        ...(event.draftTaskId ? { draftTaskId: event.draftTaskId } : {}),
      });

    case "completed_with_error":
      expectFrom(job, event, AWAITING_RESULT);
      return finish(job, event.error.code === "cancelled" ? "cancelled" : "failed", now, { error: event.error, queuePosition: undefined });

    case "cancel_requested":
      expectFrom(job, event, IN_QUEUE);
      return step("cancelling");

    case "assets_saved":
      expectFrom(job, event, ["downloading"]);
      if (event.needsScoring) return step("scoring", { generationIds: event.generationIds });
      // Every asset is saved, so the native result is no longer needed.
      return finish(job, "done", now, { generationIds: event.generationIds, rawResult: undefined });

    case "scores_saved":
      expectFrom(job, event, ["scoring"]);
      return finish(job, "done", now, { rawResult: undefined });

    case "step_failed":
      expectFrom(job, event, event.step === "download" ? ["downloading"] : ["scoring"]);
      return finish(job, "failed", now, { error: event.error ?? STEP_ERRORS[event.step]() });

    case "expired":
      expectFrom(job, event, ["queued", "running", "downloading"]);
      return finish(job, "expired", now, {
        error: appError("expired", "This result expired before it was saved.", { retry: "never" }),
      });
  }
}

// ---- Persistence ----

export type NewJob = Pick<Job, "kind" | "modelId" | "idempotencyKey" | "input"> &
  Partial<Pick<Job, "id" | "estimate" | "parentJobId" | "uploads">>;

// The "(new) -> submitting" row: a job is stored before its submit is sent, so
// a reload can tell a lost submit from a queued one.
export async function createJob(fields: NewJob, now = Date.now()): Promise<Job> {
  const job: Job = {
    ...fields,
    id: fields.id ?? crypto.randomUUID(),
    status: "submitting",
    generationIds: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.jobs.add(job);
  return job;
}

export async function applyEvent(id: string, event: JobEvent): Promise<Job> {
  return db.transaction("rw", db.jobs, async () => {
    const job = await db.jobs.get(id);
    if (!job) throw new Error(`No job ${id}`);
    const next = transition(job, event);
    if (next !== job) await db.jobs.put(next);
    return next;
  });
}
