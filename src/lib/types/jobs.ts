// Contracts: Job state machine.
import type { AppError } from "./errors";

export type JobStatus =
  | "submitting" | "queued" | "running" | "downloading" | "scoring"
  | "done" | "failed" | "cancelling" | "cancelled" | "expired";

export type JobKind = "sheet" | "image" | "video" | "recast" | "enhance" | "tts" | "lipsync" | "shot";

export interface JobEstimate {
  source: "exact" | "estimated" | "unknown";
  amountCents?: number;
  minCents?: number;
  maxCents?: number;
}

export interface Job {
  id: string;                    // uuid
  kind: JobKind;
  modelId: string;
  requestId?: string;            // set from the 201
  idempotencyKey: string;        // minted before submit, reused only for a retry of the same submit
  input: unknown;                // app-level input, for retries and recipes
  estimate?: JobEstimate;
  status: JobStatus;
  queuePosition?: number;
  rawResult?: unknown;           // native result, kept until every asset is saved
  error?: AppError;
  parentJobId?: string;          // draft to final, and automatic retries
  draftTaskId?: string;          // Seedance draft id, valid 7 days
  uploads?: string[];            // hosted media to delete when the job ends
  generationIds: string[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export const FINAL_STATUSES: readonly JobStatus[] = ["done", "failed", "cancelled", "expired"];

export function isFinal(status: JobStatus): boolean {
  return FINAL_STATUSES.includes(status);
}
