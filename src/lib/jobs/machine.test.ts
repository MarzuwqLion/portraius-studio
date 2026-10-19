import { beforeEach, describe, expect, it } from "vitest";
import { appError } from "@/lib/router/errors";
import { db } from "@/lib/store/db";
import type { Job, JobStatus } from "@/lib/types/jobs";
import { InvalidTransition, applyEvent, createJob, recoveryFor, transition, type JobEvent } from "./machine";

const T0 = 1_000_000;
const NOW = T0 + 5_000;

function job(status: JobStatus, fields: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    kind: "image",
    modelId: "vertexai/gemini-nano-banana-2.1",
    idempotencyKey: "key-1",
    input: { prompt: "a teapot" },
    status,
    generationIds: [],
    createdAt: T0,
    updatedAt: T0,
    ...(status === "submitting" ? {} : { requestId: "req-1" }),
    ...fields,
  };
}

const ALL: JobStatus[] = ["submitting", "queued", "running", "downloading", "scoring", "done", "failed", "cancelling", "cancelled", "expired"];
const FINAL: JobStatus[] = ["done", "failed", "cancelled", "expired"];
const rejects = (from: JobStatus, event: JobEvent) => expect(() => transition(job(from), event, NOW)).toThrow(InvalidTransition);
const others = (allowed: JobStatus[]) => ALL.filter((s) => !allowed.includes(s) && !FINAL.includes(s));

describe("submit", () => {
  it("a 201 with a request_id moves submitting to queued", () => {
    const next = transition(job("submitting"), { type: "accepted", requestId: "req-9" }, NOW);
    expect(next).toMatchObject({ status: "queued", requestId: "req-9", updatedAt: NOW });
  });

  it("an error before a 201 fails the job with that error", () => {
    const error = appError("insufficient_credits", "Your Comfy workspace is out of credits.", { action: "add_credits" });
    const next = transition(job("submitting"), { type: "submit_failed", error }, NOW);
    expect(next).toMatchObject({ status: "failed", error, completedAt: NOW });
  });

  it("only a submitting job takes a 201 or a submit error", () => {
    for (const from of others(["submitting"])) {
      rejects(from, { type: "accepted", requestId: "x" });
      rejects(from, { type: "submit_failed", error: appError("x", "x") });
    }
  });
});

describe("queue", () => {
  it("IN_PROGRESS moves queued to running and clears the queue position", () => {
    const next = transition(job("queued", { queuePosition: 2 }), { type: "queue_status", status: "IN_PROGRESS", queuePosition: null }, NOW);
    expect(next.status).toBe("running");
    expect(next.queuePosition).toBeUndefined();
  });

  it("IN_QUEUE keeps a queued job queued and records its position", () => {
    const next = transition(job("queued"), { type: "queue_status", status: "IN_QUEUE", queuePosition: 3 }, NOW);
    expect(next).toMatchObject({ status: "queued", queuePosition: 3 });
  });

  it("returns the same job when a poll changes nothing", () => {
    const running = job("running");
    expect(transition(running, { type: "queue_status", status: "IN_PROGRESS", queuePosition: null }, NOW)).toBe(running);
    const queued = job("queued", { queuePosition: 1 });
    expect(transition(queued, { type: "queue_status", status: "IN_QUEUE", queuePosition: 1 }, NOW)).toBe(queued);
    const cancelling = job("cancelling");
    expect(transition(cancelling, { type: "queue_status", status: "IN_PROGRESS", queuePosition: null }, NOW)).toBe(cancelling);
  });

  it("COMPLETED with no error_type saves the raw result and moves to downloading", () => {
    for (const from of ["queued", "running"] as const) {
      const raw = { candidates: [] };
      const next = transition(job(from, { queuePosition: 1 }), { type: "completed", rawResult: raw }, NOW);
      expect(next).toMatchObject({ status: "downloading", rawResult: raw, completedAt: NOW });
      expect(next.queuePosition).toBeUndefined();
    }
  });

  it("keeps a Seedance draft task ID from the result", () => {
    const next = transition(job("running", { kind: "video" }), { type: "completed", rawResult: {}, draftTaskId: "cgt-1" }, NOW);
    expect(next.draftTaskId).toBe("cgt-1");
  });

  it("COMPLETED with an error_type fails the job, or cancels it when the type is cancelled", () => {
    for (const from of ["queued", "running"] as const) {
      const policy = appError("content_policy_violation", "The provider declined this prompt.");
      expect(transition(job(from), { type: "completed_with_error", error: policy }, NOW)).toMatchObject({ status: "failed", error: policy, completedAt: NOW });
      const cancelled = appError("cancelled", "Cancelled.");
      expect(transition(job(from), { type: "completed_with_error", error: cancelled }, NOW).status).toBe("cancelled");
    }
  });

  it("only jobs waiting on Router take queue updates and completions", () => {
    for (const from of others(["queued", "running", "cancelling"])) {
      rejects(from, { type: "queue_status", status: "IN_PROGRESS", queuePosition: null });
      rejects(from, { type: "completed", rawResult: {} });
      rejects(from, { type: "completed_with_error", error: appError("provider_error", "x") });
    }
  });
});

