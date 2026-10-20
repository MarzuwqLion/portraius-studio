import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { WorkScreen } from "@/components/shell/Screen";
import { CastPicker } from "@/components/studio/CastPicker";
import { Field, Select, TextArea } from "@/components/studio/fields";
import { jobStatusText } from "@/components/studio/JobTake";
import { SplitView } from "@/components/studio/SplitView";
import { ScoreBadge, Take } from "@/components/studio/Take";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useEstimateLabel, useRecentJobs } from "@/lib/jobs/hooks";
import { retryJob, type JobInput } from "@/lib/jobs/runner";
import { clipInfo, trimClip, type ClipInfo } from "@/lib/media/video-prep";
import { RECAST_PRESETS } from "@/lib/presets/load";
import type { H3Input } from "@/lib/registry/inputs";
import { MODEL_IDS } from "@/lib/registry/models";
import { db } from "@/lib/store/db";
import { useBlobUrl, useGeneration } from "@/lib/store/hooks";
import type { CastPick } from "@/lib/studio/cast";
import { randomSeed } from "@/lib/studio/image";
import { LIMITS, facesInClip, isFirstOfTwo, modeOf, startRecast, storeClip, type RecastMode, type RecastRequest } from "@/lib/studio/recast";
import { storeUpload } from "@/lib/studio/uploads";
import type { Job } from "@/lib/types/jobs";
import { cn } from "@/lib/utils";

const MODE_LABEL: Record<RecastMode, string> = { motion: "Motion Transfer", swap: "Object Swap", style: "Style swap" };
const fmt = (s: number) => `${s.toFixed(1)} s`;

