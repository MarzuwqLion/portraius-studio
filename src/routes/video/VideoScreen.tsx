import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Shuffle } from "lucide-react";
import { WorkScreen } from "@/components/shell/Screen";
import { CameraPicker } from "@/components/studio/CameraPicker";
import { CastPicker } from "@/components/studio/CastPicker";
import { EmptyExample } from "@/components/studio/EmptyExample";
import { GenerateFooter } from "@/components/studio/GenerateFooter";
import { Field, Segmented, Select } from "@/components/studio/fields";
import { OutputTake } from "@/components/studio/OutputTake";
import { PresetPicker } from "@/components/studio/PresetPicker";
import { PromptEditor } from "@/components/studio/PromptEditor";
import { useLaunch } from "@/components/studio/useLaunch";
import { Take } from "@/components/studio/Take";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CHECK_SCORE } from "@/lib/identity/score";
import { usePrice, useRecentJobs } from "@/lib/jobs/hooks";
import type { JobInput } from "@/lib/jobs/runner";
import { VIDEO_PRESETS } from "@/lib/presets/load";
import type { Preset } from "@/lib/presets/schema";
import type { CameraSelection } from "@/lib/prompts/camera";
import type { H3Input, VideoRatio } from "@/lib/registry/inputs";
import { MODEL_IDS, isLocalModel, registryEntry } from "@/lib/registry/models";
import { useFeatureModels } from "@/lib/session/engine";
import { useBlobUrl, useCharacters, useGeneration } from "@/lib/store/hooks";
import { hasNoPeople, isAnimatedCast, type CastPick } from "@/lib/studio/cast";
import { clipInfo, trimClip } from "@/lib/media/video-prep";
import { storeClip } from "@/lib/studio/recast";
import { randomSeed } from "@/lib/studio/image";
import { generationImageBlobId, storeUpload } from "@/lib/studio/uploads";
import {
  VIDEO_MODELS,
  blobHasPerson,
  modelFor,
  isDraft,
  isFinal,
  lastFrameBlobId,
  H3_RESOLUTIONS,
  resolutionLabel,
  renderFinal,
  rerollClip,
  retrySilent,
  startVideo,
  takesReferences,
  REFERENCE_CLIP_SEC,
  type ReferenceClip,
  type VideoMode,
  type VideoModel,
  type VideoRequest,
} from "@/lib/studio/video";
import type { Job } from "@/lib/types/jobs";

const MODES: { value: VideoMode; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "still", label: "Image, then animate" },
  { value: "references", label: "Use references" },
  { value: "image", label: "Animate an image" },
];
const RATIOS: VideoRatio[] = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "9:21"];

type ClipInput = JobInput & { request?: VideoRequest };

function clipLabel(job: Job): string {
  if (job.kind === "image") return "Opening still";
  if (job.modelId === MODEL_IDS.minimaxH3) return `H3 ${resolutionLabel((job.input as JobInput<H3Input>).model.resolution)}`;
  if (job.modelId === MODEL_IDS.localWanFast) return "Wan 5B draft · your GPU";
  // A local final is drawn again on 14B with the draft's seed (spec: Local engine, Models).
  if (job.modelId === MODEL_IDS.localWanBest) return isFinal(job) ? "Wan 14B final · your GPU · may differ from the draft" : "Wan 14B · your GPU";
  return isFinal(job) ? "Final 1080p" : "Draft 480p";
}

// Secondary buttons in the set sit on Studio grey, so they take its text colour.
const ON_SEAMLESS = "border-on-seamless text-on-seamless";

