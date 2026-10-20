import { useState } from "react";
import { Link } from "react-router";
import { jobStatusText } from "@/components/studio/JobTake";
import { useRecentJobs } from "@/lib/jobs/hooks";
import { cancelJob, retryJob } from "@/lib/jobs/runner";
import { useBlobUrl, useGeneration } from "@/lib/store/hooks";
import type { Job } from "@/lib/types/jobs";
import { cn } from "@/lib/utils";

const STUDIO: Partial<Record<Job["kind"], string>> = {
  image: "/image",
  video: "/video",
  recast: "/recast",
  shot: "/director",
  enhance: "/image",
  sheet: "/characters",
};

const KIND_LABEL: Partial<Record<Job["kind"], string>> = {
  sheet: "character",
  enhance: "make it real",
  lipsync: "speaking",
  shot: "one take",
};

const WORKING: Job["status"][] = ["submitting", "queued", "running", "downloading", "scoring", "cancelling"];

function Frame({ job }: { job: Job }) {
  const generation = useGeneration(job.status === "done" ? job.generationIds[0] : undefined);
  const still = generation?.assets.find((a) => a.kind === "image") ?? generation?.assets.find((a) => a.kind === "frame");
  const url = useBlobUrl(still?.blobId);
  // A video with no saved frame (Recast, H3) shows its own first frame.
  const videoUrl = useBlobUrl(still ? undefined : generation?.assets.find((a) => a.kind === "video")?.blobId);
  const [busy, setBusy] = useState(false);
  const working = WORKING.includes(job.status);
  const canCancel = job.status === "queued" || job.status === "running";
  const canRetry = (job.status === "failed" || job.status === "expired") && job.error?.retry !== "never";

  return (
    <li className="flex h-14 shrink-0 items-center gap-2 rounded-media border border-rule pr-2">
      <Link to={job.kind === "enhance" && job.status === "done" ? `/library/${job.generationIds[0]}` : (STUDIO[job.kind] ?? "/library")} className="flex h-full items-center gap-2" title={job.status === "failed" ? jobStatusText(job) : undefined}>
        <span className="relative h-full w-12 overflow-hidden rounded-l-media bg-seamless">
          {url && <img src={url} alt="" className="develop absolute inset-0 size-full object-cover" />}
          {videoUrl && <video src={`${videoUrl}#t=0.1`} muted playsInline preload="metadata" aria-hidden className="develop absolute inset-0 size-full object-cover" />}
        </span>
        <span className="flex flex-col text-control">
          <span className={cn("font-semibold", job.status === "failed" && "text-drift")}>{job.status === "failed" ? "Failed" : jobStatusText(job)}</span>
          <span className="text-ink-muted">{KIND_LABEL[job.kind] ?? job.kind}</span>
        </span>
      </Link>
      {canCancel && (
        <button type="button" disabled={busy} className="text-control font-semibold underline underline-offset-4" onClick={() => (setBusy(true), void cancelJob(job.id).finally(() => setBusy(false)))}>
          Cancel
        </button>
      )}
      {canRetry && (
        <button type="button" disabled={busy} className="text-control font-semibold underline underline-offset-4" onClick={() => (setBusy(true), void retryJob(job.id).finally(() => setBusy(false)))}>
          Retry
        </button>
      )}
      {working && <span className="sr-only">Working</span>}
    </li>
  );
}

// The film strip: one frame per queued or finished job, newest first. It
// survives navigation and reloads (jobs live in IndexedDB and resume on load).
export function JobsTray() {
  const jobs = useRecentJobs(30);
  return (
    <section aria-label="Jobs" className="flex h-[4.5rem] shrink-0 items-center overflow-x-auto border-t border-rule px-4">
      {jobs.length === 0 ? (
        <p className="text-control text-ink-muted">No jobs yet. Everything you generate lines up here.</p>
      ) : (
        <ol className="flex gap-2">
          {jobs.map((job) => (
            <Frame key={job.id} job={job} />
          ))}
        </ol>
      )}
    </section>
  );
}