describe("cancel", () => {
  it("a user cancel moves queued or running to cancelling", () => {
    expect(transition(job("queued"), { type: "cancel_requested" }, NOW).status).toBe("cancelling");
    expect(transition(job("running"), { type: "cancel_requested" }, NOW).status).toBe("cancelling");
  });

  it("then cancelled once Router confirms", () => {
    const next = transition(job("cancelling"), { type: "completed_with_error", error: appError("cancelled", "Cancelled.") }, NOW);
    expect(next).toMatchObject({ status: "cancelled", completedAt: NOW });
  });

  it("or downloading if the run finished anyway", () => {
    expect(transition(job("cancelling"), { type: "completed", rawResult: { ok: true } }, NOW).status).toBe("downloading");
  });

  it("can't cancel a job that isn't in the queue", () => {
    for (const from of others(["queued", "running"])) rejects(from, { type: "cancel_requested" });
  });
});

describe("download and scoring", () => {
  it("every asset saved moves to done when no cast member is in it, dropping the raw result", () => {
    const next = transition(job("downloading", { rawResult: { big: true }, completedAt: T0 + 1 }), { type: "assets_saved", generationIds: ["g1"], needsScoring: false }, NOW);
    expect(next).toMatchObject({ status: "done", generationIds: ["g1"], completedAt: T0 + 1 });
    expect(next.rawResult).toBeUndefined();
  });

  it("or to scoring when a cast member is in it, keeping the raw result", () => {
    const next = transition(job("downloading", { rawResult: { big: true } }), { type: "assets_saved", generationIds: ["g1", "g2"], needsScoring: true }, NOW);
    expect(next).toMatchObject({ status: "scoring", generationIds: ["g1", "g2"], rawResult: { big: true } });
  });

  it("scores saved moves scoring to done", () => {
    const next = transition(job("scoring", { rawResult: {} }), { type: "scores_saved" }, NOW);
    expect(next.status).toBe("done");
    expect(next.rawResult).toBeUndefined();
  });

  it("a download step that failed its retries fails the job with download_failed", () => {
    const next = transition(job("downloading"), { type: "step_failed", step: "download" }, NOW);
    expect(next).toMatchObject({ status: "failed", error: { code: "download_failed", retry: "manual" } });
  });

  it("a scoring step that failed its retries fails the job with scoring_failed", () => {
    const next = transition(job("scoring"), { type: "step_failed", step: "scoring" }, NOW);
    expect(next).toMatchObject({ status: "failed", error: { code: "scoring_failed" } });
  });

  it("keeps a specific step error when one is given", () => {
    const error = appError("download_failed", "This result's host needs the Worker.");
    expect(transition(job("downloading"), { type: "step_failed", step: "download", error }, NOW).error).toBe(error);
  });

  it("rejects download and scoring events out of order", () => {
    for (const from of others(["downloading"])) {
      rejects(from, { type: "assets_saved", generationIds: [], needsScoring: false });
      rejects(from, { type: "step_failed", step: "download" });
    }
    for (const from of others(["scoring"])) {
      rejects(from, { type: "scores_saved" });
      rejects(from, { type: "step_failed", step: "scoring" });
    }
  });
});

