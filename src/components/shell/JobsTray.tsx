import { useRecentJobs } from "@/lib/jobs/hooks";
import type { JobStatus } from "@/lib/types/jobs";

const STATUS_LABEL: Record<JobStatus, string> = {
  submitting: "Sending",
  queued: "Queued",
  running: "Generating",
  downloading: "Downloading",
  scoring: "Scoring",
  done: "Done",
  failed: "Failed",
  cancelling: "Cancelling",
  cancelled: "Cancelled",
  expired: "Expired",
};

// The film strip: one frame per queued or finished job. M3 adds thumbnails,
// links to results and reload recovery controls.
export function JobsTray() {
  const jobs = useRecentJobs();
  return (
    <section aria-label="Jobs" className="flex h-16 shrink-0 items-center gap-2 overflow-x-auto border-t border-rule px-4">
      {jobs.length === 0 ? (
        <p className="text-control text-ink-muted">No jobs yet. Everything you generate lines up here.</p>
      ) : (
        jobs.map((job) => (
          <div key={job.id} className="flex h-11 shrink-0 flex-col justify-center rounded-media border border-rule px-3 text-control">
            <span className="font-semibold">{STATUS_LABEL[job.status]}</span>
            <span className="text-ink-muted">
              {job.kind}
              {job.status === "queued" && job.queuePosition !== undefined ? ` · ${job.queuePosition} ahead` : ""}
            </span>
          </div>
        ))
      )}
    </section>
  );
}
