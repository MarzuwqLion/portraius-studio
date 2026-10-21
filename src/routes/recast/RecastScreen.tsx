import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { WorkScreen } from "@/components/shell/Screen";
import { CastPicker } from "@/components/studio/CastPicker";
import { PresetTiles } from "@/components/studio/PresetTiles";
import { useLaunch } from "@/components/studio/useLaunch";
import { GenerateFooter } from "@/components/studio/GenerateFooter";
import { Field, Select, TextArea } from "@/components/studio/fields";
import { jobStatusText } from "@/components/studio/JobTake";
import { SocialExport } from "@/components/studio/SocialExport";
import { SplitView } from "@/components/studio/SplitView";
import { ScoreBadge, Take } from "@/components/studio/Take";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CHECK_SCORE } from "@/lib/identity/score";
import { perSecondLabel } from "@/lib/jobs/estimate";
import { usePrice, useRecentJobs } from "@/lib/jobs/hooks";
import { retryJob, type JobInput } from "@/lib/jobs/runner";
import { clipInfo, trimClip, type ClipInfo } from "@/lib/media/video-prep";
import { RECAST_PRESETS, posterUrl } from "@/lib/presets/load";
import type { Preset } from "@/lib/presets/schema";
import type { H3Input } from "@/lib/registry/inputs";
import { MODEL_IDS } from "@/lib/registry/models";
import { db } from "@/lib/store/db";
import { useBlobUrl, useCharacter, useGeneration } from "@/lib/store/hooks";
import type { CastPick } from "@/lib/studio/cast";
import { randomSeed } from "@/lib/studio/image";
import {
  LIMITS,
  defaultRange,
  GROUP_LABEL,
  GROUP_ORDER,
  groupOf,
  MODE_LABEL,
  facesInClip,
  fitsLimits,
  isFirstOfTwo,
  modeOf,
  recastNeeds,
  startRecast,
  storeClip,
  tooShort,
  type PreparedClip,
  type RecastRequest,
} from "@/lib/studio/recast";
import { SAMPLE_CLIP } from "@/lib/studio/launch";
import { storeUpload } from "@/lib/studio/uploads";
import { H3_RESOLUTIONS } from "@/lib/studio/video";
import { samplePoster, sampleUrl } from "@/lib/tour/tour";
import type { Job } from "@/lib/types/jobs";
import { cn } from "@/lib/utils";

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
            <ScoreBadge score={generation.identityScore} {...(generation.worstScore !== undefined ? { lowest: generation.worstScore } : {})} />
            {/* A drifted recast runs again with a new seed (spec: Bands and actions). */}
            {request && Math.round(generation.identityScore) < CHECK_SCORE && (
              <Button size="sm" onClick={() => void startRecast({ ...request, seed: randomSeed() })}>
                Re-roll
              </Button>
            )}
          </>
        ) : null}
        {(job.status === "failed" || job.status === "expired") && job.error?.retry !== "never" && (
          <Button size="sm" variant="secondary" className="border-on-seamless text-on-seamless" onClick={() => void retryJob(job.id)}>
            Retry
          </Button>
        )}
      </div>
      {generation && !isFirstOfTwo(job) && <SocialExport generationId={generation.id} onSeamless size="sm" />}
    </div>
  );
}

// The empty set (spec: Decisions, October 21, item 12): the whole set takes a
// dropped clip, with the sample's original and recast looping behind the
// invitation. With earlier recasts below, it shrinks to a band.
function DropStage({ full, onClip, onSample, onUpload }: { full: boolean; onClip: (blob: Blob) => void; onSample: () => void; onUpload: () => void }) {
  const [over, setOver] = useState(false);
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const loop = (name: string, label: string) => (
    <video
      src={`${sampleUrl(name)}${still ? "#t=5" : ""}`}
      poster={samplePoster(name)}
      muted
      loop
      playsInline
      autoPlay={!still}
      preload="auto"
      aria-label={label}
      className="size-full object-cover"
    />
  );
  return (
    <section
      aria-label="Drop a clip"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("video/"));
        if (file) onClip(file);
      }}
      className={cn("relative grid overflow-hidden rounded-media border-2 border-dashed", full ? "h-full" : "h-64", over ? "border-on-seamless" : "border-rule")}
    >
      <div aria-hidden className="absolute inset-0 grid grid-cols-2">
        {loop("concert-original.mp4", "Sample original")}
        {loop("concert-recast.mp4", "Sample recast")}
      </div>
      <div className="absolute inset-0 bg-seamless/75" />
      <div className="relative grid content-center justify-items-center gap-4 p-6 text-center">
        <p className="font-display text-screen font-extrabold">Drop a clip, or try the sample</p>
        <p className="max-w-[52ch] text-body">Use a clip you filmed or have the rights to use. Playing behind this: the sample, and Walt Harmon doing the same moves.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={onSample}>Try the sample</Button>
          <Button variant="secondary" className="border-on-seamless text-on-seamless" onClick={onUpload}>
            Upload a clip
          </Button>
        </div>
      </div>
    </section>
  );
}