describe("expiry", () => {
  it("a 410, or 24 h past completion, expires queued, running and downloading jobs", () => {
    for (const from of ["queued", "running", "downloading"] as const) {
      expect(transition(job(from), { type: "expired" }, NOW)).toMatchObject({ status: "expired", error: { code: "expired" } });
    }
  });

  it("doesn't expire other states", () => {
    for (const from of others(["queued", "running", "downloading"])) rejects(from, { type: "expired" });
  });
});

describe("final states", () => {
  it("ignore every event and return the same job", () => {
    const events: JobEvent[] = [
      { type: "accepted", requestId: "x" },
      { type: "queue_status", status: "IN_PROGRESS", queuePosition: null },
      { type: "completed", rawResult: {} },
      { type: "cancel_requested" },
      { type: "expired" },
    ];
    for (const status of FINAL) {
      const final = job(status, { completedAt: T0 });
      for (const event of events) expect(transition(final, event, NOW)).toBe(final);
    }
  });
});

describe("reload recovery", () => {
  it("submitting with no requestId becomes failed (lost_before_submit)", () => {
    const lost = job("submitting");
    expect(recoveryFor(lost)).toBe("fail_lost");
    expect(transition(lost, { type: "lost_before_submit" }, NOW)).toMatchObject({ status: "failed", error: { code: "lost_before_submit", retry: "manual" } });
  });

  it("queued, running and cancelling rebuild the handle and poll", () => {
    expect(recoveryFor(job("queued"))).toBe("poll");
    expect(recoveryFor(job("running"))).toBe("poll");
    expect(recoveryFor(job("cancelling"))).toBe("poll");
  });

  it("downloading and scoring rerun from rawResult", () => {
    expect(recoveryFor(job("downloading", { rawResult: {} }))).toBe("download");
    expect(recoveryFor(job("scoring", { rawResult: {} }))).toBe("score");
  });

  it("final jobs need nothing", () => {
    for (const status of FINAL) expect(recoveryFor(job(status))).toBe("none");
  });
});

describe("persistence", () => {
  beforeEach(async () => {
    await db.jobs.clear();
  });

  it("createJob stores a submitting job before anything is sent", async () => {
    const created = await createJob({ kind: "image", modelId: "vertexai/gemini-nano-banana-2.1", idempotencyKey: "k", input: {} }, T0);
    expect(created).toMatchObject({ status: "submitting", generationIds: [], createdAt: T0 });
    expect(await db.jobs.get(created.id)).toEqual(created);
  });

  it("applyEvent writes each transition and leaves no-ops alone", async () => {
    const { id } = await createJob({ kind: "image", modelId: "vertexai/gemini-nano-banana-2.1", idempotencyKey: "k", input: {} });
    await applyEvent(id, { type: "accepted", requestId: "req-1" });
    await applyEvent(id, { type: "queue_status", status: "IN_PROGRESS", queuePosition: null });
    const running = await db.jobs.get(id);
    expect(running).toMatchObject({ status: "running", requestId: "req-1" });
    await applyEvent(id, { type: "queue_status", status: "IN_PROGRESS", queuePosition: null });
    expect((await db.jobs.get(id))?.updatedAt).toBe(running?.updatedAt);
  });

  it("applyEvent rejects an invalid transition without writing", async () => {
    const { id } = await createJob({ kind: "image", modelId: "vertexai/gemini-nano-banana-2.1", idempotencyKey: "k", input: {} });
    await expect(applyEvent(id, { type: "scores_saved" })).rejects.toThrow(InvalidTransition);
    expect((await db.jobs.get(id))?.status).toBe("submitting");
  });
});
