import type { ReactNode } from "react";
import { useBlobUrl, useGeneration } from "@/lib/store/hooks";
import type { Job } from "@/lib/types/jobs";
import { jobStatusText } from "./JobTake";
import { ScoreBadge, Take } from "./Take";

// A studio output: the job's status until it lands, then the image or video as
// a print with its identity score.
export function OutputTake({
  job,
  alt,
  aspect,
  label,
  picked,
  onPick,
  actions,
}: {
  job: Job;
  alt: string;
  aspect: string;
  label?: string;
  picked?: boolean;
  onPick?: () => void;
  actions?: ReactNode;
}) {
  const generation = useGeneration(job.status === "done" ? job.generationIds[0] : undefined);
  const image = generation?.assets.find((a) => a.kind === "image");
  const video = generation?.assets.find((a) => a.kind === "video");
  const frame = generation?.assets.find((a) => a.kind === "frame");
  const imageUrl = useBlobUrl(image?.blobId);
  const videoUrl = useBlobUrl(video?.blobId);
  const posterUrl = useBlobUrl(frame?.blobId);
  const cast = generation ? generation.characterIds.length > 0 : false;

  let score: ReactNode = null;
  if (generation?.scoreNote === "stylised") score = <span className="text-control text-on-seamless">Score not available for stylised looks</span>;
  else if (cast && generation?.identityScore !== undefined) {
    score = (
      <span className="flex flex-wrap items-baseline gap-x-3">
        <ScoreBadge score={generation.identityScore} />
        {generation.worstScore !== undefined && <span className="text-control text-on-seamless">worst frame {generation.worstScore}</span>}
      </span>
    );
  }

  return (
    <div className="grid content-start gap-2">
      {video ? (
        <figure className="relative overflow-hidden rounded-media border border-rule bg-seamless" style={{ aspectRatio: aspect }}>
          {videoUrl && <video src={videoUrl} poster={posterUrl} controls loop playsInline className="develop absolute inset-0 size-full object-contain" aria-label={alt} />}
        </figure>
      ) : (
        <Take src={imageUrl} alt={alt} aspect={aspect} picked={picked} onPick={imageUrl ? onPick : undefined} pickLabel={`Pick: ${alt}`} seed={job.createdAt % 97}>
          {jobStatusText(job)}
        </Take>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {label && <span className="text-control font-semibold text-on-seamless">{label}</span>}
        {score}
      </div>
      {actions}
    </div>
  );
}
