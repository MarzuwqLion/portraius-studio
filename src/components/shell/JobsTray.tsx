import { useState } from "react";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { jobStatusText } from "@/components/studio/JobTake";
import { useRecentJobs } from "@/lib/jobs/hooks";
import { cancelJob, retryJob } from "@/lib/jobs/runner";
import { isLocalModel } from "@/lib/registry/models";
import { useEngineStore } from "@/lib/session/engine";
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
  // A local job keeps polling while the visitor's ComfyUI is down, so say so
  // instead of "Generating" (4090 app checks, October 23).
  const unreachable = useEngineStore((s) => s.check === "unreachable");
  const waiting = unreachable && working && job.status !== "downloading" && job.status !== "scoring" && isLocalModel(job.modelId);
  const status = job.status === "failed" ? "Failed" : waiting ? "Waiting for your ComfyUI" : jobStatusText(job);
  const title = job.status === "failed" ? jobStatusText(job) : waiting ? "Your ComfyUI isn't answering. This picks up when it's back; Settings can check it." : undefined;

  return (
    <li className="flex h-14 shrink-0 items-center gap-2 rounded-media border border-rule pr-2">
      <Link to={job.kind === "enhance" && job.status === "done" ? `/library/${job.generationIds[0]}` : (STUDIO[job.kind] ?? "/library")} className="flex h-full items-center gap-2" title={title}>
        <span className="relative h-full w-12 overflow-hidden rounded-l-media bg-seamless">
          {url && <img src={url} alt="" className="develop absolute inset-0 size-full object-cover" />}
          {videoUrl && <video src={`${videoUrl}#t=0.1`} muted playsInline preload="metadata" aria-hidden className="develop absolute inset-0 size-full object-cover" />}
        </span>
        <span className="flex flex-col text-control">
          <span className={cn("font-semibold", (job.status === "failed" || waiting) && "text-drift")}>{status}</span>
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

const FAILED: Job["status"][] = ["failed", "expired"];

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Activity (spec: Decisions, October 21, item 3): working and failed jobs
// each get a frame, newest first; today's finished jobs fold into one "14
// done" control that opens today's film strip. With nothing working or failed
// it's a single line. It survives navigation and reloads (jobs live in
// IndexedDB and resume on load).
export function JobsTray() {
  const jobs = useRecentJobs(80);
  const [open, setOpen] = useState(false);
  const today = startOfToday();
  const active = jobs.filter((j) => WORKING.includes(j.status) || (FAILED.includes(j.status) && j.createdAt >= today));
  const done = jobs.filter((j) => j.status === "done" && j.createdAt >= today);
  const strip = active.length > 0 || (open && done.length > 0);

  return (
    <section aria-label="Activity" className={cn("shell-panel flex shrink-0 items-center gap-3 overflow-x-auto border-t border-rule px-4", strip ? "h-[4.5rem]" : "h-10")}>
      {active.length > 0 ? (
        <ol aria-label="Working and failed" className="flex shrink-0 gap-2">
          {active.map((job) => (
            <Frame key={job.id} job={job} />
          ))}
        </ol>
      ) : (
        <p className="shrink-0 text-control text-ink-muted">{done.length ? "Nothing running." : "Nothing running. What you generate lines up here."}</p>
      )}
      {done.length > 0 && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls="activity-done"
          onClick={() => setOpen(!open)}
          className="flex h-8 shrink-0 items-center gap-1 rounded-control border border-rule px-3 text-control font-semibold hover:bg-tint-hover"
        >
          {done.length} done
          <ChevronRight aria-hidden className={cn("size-4", open && "rotate-180")} />
        </button>
      )}
      {open && done.length > 0 && (
        <ol id="activity-done" aria-label="Done today" className="flex shrink-0 gap-2">
          {done.map((job) => (
            <Frame key={job.id} job={job} />
          ))}
        </ol>
      )}
    </section>
  );
}
