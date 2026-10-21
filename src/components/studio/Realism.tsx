import { useEffect, useId, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { useEstimateLabel, useJob } from "@/lib/jobs/hooks";
import { withPrice } from "@/lib/jobs/estimate";
import { retryJob } from "@/lib/jobs/runner";
import { toInlineImage } from "@/lib/media/image-prep";
import { MODEL_IDS } from "@/lib/registry/models";
import { db } from "@/lib/store/db";
import { useBlobUrl, useGeneration } from "@/lib/store/hooks";
import { DEFAULT_STRENGTH, realismSource, startRealism, type RealismJobInput } from "@/lib/studio/realism";
import type { Job } from "@/lib/types/jobs";
import { cn } from "@/lib/utils";
import { BeforeAfter } from "./BeforeAfter";
import { jobStatusText } from "./JobTake";
import { ScoreBadge, Take } from "./Take";

// "Make it real" on a still, with its Realism strength slider right beside it,
// as one group, so the slider reads as the pass's own setting.
export function RealismAction({ generationId, onStarted, className }: { generationId: string; onStarted?: (job: Job) => void; className?: string }) {
  const id = useId();
  const [strength, setStrength] = useState(DEFAULT_STRENGTH);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const price = useEstimateLabel(
    MODEL_IDS.freepikSkin,
    async () => {
      const generation = await db.generations.get(generationId);
      const asset = generation?.assets.find((a) => a.kind === "image");
      const blob = asset ? (await db.blobs.get(asset.blobId))?.blob : undefined;
      if (!blob) throw new Error("no still");
      return { image: await toInlineImage(blob), strength };
    },
    `${generationId}:${strength}`,
  );

  async function run() {
    setBusy(true);
    setError(undefined);
    try {
      // Not onStarted?.(await ...): with no listener that skips the call itself.
      const job = await startRealism(generationId, strength);
      onStarted?.(job);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="group" aria-label="Make it real" className={cn("flex flex-wrap items-center gap-3", className)}>
      <Button size="sm" variant="secondary" onClick={() => void run()} disabled={busy}>
        {withPrice("Make it real", price)}
      </Button>
      <label htmlFor={id} className="flex items-center gap-2 text-control">
        Realism strength
        <input id={id} type="range" min={20} max={100} step={10} value={strength} onChange={(e) => setStrength(Number(e.target.value))} className="w-24" />
        <span className="w-6 tabular-nums">{strength}</span>
      </label>
      {error && (
        <p className="text-control text-drift" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// A started pass, as a line on proof: its status, then a link to the result.
export function RealismStatus({ jobId }: { jobId: string }) {
  const job = useJob(jobId);
  if (!job) return null;
  return (
    <p className="text-control" role="status">
      Make it real: {job.status === "done" ? "done. " : jobStatusText(job)}
      {job.status === "done" && job.generationIds[0] && (
        <Link to={`/library/${job.generationIds[0]}`} className="font-semibold underline underline-offset-4">
          See before and after
        </Link>
      )}
    </p>
  );
}

// The shape of an image, read from its own pixels.
function useAspect(url: string | undefined): string {
  const [aspect, setAspect] = useState("4 / 5");
  useEffect(() => {
    if (!url) return;
    const img = new Image();
    img.onload = () => img.naturalWidth && setAspect(`${img.naturalWidth} / ${img.naturalHeight}`);
    img.src = url;
  }, [url]);
  return aspect;
}

// A realism pass: status while it works, then before and after with both scores.
export function RealismTake({ job, linkToLibrary = true }: { job: Job; linkToLibrary?: boolean }) {
  const sourceId = realismSource(job);
  const source = useGeneration(sourceId);
  const result = useGeneration(job.status === "done" ? job.generationIds[0] : undefined);
  const before = useBlobUrl(source?.assets.find((a) => a.kind === "image")?.blobId);
  const after = useBlobUrl(result?.assets.find((a) => a.kind === "image")?.blobId);
  const aspect = useAspect(before);
  const strength = (job.input as Partial<RealismJobInput>).request?.strength;
  const alt = source?.prompt || "Still";
  const muted = "text-on-seamless";
  const cast = Boolean(source?.characterIds.length);

  return (
    <div className="grid content-start gap-2">
      {before && after ? <BeforeAfter before={before} after={after} aspect={aspect} alt={alt} /> : <Take src={undefined} alt={alt} aspect={aspect}>{jobStatusText(job)}</Take>}
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("text-control font-semibold", muted)}>Make it real{strength !== undefined ? `, strength ${strength}` : ""}</span>
        {result?.scoreNote === "stylised" ? (
          <span className={cn("text-control", muted)}>Score not available for stylised looks</span>
        ) : cast && result ? (
          <>
            <span className={cn("text-control", muted)}>Before</span>
            <ScoreBadge score={source?.identityScore} />
            <span className={cn("text-control", muted)}>After</span>
            <ScoreBadge score={result.identityScore} />
          </>
        ) : null}
        {result && linkToLibrary && (
          <Link to={`/library/${result.id}`} className={cn("text-control underline underline-offset-4", muted)}>
            In the library
          </Link>
        )}
        {(job.status === "failed" || job.status === "expired") && job.error?.retry !== "never" && (
          <Button size="sm" variant="secondary" className="border-on-seamless text-on-seamless" onClick={() => void retryJob(job.id)}>
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