// A prepared clip, and the part of which raw clip it was made from.
type Ready = PreparedClip & { source: string };

// The set once a clip is in (Decisions, October 21, U5, item 3): the result
// view's labels over the clip, looping, and beside it who or what goes in.
function ClipStage({ clipUrl, info, right, caption }: { clipUrl: string; info: ClipInfo | undefined; right: { src: string; alt: string } | undefined; caption: string }) {
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const aspect = info ? `${info.width} / ${info.height}` : "16 / 9";
  return (
    <section aria-label="Your clip" className="mx-auto grid w-full max-w-4xl gap-2">
      <div className="grid grid-cols-2 gap-2">
        <span className="font-display text-screen font-extrabold text-on-seamless">Original</span>
        <span className="font-display text-screen font-extrabold text-on-seamless">Recast</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="relative overflow-hidden rounded-media border border-rule bg-seamless" style={{ aspectRatio: aspect }}>
          <video key={clipUrl} src={`${clipUrl}${still ? "#t=1" : ""}`} muted loop playsInline autoPlay={!still} preload="auto" aria-label="Your clip" className="absolute inset-0 size-full object-contain" />
        </div>
        <div className="relative overflow-hidden rounded-media border border-rule bg-seamless" style={{ aspectRatio: aspect }}>
          {right && <img src={right.src} alt={right.alt} className="develop absolute inset-0 size-full object-contain" />}
          <p className={cn("absolute inset-x-0 bottom-0 p-3 text-center text-control", right ? "bg-seamless/75" : "top-0 flex items-center justify-center")}>{caption}</p>
        </div>
      </div>
    </section>
  );
}

// The cast member's front view, for the set before a run.
function useFrontView(characterId: string | undefined): { src: string; alt: string } | undefined {
  const record = useCharacter(characterId);
  const src = useBlobUrl(record ? record.blobIds[record.file.sheet.views.front] : undefined);
  return record && src ? { src, alt: `Front view of ${record.name}` } : undefined;
}