function ClipActions({ job, followUps, onContinue }: { job: Job; followUps: Job[]; onContinue: (blobId: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    void work()
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };
  const hasFinal = followUps.some((c) => isFinal(c) && c.status !== "failed" && c.status !== "cancelled");
  const generationId = job.generationIds[0];
  const generation = useGeneration(job.status === "done" ? generationId : undefined);
  const drifted = generation?.identityScore !== undefined && Math.round(generation.identityScore) < CHECK_SCORE;
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap gap-2">
        {job.kind === "video" && drifted && (
          <Button size="sm" onClick={() => run(() => rerollClip(job.id))} disabled={busy}>
            Re-roll
          </Button>
        )}
        {job.status === "done" && isDraft(job) && !hasFinal && (
          <Button size="sm" onClick={() => run(() => renderFinal(job.id))} disabled={busy}>
            Render final
          </Button>
        )}
        {job.status === "done" && job.kind === "video" && generationId && (
          <Button size="sm" variant="secondary" className={ON_SEAMLESS} onClick={() => run(async () => onContinue(await lastFrameBlobId(generationId)))} disabled={busy}>
            Continue from last frame
          </Button>
        )}
        {job.status === "done" && job.kind === "video" && generationId && (
          <Button asChild size="sm" variant="secondary" className={ON_SEAMLESS}>
            <Link to={`/library/${generationId}`}>Add a line</Link>
          </Button>
        )}
        {job.status === "failed" && job.error?.refusalSubject === "output_audio" && (
          <Button size="sm" variant="secondary" className={ON_SEAMLESS} onClick={() => run(() => retrySilent(job.id))} disabled={busy}>
            Retry silent
          </Button>
        )}
      </div>
      {error && (
        <p className="justify-self-start rounded-control bg-proof px-2 py-1 text-control text-drift" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// Use references' reference clip: a blockout or simple 3D render, prepared
// once when picked (its first 30 s, at most 1080p, no sound) and kept as an
// upload. The video follows it for camera, timing and blocking.
function ReferenceClipField({
  id,
  clip,
  onChange,
  onProgress,
  onError,
}: {
  id: string;
  clip: ReferenceClip | undefined;
  onChange: (clip: ReferenceClip | undefined) => void;
  onProgress: (share: number | undefined) => void;
  onError: (message: string | undefined) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const url = useBlobUrl(clip?.blobId);
  const [cut, setCut] = useState(false);
  const [min, max] = REFERENCE_CLIP_SEC;

  async function take(file: File) {
    onError(undefined);
    try {
      const raw = await clipInfo(file);
      if (raw.durationSec < min) throw new Error(`A reference clip needs at least ${min} s.`);
      onProgress(0);
      const blob = await trimClip(file, { startSec: 0, endSec: Math.min(raw.durationSec, max), maxHeight: 1080 }, onProgress);
      const info = await clipInfo(blob);
      onChange({ blobId: await storeClip(blob), ...info });
      setCut(raw.durationSec > max + 0.05);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      onProgress(undefined);
    }
  }

  return (
    <div className="grid gap-2">
      {clip && url && (
        <>
          <video src={url} muted loop playsInline autoPlay className="max-w-56 rounded-media border border-rule bg-seamless" aria-label="Reference clip" />
          <p className="text-control text-ink-muted">
            {Math.round(clip.durationSec)} s{cut ? `: the first ${max} s of your clip` : ""}. The video runs as long as this clip.
          </p>
        </>
      )}
      <div className="flex gap-2">
        <Button id={id} type="button" variant="secondary" size="sm" onClick={() => input.current?.click()}>
          {clip ? "Replace clip" : "Add a reference clip"}
        </Button>
        {clip && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>
            Remove
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        className="sr-only"
        aria-label="Upload a reference clip"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void take(file);
        }}
      />
    </div>
  );
}

export function VideoScreen() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState<VideoMode>("text");
  // The picked model is the Video feature's default (spec: Local engine).
  const videoModels = useFeatureModels("video");
  const stillModels = useFeatureModels("image");
  const model = videoModels.modelId as VideoModel;
  const setModel = videoModels.setModel;
  const [scene, setScene] = useState("");
  const [cast, setCast] = useState<CastPick[]>([]);
  const [sourceBlobId, setSourceBlobId] = useState<string>();
  const [clip, setClip] = useState<ReferenceClip>();
  const [clipProgress, setClipProgress] = useState<number>();
  const [clipRights, setClipRights] = useState(false);
  // 5 s keeps the default draft cheap (Decisions, October 21, U5, item 8).
  const [durationSec, setDurationSec] = useState(5);
  const [ratio, setRatio] = useState<VideoRatio>("16:9");
  const [audio, setAudio] = useState(true);
  const [seed, setSeed] = useState(randomSeed);
  const [h3Resolution, setH3Resolution] = useState<H3Input["resolution"]>("768P");
  const [camera, setCamera] = useState<CameraSelection>({ movement: "slow-push-in" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const upload = useRef<HTMLInputElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const sourceUrl = useBlobUrl(sourceBlobId);
  const jobs = useRecentJobs(60);
  const [sourcePerson, setSourcePerson] = useState(false);
  const [presetId, setPresetId] = useState<string>();

  function applyPreset(p: Preset | undefined) {
    setPresetId(p?.id);
    if (!p) return;
    setScene(p.recipe.prompt);
    setCamera({ ...p.recipe.camera });
    const { mode: m, durationSec: d, ratio: r } = p.recipe.params ?? {};
    if (MODES.some((o) => o.value === m)) setMode(m as VideoMode);
    if (typeof d === "number") setDurationSec(d);
    if (typeof r === "string") setRatio(r as VideoRatio);
  }
  // Real people go to H3 whatever is chosen: Seedance refuses them (M3
  // notes). A cast of animated characters keeps the chosen model.
  const characters = useCharacters();
  const castRecords = cast.map((c) => characters?.find((r) => r.id === c.characterId));
  const animatedCast = isAnimatedCast(castRecords);
  const effective = modelFor({ mode, cast, model }, sourcePerson, animatedCast, hasNoPeople(castRecords));
  const routedForPeople = effective !== model;
  const spec = VIDEO_MODELS.find((m) => m.id === effective)!;

  useEffect(() => {
    let live = true;
    setSourcePerson(false);
    if (mode === "image" && sourceBlobId) void blobHasPerson(sourceBlobId).then((person) => live && setSourcePerson(person));
    return () => {
      live = false;
    };
  }, [mode, sourceBlobId]);

  // The Tour's "Try this with Walt": a preset and a cast.
  useLaunch((launch) => {
    if (launch.presetId) applyPreset(VIDEO_PRESETS.find((p) => p.id === launch.presetId));
    if (launch.cast) setCast(launch.cast);
  });

  // ?from=<generationId>: that image becomes the first frame.
  useEffect(() => {
    const from = params.get("from");
    if (!from) return;
    void generationImageBlobId(from).then((id) => {
      if (id) {
        setSourceBlobId(id);
        setMode("image");
      }
    });
  }, [params]);

  // Still first is the default once a cast is picked.
  useEffect(() => {
    if (cast.length && mode === "text") setMode("still");
    // Only a change in cast size should flip the mode, not every mode change.
  }, [cast.length]);

  // Durations past a model's range clamp to it, including a preset's (Night
  // walk's 6 s on local Wan, which takes 2 to 5).
  useEffect(() => {
    const [min, max] = spec.duration;
    setDurationSec((d) => Math.min(max, Math.max(min, d)));
  }, [effective, durationSec]);

  const withClip = mode === "references" && clip ? clip : undefined;
  // With a reference clip the video runs as long as the clip: all of it on Seedance, its first 15 s on H3.
  const clipSec = withClip ? Math.min(effective === MODEL_IDS.minimaxH3 ? 15 : REFERENCE_CLIP_SEC[1], Math.max(4, Math.round(withClip.durationSec))) : undefined;
  const request: VideoRequest = {
    mode,
    model: effective,
    scene,
    cast,
    ...(sourceBlobId ? { sourceBlobId } : {}),
    durationSec,
    ratio,
    audio,
    seed,
    h3Resolution,
    camera,
    stillModel: stillModels.modelId,
    ...(withClip ? { clip: withClip } : {}),
  };
  const needsCast = mode === "still" || mode === "references";
  const local = isLocalModel(effective);
  const stillLocal = isLocalModel(stillModels.modelId);
  const waitingFor =
    needsCast && !cast.length ? "Pick a character"
    : mode === "image" && !sourceBlobId ? "Add a first frame"
    : !scene.trim() ? "Write a prompt"
    : mode === "references" && !takesReferences(effective) ? "Use references needs Comfy credits. Try Image, then animate."
    : mode === "references" && clipProgress !== undefined ? `Preparing the clip, ${Math.round(clipProgress * 100)}%`
    : withClip && !clipRights ? "Confirm you made the clip or have the rights to use it"
    : (videoModels.option?.blocked ?? (mode === "still" ? stillModels.option?.blocked : undefined));
  const ready = !waitingFor;
  // Image, then animate is two calls: the 2K opening still, then the clip.
  const price = usePrice(
    async () => [
      ...(mode === "still" ? [{ modelId: stillModels.modelId, input: { prompt: scene, references: [], aspectRatio: "16:9", size: "2K", quality: "best" } }] : []),
      effective === MODEL_IDS.minimaxH3
        ? { modelId: effective, input: { stage: "generate", prompt: scene, durationSec: clipSec ?? durationSec, ratio, resolution: h3Resolution } }
        : { modelId: effective, input: { stage: "draft", prompt: scene, durationSec: clipSec ?? durationSec, ratio, generateAudio: audio } },
    ],
    `${mode}:${effective}:${stillModels.modelId}:${clipSec ?? durationSec}:${h3Resolution}:${audio}`,
  );

  async function generate() {
    if (!ready || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await startVideo(request);
      setSeed(randomSeed());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function continueFrom(blobId: string) {
    setSourceBlobId(blobId);
    setMode("image");
    top.current?.scrollIntoView({ behavior: "smooth" });
  }

  // Clips: every video job, plus Still first stills still waiting on their draft.
  const childrenOf = (id: string) => jobs.filter((j) => j.parentJobId === id);
  const clips = jobs.filter((j) => j.kind === "video" || (j.kind === "image" && Boolean((j.input as JobInput).next) && childrenOf(j.id).length === 0));

  const callSheet = (
    <form
      className="grid gap-4 md:gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void generate();
      }}
    >
      <div ref={top} />
      <PresetPicker presets={VIDEO_PRESETS} value={presetId} onPick={applyPreset} />
      <Segmented label="Mode" value={mode} onChange={setMode} options={MODES} columns={2} />
      {/* Who, then what (Decisions, October 21, item 6). Picking a cast in Text mode moves to Image, then animate. */}
      {mode !== "image" && <Field label="Cast">{(id) => <CastPicker id={id} value={cast} onChange={setCast} />}</Field>}
      {mode === "still" && (
        <p className="text-control text-ink-muted">
          {registryEntry(stillModels.modelId)?.label ?? "Nano Banana 2.1"} draws the opening still with your cast, then the clip starts from it.
        </p>
      )}
      {mode === "references" && (
        <p className="text-control text-ink-muted">
          {withClip
            ? "Your cast's sheets set how everyone and everything looks; the clip sets the camera, timing and who goes where."
            : "Your cast's sheets set who is in the shot and what they wear; the model frames the opening itself."}
        </p>
      )}
      {mode === "references" && (
        <Field label="Reference clip (optional)" hint="A blockout or simple 3D render of the scene. In the prompt, say which shape is who: “the orange figure is @Lead”.">
          {(id) => (
            <ReferenceClipField
              id={id}
              clip={clip}
              onChange={(next) => {
                setClip(next);
                setClipRights(false);
              }}
              onProgress={setClipProgress}
              onError={setError}
            />
          )}
        </Field>
      )}
      {withClip && (
        <label className="flex items-start gap-3 text-body">
          <Checkbox checked={clipRights} onCheckedChange={(v) => setClipRights(v === true)} className="mt-0.5" />
          <span>I made this clip or have the rights to use it.</span>
        </label>
      )}

      <Field label="Prompt" hint="Type @ to put someone from your vault in the shot.">
        {(id) => <PromptEditor id={id} value={scene} onChange={setScene} cast={cast} onAddCast={(pick) => setCast((c) => [...c, pick])} rows={4} maxLength={2000} placeholder="Type @ to add someone, then what happens: steps out of the rain into a lit doorway" />}
      </Field>

      {mode === "image" && (
        <Field label="First frame">
          {() => (
            <div className="grid gap-2">
              {sourceUrl && <Take src={sourceUrl} alt="First frame" aspect="16 / 9" className="max-w-56" />}
              <Button type="button" variant="secondary" size="sm" className="justify-self-start" onClick={() => upload.current?.click()}>
                {sourceBlobId ? "Replace" : "Upload an image"}
              </Button>
              <input
                ref={upload}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                aria-label="Upload a first frame"
                tabIndex={-1}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void storeUpload(file).then(setSourceBlobId, () => setError("That image couldn't be read."));
                }}
              />
            </div>
          )}
        </Field>
      )}

      {/* The picker and the takes agree: people always render on H3 (Decisions, October 21, item 9), unless the clip runs on the visitor's GPU. */}
      <Field label="Model" hint={videoModels.option?.blocked ?? (local ? "Runs on your GPU, free." : animatedCast ? "Animated characters can render on Seedance or MiniMax H3." : "Real people in the shot render on MiniMax H3.")}>
        {(id) =>
          routedForPeople ? (
            <Select id={id} value={effective} onChange={() => undefined} options={VIDEO_MODELS.filter((m) => m.id === effective).map((m) => ({ value: m.id, label: m.label }))} />
          ) : (
            <select id={id} value={model} onChange={(e) => setModel(e.target.value)} className="h-10 w-full rounded-control border border-rule bg-proof px-3 text-body text-ink">
              {[
                { label: "On your GPU, free", options: videoModels.options.filter((o) => o.backend === "local") },
                { label: "Comfy credits", options: videoModels.options.filter((o) => o.backend === "router") },
              ]
                .filter((g) => g.options.length)
                .map((g, _, groups) => {
                  const items = g.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                      {o.blocked ? " (not ready)" : ""}
                    </option>
                  ));
                  return groups.length > 1 ? (
                    <optgroup key={g.label} label={g.label}>
                      {items}
                    </optgroup>
                  ) : (
                    items
                  );
                })}
            </select>
          )
        }
      </Field>
      {mode === "still" && stillModels.options.length > 1 && (
        <Field label="Still drawn with">
          {(id) => (
            <select id={id} value={stillModels.modelId} onChange={(e) => stillModels.setModel(e.target.value)} className="h-10 w-full rounded-control border border-rule bg-proof px-3 text-body text-ink">
              {stillModels.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label} · {o.backend === "local" ? "your GPU" : "Comfy credits"}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}

      {clipSec ? (
        <p className="text-control text-ink-muted">
          Length: {clipSec} s, from the clip{effective === MODEL_IDS.minimaxH3 && withClip!.durationSec > 15.05 ? " (MiniMax H3 takes its first 15 s)" : ""}.
        </p>
      ) : (
        <Field label={`Duration: ${durationSec} s`}>
          {(id) => <input id={id} type="range" min={spec.duration[0]} max={spec.duration[1]} value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))} className="w-full" />}
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        {(mode === "text" || (mode === "references" && !withClip) || mode === "still") && (
          <Field label="Aspect ratio">{(id) => <Select id={id} value={ratio} onChange={(v) => v && setRatio(v)} options={RATIOS.map((r) => ({ value: r, label: r }))} />}</Field>
        )}
        {effective === MODEL_IDS.minimaxH3 && (
          <Field label="Resolution">
            {(id) => <Select id={id} value={h3Resolution} onChange={(v) => v && setH3Resolution(v)} options={H3_RESOLUTIONS} />}
          </Field>
        )}
        <Field label="Seed">
          {(id) => (
            <div className="flex gap-1">
              <input id={id} type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} className="h-10 w-full min-w-0 rounded-control border border-rule bg-proof px-3 text-body" />
              <Button type="button" variant="ghost" size="icon" aria-label="New seed" onClick={() => setSeed(randomSeed())}>
                <Shuffle />
              </Button>
            </div>
          )}
        </Field>
      </div>

      {spec.draft && (
        <label className="flex items-center gap-3 text-body">
          <Checkbox checked={audio} onCheckedChange={(v) => setAudio(v === true)} />
          Generate audio
        </label>
      )}

      <Field label="Camera and look">{() => <CameraPicker groups={["movement", "size", "angle", "lens", "lighting"]} value={camera} onChange={setCamera} />}</Field>

      {error && (
        <p className="text-control text-drift" role="alert">
          {error}
        </p>
      )}
    </form>
  );

  const set = (
    <div className="h-full w-full self-stretch overflow-auto">
      {clips.length === 0 ? (
        <EmptyExample presets={VIDEO_PRESETS} value={presetId} onPick={applyPreset} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-6">
          {clips.map((job) => {
            const input = job.input as ClipInput;
            const next = (input.next as { video?: VideoRequest } | undefined)?.video;
            const aspect = (input.request?.ratio ?? next?.ratio ?? "16:9").replace(":", " / ");
            return (
              <OutputTake
                key={job.id}
                job={job}
                alt={input.prompt || "Clip"}
                aspect={aspect}
                label={clipLabel(job)}
                actions={<ClipActions job={job} followUps={childrenOf(job.id)} onContinue={continueFrom} />}
              />
            );
          })}
        </div>
      )}
    </div>
  );

  const footer = (
    <GenerateFooter
      label={spec.draft ? "Make draft" : "Generate"}
      price={price}
      waitingFor={waitingFor}
      busy={busy}
      local={local && (mode !== "still" || stillLocal)}
      onRun={() => void generate()}
      note={spec.draft ? "A 480p draft first; render the 1080p final once you like it." : local ? "Renders on your GPU. A clip takes a few minutes." : undefined}
    />
  );

  return <WorkScreen title="Video" callSheet={callSheet} footer={footer} set={set} />;
}