function RecastResult({ job }: { job: Job }) {
  const request = (job.input as JobInput & { request?: RecastRequest }).request;
  const generation = useGeneration(job.status === "done" ? job.generationIds[0] : undefined);
  const original = useBlobUrl(request?.clipBlobId);
  const recast = useBlobUrl(generation?.assets.find((a) => a.kind === "video")?.blobId);
  const aspect = request ? `${request.clipWidth} / ${request.clipHeight}` : "16 / 9";
  const preset = RECAST_PRESETS.find((p) => p.id === request?.presetId);
  return (
    <div className="grid gap-2">
      {original && recast ? (
        <SplitView original={original} recast={recast} aspect={aspect} label={isFirstOfTwo(job) ? `${preset?.title}: changing the setting next` : preset?.title} />
      ) : (
        <Take alt={preset?.title ?? "Recast"} aspect={aspect}>
          {jobStatusText(job)}
        </Take>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {generation?.scoreNote === "stylised" ? (
          <span className="text-control text-on-seamless">Score not available for stylised looks</span>
        ) : generation?.identityScore !== undefined ? (
          <>
            <ScoreBadge score={generation.identityScore} />
            {generation.worstScore !== undefined && <span className="text-control text-on-seamless">worst frame {generation.worstScore}</span>}
          </>
        ) : null}
        {(job.status === "failed" || job.status === "expired") && job.error?.retry !== "never" && (
          <Button size="sm" variant="secondary" onClick={() => void retryJob(job.id)}>
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}

export function RecastScreen() {
  const [rawBlobId, setRawBlobId] = useState<string>();
  const [rawInfo, setRawInfo] = useState<ClipInfo>();
  const [presetId, setPresetId] = useState(RECAST_PRESETS.find((p) => p.id === "swap-me-in")?.id ?? RECAST_PRESETS[0]!.id);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [prepared, setPrepared] = useState<{ blobId: string; info: ClipInfo } | undefined>();
  const [progress, setProgress] = useState<number>();
  const [others, setOthers] = useState(false);
  const [rights, setRights] = useState(false);
  const [cast, setCast] = useState<CastPick[]>([]);
  const [swapImageBlobId, setSwapImageBlobId] = useState<string>();
  const [direction, setDirection] = useState("");
  const [h3Resolution, setH3Resolution] = useState<H3Input["resolution"]>("768P");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const clipInput = useRef<HTMLInputElement>(null);
  const swapInput = useRef<HTMLInputElement>(null);
  const rawUrl = useBlobUrl(rawBlobId);
  const swapUrl = useBlobUrl(swapImageBlobId);
  const recent = useRecentJobs(40);
  // Only jobs started here (they carry the clip to compare against). A
  // two-step recast shows as one card: the first step until the second starts.
  const jobs = recent.filter((j) => j.kind === "recast" && "request" in (j.input as object) && !(isFirstOfTwo(j) && recent.some((c) => c.parentJobId === j.id)));
  const libraryClips = useLiveQuery(async () => (await db.generations.where("type").anyOf("video", "recast").reverse().sortBy("createdAt")).slice(0, 20), []);

  const preset = RECAST_PRESETS.find((p) => p.id === presetId)!;
  const mode = modeOf(preset);
  const limits = LIMITS[mode];
  const people = mode === "motion" || (mode === "style" && preset.recipe.slots.some((s) => s.kind === "person"));

  // A new clip, or a mode with other limits: start the trim over.
  useEffect(() => {
    if (!rawInfo) return;
    const end = Math.min(rawInfo.durationSec, limits.maxSec);
    setRange([0, end]);
    setPrepared(undefined);
  }, [rawInfo, limits.maxSec]);

  async function takeClip(blob: Blob) {
    setError(undefined);
    try {
      const info = await clipInfo(blob);
      setRawBlobId(await storeClip(blob));
      setRawInfo(info);
      setRights(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function prepare() {
    if (!rawBlobId) return;
    setError(undefined);
    setProgress(0);
    try {
      const raw = (await db.blobs.get(rawBlobId))!.blob;
      const blob = await trimClip(raw, { startSec: range[0], endSec: range[1], maxHeight: limits.maxHeight, minHeight: limits.minHeight, fps: limits.fps, keepAudio: true }, setProgress);
      const info = await clipInfo(blob);
      setPrepared({ blobId: await storeClip(blob), info });
      setOthers((await facesInClip(blob).catch(() => 0)) > 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProgress(undefined);
    }
  }

  const length = range[1] - range[0];
  const lengthOk = length >= limits.minSec - 0.05 && length <= limits.maxSec + 0.05;
  const ready = Boolean(prepared && rights && (!people || cast.length) && (mode !== "swap" || swapImageBlobId));
  const price = useEstimateLabel(
    mode === "swap" ? MODEL_IDS.happyHorseEdit : MODEL_IDS.minimaxH3,
    ready
      ? async () =>
          mode === "swap"
            ? { prompt: preset.recipe.prompt, videoUrl: "https://example.invalid/clip.mp4" }
            : { stage: "generate", prompt: preset.recipe.prompt, referenceVideos: ["https://example.invalid/clip.mp4"], durationSec: Math.round(prepared!.info.durationSec), ratio: "16:9", resolution: h3Resolution }
      : undefined,
    `${presetId}:${h3Resolution}:${ready}`,
  );

  async function recast() {
    if (!prepared || !ready) return;
    setBusy(true);
    setError(undefined);
    try {
      await startRecast({
        presetId,
        clipBlobId: prepared.blobId,
        clipDurationSec: prepared.info.durationSec,
        clipWidth: prepared.info.width,
        clipHeight: prepared.info.height,
        cast,
        ...(swapImageBlobId ? { swapImageBlobId } : {}),
        direction,
        h3Resolution,
        seed: randomSeed(),
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const callSheet = (
    <div className="grid gap-5">
      <Field label="Clip" hint="A clip you filmed or have the rights to use.">
        {() => (
          <div className="grid gap-2">
            {rawUrl && <video src={rawUrl} controls muted playsInline className="w-full rounded-media border border-rule bg-seamless" />}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => clipInput.current?.click()}>
                {rawBlobId ? "Replace clip" : "Upload a clip"}
              </Button>
              {libraryClips && libraryClips.length > 0 && (
                <div className="min-w-40 flex-1">
                  <Select
                    value={undefined}
                    placeholder="Or pick from the library"
                    options={libraryClips.map((g) => ({ value: g.id, label: (g.prompt || g.type).slice(0, 40) }))}
                    onChange={(id) => {
                      const asset = libraryClips.find((g) => g.id === id)?.assets.find((a) => a.kind === "video");
                      if (asset) void db.blobs.get(asset.blobId).then((row) => row && takeClip(row.blob));
                    }}
                  />
                </div>
              )}
            </div>
            <input
              ref={clipInput}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void takeClip(file);
              }}
            />
          </div>
        )}
      </Field>

      <Field label="Preset">
        {() => (
          <div className="grid gap-3">
            {(["motion", "swap", "style"] as RecastMode[]).map((m) => (
              <div key={m} className="grid gap-1">
                <span className="text-control text-ink-muted">{MODE_LABEL[m]}</span>
                <div className="flex flex-wrap gap-1">
                  {RECAST_PRESETS.filter((p) => modeOf(p) === m).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={p.id === presetId}
                      onClick={() => setPresetId(p.id)}
                      className={cn("h-8 rounded-control border px-3 text-control font-semibold", p.id === presetId ? "border-ink bg-ink text-on-ink" : "border-rule hover:bg-tint-hover")}
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Field>

      {rawInfo && (
        <Field label={`Trim: ${fmt(range[0])} to ${fmt(range[1])} (${fmt(length)})`} hint={`${MODE_LABEL[mode]} takes ${limits.minSec} to ${limits.maxSec} s.`}>
          {() => (
            <div className="grid gap-2">
              <input type="range" min={0} max={rawInfo.durationSec} step={0.1} value={range[0]} aria-label="Start" onChange={(e) => setRange([Math.min(Number(e.target.value), range[1] - 0.5), range[1]])} className="w-full accent-ink" />
              <input type="range" min={0} max={rawInfo.durationSec} step={0.1} value={range[1]} aria-label="End" onChange={(e) => setRange([range[0], Math.max(Number(e.target.value), range[0] + 0.5)])} className="w-full accent-ink" />
              {!lengthOk && <p className="text-control text-drift">Trim to {limits.minSec} to {limits.maxSec} s.</p>}
              <Button type="button" variant="secondary" size="sm" className="justify-self-start" disabled={!lengthOk || progress !== undefined} onClick={() => void prepare()}>
                {progress !== undefined ? `Preparing ${Math.round(progress * 100)}%` : prepared ? "Prepare again" : "Prepare clip"}
              </Button>
              {prepared && <p className="text-control text-ink-muted">Ready: {fmt(prepared.info.durationSec)} at {prepared.info.height}p.</p>}
              {others && <p className="text-control text-drift">Other people in the clip will still appear. Make sure they're OK with it.</p>}
            </div>
          )}
        </Field>
      )}

      {people && <Field label="Performer">{() => <CastPicker value={cast.slice(0, 1)} onChange={(picks) => setCast(picks.slice(-1))} />}</Field>}

      {mode === "swap" && (
        <Field label="Replacement" hint={`The ${String(preset.recipe.params?.target ?? "thing")} to put in the clip.`}>
          {() => (
            <div className="grid gap-2">
              {swapUrl && <Take src={swapUrl} alt="Replacement" aspect="1 / 1" className="max-w-32" />}
              <Button type="button" variant="secondary" size="sm" className="justify-self-start" onClick={() => swapInput.current?.click()}>
                {swapImageBlobId ? "Replace image" : "Upload an image"}
              </Button>
              <input
                ref={swapInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void storeUpload(file).then(setSwapImageBlobId);
                }}
              />
            </div>
          )}
        </Field>
      )}

      <Field label="Direction" hint="Optional. Added to the preset's prompt.">
        {(id) => <TextArea id={id} value={direction} onChange={setDirection} rows={2} maxLength={400} />}
      </Field>

      {mode !== "swap" && (
        <Field label="Resolution">
          {(id) => <Select id={id} value={h3Resolution} onChange={(v) => v && setH3Resolution(v)} options={[{ value: "768P", label: "768P" }, { value: "2K", label: "2K" }]} />}
        </Field>
      )}

      <label className="flex items-start gap-3 text-body">
        <Checkbox checked={rights} onCheckedChange={(v) => setRights(v === true)} className="mt-0.5" />
        <span>I filmed this or have the rights to use it.</span>
      </label>

      {error && (
        <p className="text-control text-drift" role="alert">
          {error}
        </p>
      )}
      <Button onClick={() => void recast()} disabled={!ready || busy}>
        Recast · {price}
      </Button>
      <p className="text-control text-ink-muted">{mode === "swap" ? "Object Swap runs on HappyHorse 1.0 video edit." : "Recasts with people run on H3; Seedance doesn't accept them."}</p>
    </div>
  );

  const set = (
    <div className="h-full w-full self-stretch overflow-auto">
      {jobs.length === 0 ? (
        <p className="flex h-full items-center justify-center text-body">Original and recast play side by side here.</p>
      ) : (
        <div className="mx-auto grid max-w-4xl gap-10">
          {jobs.map((job) => (
            <RecastResult key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );

  return <WorkScreen title="Recast" callSheet={callSheet} set={set} />;
}