export function RecastScreen() {
  const [rawBlobId, setRawBlobId] = useState<string>();
  const [rawInfo, setRawInfo] = useState<ClipInfo>();
  const [presetId, setPresetId] = useState(RECAST_PRESETS.find((p) => p.id === "swap-me-in")?.id ?? RECAST_PRESETS[0]!.id);
  // The whole clip, or its first allowed seconds, until the visitor trims
  // (spec: Recast, Input). `range` follows the sliders as they move; `trim` is
  // what gets prepared, set when a slider is released.
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [trim, setTrim] = useState<[number, number]>([0, 0]);
  const [trimmed, setTrimmed] = useState(false);
  const [prepared, setPrepared] = useState<Ready>();
  const [progress, setProgress] = useState<number>();
  const [others, setOthers] = useState(false);
  const [rights, setRights] = useState(false);
  // The bundled sample needs no rights check: the checkbox attests to clips
  // people bring (Decisions, October 21, U5, item 2).
  const [sample, setSample] = useState(false);
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
  const performer = useFrontView(cast[0]?.characterId);
  const recent = useRecentJobs(40);
  // Only jobs started here (they carry the clip to compare against). A
  // two-step recast shows as one card: the first step until the second starts.
  const jobs = recent.filter((j) => j.kind === "recast" && "request" in (j.input as object) && !(isFirstOfTwo(j) && recent.some((c) => c.parentJobId === j.id)));
  const libraryClips = useLiveQuery(async () => (await db.generations.where("type").anyOf("video", "recast").reverse().sortBy("createdAt")).slice(0, 20), []);

  const preset = RECAST_PRESETS.find((p) => p.id === presetId)!;
  const presetPoster = posterUrl(preset);
  const presetStill = presetPoster ? { src: presetPoster, alt: preset.title } : undefined;
  const mode = modeOf(preset);
  const limits = LIMITS[mode];
  const limitsNow = useRef(limits);
  limitsNow.current = limits;
  const people = mode === "motion" || (mode === "style" && preset.recipe.slots.some((s) => s.kind === "person"));

  // A new clip starts the trim over, and prepares straight away. Any clip but
  // the sample brings the rights checkbox back, unticked.
  async function takeClip(blob: Blob, isSample = false) {
    setError(undefined);
    try {
      const info = await clipInfo(blob);
      setRawBlobId(await storeClip(blob));
      setRawInfo(info);
      // Read at the time: a Tour launch picks its preset just before the sample arrives.
      const whole = defaultRange(info.durationSec, limitsNow.current);
      setRange(whole);
      setTrim(whole);
      setTrimmed(false);
      setPrepared(undefined);
      setOthers(false);
      setRights(false);
      setSample(isSample);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // The sample clip from public/samples/: the Tour's "Try this with Walt",
  // and "try the sample" on the empty set.
  async function takeSample() {
    setError(undefined);
    const res = await fetch(sampleUrl(SAMPLE_CLIP)).catch(() => undefined);
    if (!res?.ok) return setError("The sample clip didn't load. Try again.");
    await takeClip(await res.blob(), true);
  }

  useLaunch((launch) => {
    const p = RECAST_PRESETS.find((r) => r.id === launch.presetId);
    if (p) choosePreset(p);
    if (launch.cast) setCast(launch.cast.slice(0, 1));
    if (launch.sampleClip) void takeSample();
  });

  // A preset whose limits the trim doesn't fit goes back to the first allowed
  // seconds. The prepared clip stays and is used again whenever it fits.
  function choosePreset(p: Preset) {
    setPresetId(p.id);
    const next = LIMITS[modeOf(p)];
    if (!rawInfo || trim[1] - trim[0] <= next.maxSec + 0.05) return;
    const first = defaultRange(rawInfo.durationSec, next);
    setRange(first);
    setTrim(first);
    setTrimmed(false);
  }

  // A slider stops moving: what it now shows is what gets prepared. The
  // sliders keep the length within the mode's maximum as they move.
  function moveRange(next: [number, number], moved: "start" | "end") {
    const [start, end] = next;
    if (end - start <= limits.maxSec) return setRange(next);
    setRange(moved === "start" ? [start, start + limits.maxSec] : [end - limits.maxSec, end]);
  }
  function commitRange() {
    if (range[0] === trim[0] && range[1] === trim[1]) return;
    setTrim(range);
    setTrimmed(true);
  }

  // Prepare whatever the call sheet now asks for, one clip at a time; a
  // request overtaken by a newer one is dropped when its turn comes.
  const source = rawBlobId ? `${rawBlobId}:${trim[0]}:${trim[1]}` : undefined;
  const length = trim[1] - trim[0];
  const short = Boolean(rawInfo) && tooShort(length, limits);
  const current = prepared && prepared.source === source && fitsLimits(prepared, limits) ? prepared : undefined;
  const queue = useRef<Promise<void>>(Promise.resolve());
  const wanted = useRef<string>(undefined);
  const want = source && rawInfo && !short && !current ? `${source}:${limits.fps ?? ""}:${limits.maxHeight}:${limits.minHeight ?? ""}` : undefined;
  useEffect(() => {
    if (!want || !rawBlobId || wanted.current === want) return;
    wanted.current = want;
    const options = { startSec: trim[0], endSec: trim[1], maxHeight: limits.maxHeight, minHeight: limits.minHeight, fps: limits.fps, keepAudio: true };
    const from = source!;
    const latest = () => wanted.current === want;
    queue.current = queue.current.then(async () => {
      if (!latest()) return;
      setError(undefined);
      setProgress(0);
      try {
        const raw = (await db.blobs.get(rawBlobId))!.blob;
        const blob = await trimClip(raw, options, (share) => latest() && setProgress(share));
        if (!latest()) return;
        const info = await clipInfo(blob);
        setPrepared({ blobId: await storeClip(blob), info, fps: options.fps, source: from });
        const faces = await facesInClip(blob).catch(() => 0);
        if (latest()) setOthers(faces > 1);
      } catch (err) {
        if (latest()) setError((err as Error).message);
      } finally {
        if (latest()) {
          setProgress(undefined);
          wanted.current = undefined;
        }
      }
    });
  }, [want]);

  const needs = recastNeeds({
    mode,
    hasClip: Boolean(rawBlobId),
    tooShort: short,
    ...(progress !== undefined ? { preparing: progress } : {}),
    prepared: current,
    needsPerformer: people,
    hasPerformer: cast.length > 0,
    hasReplacement: Boolean(swapImageBlobId),
    rights: sample || rights,
  });
  const ready = !needs;
  // The price follows the clip's length, so it shows once there is a clip.
  // While the clip prepares, it comes from the raw length.
  const clipSec = Math.round(current?.info.durationSec ?? Math.min(length, limits.maxSec));
  const price = usePrice(
    rawBlobId && clipSec > 0
      ? async () => [
          mode === "swap"
            ? { modelId: MODEL_IDS.happyHorseEdit, input: { prompt: preset.recipe.prompt, videoUrl: "https://example.invalid/clip.mp4" }, hints: { durationSec: clipSec } }
            : { modelId: MODEL_IDS.minimaxH3, input: { stage: "generate", prompt: preset.recipe.prompt, referenceVideos: ["https://example.invalid/clip.mp4"], durationSec: Math.max(4, clipSec), ratio: "16:9", resolution: h3Resolution } },
        ]
      : undefined,
    `${mode}:${clipSec}:${h3Resolution}`,
  );

  async function recast() {
    if (!current || !ready) return;
    setBusy(true);
    setError(undefined);
    try {
      await startRecast({
        presetId,
        clipBlobId: current.blobId,
        clipDurationSec: current.info.durationSec,
        clipWidth: current.info.width,
        clipHeight: current.info.height,
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
            <div className="flex flex-wrap items-center gap-2">
              {/* The clip itself plays on the set; here it's a thumbnail. */}
              {rawUrl && <video src={`${rawUrl}#t=0.1`} muted playsInline preload="metadata" aria-hidden className="aspect-video w-24 rounded-media border border-rule bg-seamless object-cover" />}
              <Button type="button" variant="secondary" size="sm" onClick={() => clipInput.current?.click()}>
                {rawBlobId ? "Replace clip" : "Upload a clip"}
              </Button>
              {libraryClips && libraryClips.length > 0 && (
                <div className="min-w-40 flex-1">
                  <Select
                    value={undefined}
                    label="Pick a clip from the library"
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
            {rawInfo && tooShort(rawInfo.durationSec, limits) ? (
              <p className="text-control text-drift">Recast needs a clip of at least {limits.minSec} s.</p>
            ) : (
              rawInfo &&
              !trimmed &&
              rawInfo.durationSec > limits.maxSec + 0.05 && <p className="text-control">Using the first {limits.maxSec} s. Trim to pick a different part.</p>
            )}
            {rawInfo && trimmed && short && <p className="text-control text-drift">Trim to {limits.minSec} to {limits.maxSec} s.</p>}
            {current && <p className="text-control text-ink-muted">Ready: {fmt(current.info.durationSec)} at {current.info.height}p.</p>}
            {current && others && <p className="text-control text-drift">Other people in the clip will still appear. Make sure they're OK with it.</p>}
            <input
              ref={clipInput}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="sr-only"
              aria-label="Upload a clip"
              tabIndex={-1}
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
            {GROUP_ORDER.map((g) => (
              <div key={g} className="grid gap-1">
                <span className="text-control text-ink-muted">{GROUP_LABEL[g]}</span>
                <PresetTiles presets={RECAST_PRESETS.filter((p) => groupOf(p) === g)} value={presetId} onPick={(p) => p && choosePreset(p)} label={GROUP_LABEL[g]} clearable={false} />
              </div>
            ))}
          </div>
        )}
      </Field>

      {rawInfo && (
        <details className="grid gap-2 border-t border-rule pt-3">
          <summary className="cursor-pointer text-control font-semibold">Trim (optional)</summary>
          <div className="mt-2 grid gap-2">
            <p className="text-control">
              {fmt(range[0])} to {fmt(range[1])} ({fmt(range[1] - range[0])})
            </p>
            {(["start", "end"] as const).map((end) => (
              <input
                key={end}
                type="range"
                min={0}
                max={rawInfo.durationSec}
                step={0.1}
                value={end === "start" ? range[0] : range[1]}
                aria-label={end === "start" ? "Start" : "End"}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  moveRange(end === "start" ? [Math.min(v, range[1] - 0.5), range[1]] : [range[0], Math.max(v, range[0] + 0.5)], end);
                }}
                onPointerUp={commitRange}
                onKeyUp={commitRange}
                onBlur={commitRange}
                className="w-full"
              />
            ))}
            <p className="text-control text-ink-muted">
              {MODE_LABEL[mode]} takes {limits.minSec} to {limits.maxSec} s. The clip prepares again when you let go.
            </p>
          </div>
        </details>
      )}

      {people && <Field label="Performer">{(id) => <CastPicker id={id} value={cast.slice(0, 1)} onChange={(picks) => setCast(picks.slice(-1))} />}</Field>}

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
                aria-label="Upload the replacement image"
                tabIndex={-1}
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
          {(id) => <Select id={id} value={h3Resolution} onChange={(v) => v && setH3Resolution(v)} options={H3_RESOLUTIONS} />}
        </Field>
      )}

      {sample ? (
        <p className="text-control text-ink-muted">The sample ships with Portraius Studio, so there's no rights check.</p>
      ) : (
        <label className="flex items-start gap-3 text-body">
          <Checkbox checked={rights} onCheckedChange={(v) => setRights(v === true)} className="mt-0.5" />
          <span>I filmed this or have the rights to use it.</span>
        </label>
      )}

      {error && (
        <p className="text-control text-drift" role="alert">
          {error}
        </p>
      )}
    </div>
  );

  // Who or what the recast puts in: the performer's front view, or the
  // replacement for Object swap; a style swap without a person keeps its look.
  const stageRight = mode === "swap" ? (swapUrl ? { src: swapUrl, alt: "Replacement" } : undefined) : people ? performer : presetStill;
  const stageCaption =
    mode === "swap" && !swapUrl ? "Upload a replacement image to see what goes in." : people && !performer ? "Pick a performer to see who plays it." : "Plays here after you run it.";

  const set = (
    <div className={cn("grid h-full w-full gap-10 self-stretch overflow-auto", !rawBlobId && jobs.length === 0 ? "grid-rows-[minmax(28rem,1fr)]" : jobs.length === 0 ? "content-center" : "content-start")}>
      {!rawBlobId && <DropStage full={jobs.length === 0} onClip={(blob) => void takeClip(blob)} onSample={() => void takeSample()} onUpload={() => clipInput.current?.click()} />}
      {rawUrl && <ClipStage clipUrl={rawUrl} info={rawInfo} right={stageRight} caption={stageCaption} />}
      {jobs.length > 0 && (
        <div className="mx-auto grid w-full max-w-4xl gap-10">
          {jobs.map((job) => (
            <RecastResult key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );

  const rateLabel = perSecondLabel(mode === "swap" ? MODEL_IDS.happyHorseEdit : MODEL_IDS.minimaxH3, h3Resolution);
  const footer = (
    <GenerateFooter
      label="Recast"
      // Before a clip is in, the price is a rate: it follows the clip's length.
      price={rawBlobId ? price : rateLabel ? { state: "known", label: rateLabel } : price}
      waitingFor={needs}
      busy={busy}
      onRun={() => void recast()}
      note={mode === "swap" ? "Object Swap runs on HappyHorse 1.0 video edit." : "Recasts with people run on MiniMax H3."}
    />
  );

  return <WorkScreen title="Recast" callSheet={callSheet} footer={footer} set={set} />;
}
