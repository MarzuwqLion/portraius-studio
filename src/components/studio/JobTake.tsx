import type { ReactNode } from "react";
import { useJob, useJobImageUrl } from "@/lib/jobs/hooks";
import { errorText } from "@/lib/router/errors";
import type { Job } from "@/lib/types/jobs";
import { Take } from "./Take";

// Job lifecycle wording for a take that hasn't landed (spec: UI, Job lifecycle).
export function jobStatusText(job: Job | undefined): string {
  if (!job) return "Starting";
  switch (job.status) {
    case "submitting":
      return "Sending";
    case "queued":
      return job.queuePosition ? `Queued, ${job.queuePosition} ahead` : "Queued";
    case "running":
      return "Generating";
    case "downloading":
      return "Saving";
    case "scoring":
      return "Scoring";
    case "cancelling":
      return "Cancelling";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "This result expired before it was saved.";
    case "failed":
      return job.error ? errorText(job.error) : "Failed.";
    case "done":
      return "Done";
  }
}

// A take backed by a runner job: status while it works, the image once saved.
export function JobTake({
  jobId,
  alt,
  aspect,
  picked,
  rejected,
  onPick,
  pickLabel,
  seed,
  footer,
}: {
  jobId: string;
  alt: string;
  aspect: string;
  picked?: boolean;
  rejected?: boolean;
  onPick?: () => void;
  pickLabel?: string;
  seed?: number;
  footer?: (job: Job | undefined) => ReactNode;
}) {
  const job = useJob(jobId);
  const url = useJobImageUrl(jobId);
  const done = job?.status === "done" && url;
  return (
    <div className="grid gap-2">
      <Take src={done ? url : undefined} alt={alt} aspect={aspect} picked={picked} rejected={rejected} onPick={done ? onPick : undefined} pickLabel={pickLabel} seed={seed}>
        {jobStatusText(job)}
      </Take>
      {footer?.(job)}
    </div>
  );
}
