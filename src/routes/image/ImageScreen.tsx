import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { WorkScreen } from "@/components/shell/Screen";
import { CameraPicker } from "@/components/studio/CameraPicker";
import { CastPicker } from "@/components/studio/CastPicker";
import { Field, Segmented, Select, TextArea } from "@/components/studio/fields";
import { OutputTake } from "@/components/studio/OutputTake";
import { PresetPicker } from "@/components/studio/PresetPicker";
import { RealismAction, RealismTake } from "@/components/studio/Realism";
import { SaveAsElement } from "@/components/studio/SaveAsElement";
import { Take } from "@/components/studio/Take";
import { Button } from "@/components/ui/button";
import { useEstimateLabel, useRecentJobs } from "@/lib/jobs/hooks";
import type { JobInput } from "@/lib/jobs/runner";
import { IMAGE_PRESETS } from "@/lib/presets/load";
import type { Preset } from "@/lib/presets/schema";
import type { CameraSelection } from "@/lib/prompts/camera";
import { compileImagePrompt, slotsIn } from "@/lib/prompts/compile";
import type { GenerateImageInput, ImageAspectRatio } from "@/lib/registry/inputs";
import { MODEL_IDS } from "@/lib/registry/models";
import { db } from "@/lib/store/db";
import { useBlobUrl } from "@/lib/store/hooks";
import { describeCast, type CastPick } from "@/lib/studio/cast";
import { startImages, type ImageRequest } from "@/lib/studio/image";
import { generationImageBlobId, storeUpload } from "@/lib/studio/uploads";
import type { Job } from "@/lib/types/jobs";

const RATIOS: ImageAspectRatio[] = ["1:1", "4:5", "5:4", "3:4", "4:3", "2:3", "3:2", "9:16", "16:9", "21:9", "1:4", "4:1", "1:8", "8:1"];
const aspectCss = (ratio: string | undefined) => (ratio ?? "1:1").replace(":", " / ");

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
}

// Retries sit beside the take they retry, the higher score first.
function useImageGroups(): Job[][] {
  const jobs = useRecentJobs(60);
  const scores = useLiveQuery(async () => {
    const ids = jobs.flatMap((j) => (j.generationIds[0] ? [j.generationIds[0]] : []));
    const generations = await db.generations.bulkGet(ids);
    return new Map(generations.flatMap((g) => (g ? [[g.jobId, g.identityScore ?? -1] as const] : [])));
  }, [jobs.map((j) => `${j.id}:${j.status}`).join(",")]);
  const images = jobs.filter((j) => j.kind === "image" && !(j.input as JobInput).next);
  const byId = new Set(images.map((j) => j.id));
  return images
    .filter((j) => !j.parentJobId || !byId.has(j.parentJobId))
    .map((root) => [root, ...images.filter((j) => j.parentJobId === root.id)].sort((a, b) => (scores?.get(b.id) ?? -1) - (scores?.get(a.id) ?? -1)));
}

export function ImageScreen() {
  const navigate = useNavigate();
  const [scene, setScene] = useState("");
  const [cast, setCast] = useState<CastPick[]>([]);
  const [sourceBlobId, setSourceBlobId] = useState<string>();
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>("4:5");
  const [size, setSize] = useState<GenerateImageInput["size"]>("2K");
  const [quality, setQuality] = useState<GenerateImageInput["quality"]>("best");
  const [count, setCount] = useState(1);
  const [camera, setCamera] = useState<CameraSelection>({});
  const [preview, setPreview] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [override, setOverride] = useState("");
  const [picked, setPicked] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [presetId, setPresetId] = useState<string>();
  const [params] = useSearchParams();
  const upload = useRef<HTMLInputElement>(null);
  const sourceUrl = useBlobUrl(sourceBlobId);
  const groups = useImageGroups();
  const realism = useRecentJobs(24).filter((j) => j.kind === "enhance");

  function applyPreset(p: Preset | undefined) {
    setPresetId(p?.id);
    if (!p) return;
    setScene(p.recipe.prompt);
    setCamera({ ...p.recipe.camera });
    const ratio = p.recipe.params?.aspectRatio;
    if (typeof ratio === "string" && RATIOS.includes(ratio as ImageAspectRatio)) setAspectRatio(ratio as ImageAspectRatio);
  }

  // #/image?recipe=<id> preloads a preset (Contracts: routes).
  const recipeParam = params.get("recipe");
  useEffect(() => {
    if (recipeParam) applyPreset(IMAGE_PRESETS.find((p) => p.id === recipeParam));
  }, [recipeParam]);

  // The compiled prompt, kept current as the controls change.
  useEffect(() => {
    let live = true;
    void describeCast(cast).then((members) => {
      if (live) setPreview(compileImagePrompt({ scene, cast: members, camera, modelId: MODEL_IDS.nanoBanana, editing: Boolean(sourceBlobId) }));
    });
    return () => {
      live = false;
    };
  }, [scene, cast, camera, sourceBlobId]);

  const request: ImageRequest = { scene, cast, ...(sourceBlobId ? { sourceBlobId } : {}), aspectRatio, size, quality, count, camera, ...(advanced && override.trim() ? { promptOverride: override } : {}) };
  const ready = Boolean(scene.trim() || (advanced && override.trim()));
  const price = useEstimateLabel(MODEL_IDS.nanoBanana, ready ? async () => ({ prompt: preview, references: [], aspectRatio, size, quality }) : undefined, `${size}:${quality}:${aspectRatio}:${ready}`);
  const unknownSlots = slotsIn(scene).filter((s) => !cast.some((c) => c.slot === s));

  async function generate() {
    if (!ready || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await startImages(request);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "g" && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target)) {
        e.preventDefault();
        void generate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const pickedJob = groups.flat().find((j) => j.id === picked && j.status === "done");

  const callSheet = (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void generate();
      }}
    >
      <PresetPicker presets={IMAGE_PRESETS} value={presetId} onPick={applyPreset} />

      <Field label="Prompt" hint={cast.length ? `Name cast members with ${cast.map((c) => `{${c.slot}}`).join(", ")}.` : "Add characters below to put them in the shot."}>
        {(id) => <TextArea id={id} value={scene} onChange={setScene} rows={4} maxLength={2000} placeholder="{lead} reading in a corner booth of a late-night diner" />}
      </Field>
      {unknownSlots.length > 0 && <p className="text-control text-drift">{unknownSlots.map((s) => `{${s}}`).join(", ")} has no character yet.</p>}

      <Field label="Cast">{(id) => <CastPicker id={id} value={cast} onChange={setCast} />}</Field>

      <Field label="Source image" hint={sourceBlobId ? "Edit mode: the prompt describes the change." : "Optional. Add one to edit it."}>
        {() => (
          <div className="grid gap-2">
            {sourceUrl && <Take src={sourceUrl} alt="Source image" aspect="4 / 3" className="max-w-48" />}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => upload.current?.click()}>
                {sourceBlobId ? "Replace" : "Upload"}
              </Button>
              {sourceBlobId && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setSourceBlobId(undefined)}>
                  Remove
                </Button>
              )}
            </div>
            <input
              ref={upload}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Upload a source image"
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

      <div className="grid grid-cols-2 gap-3">
        <Field label="Aspect ratio">{(id) => <Select id={id} value={aspectRatio} onChange={(v) => v && setAspectRatio(v)} options={RATIOS.map((r) => ({ value: r, label: r }))} />}</Field>
        <Field label="Count">{(id) => <Select id={id} value={String(count)} onChange={(v) => setCount(Number(v ?? 1))} options={["1", "2", "3", "4"].map((n) => ({ value: n, label: n }))} />}</Field>
      </div>
      <Field label="Size">{() => <Segmented label="Size" value={size} onChange={setSize} options={[{ value: "1K", label: "1K" }, { value: "2K", label: "2K" }, { value: "4K", label: "4K" }]} />}</Field>
      <Field label="Quality">{() => <Segmented label="Quality" value={quality} onChange={setQuality} options={[{ value: "fast", label: "Fast" }, { value: "best", label: "Best" }]} />}</Field>

      <Field label="Camera and look">{() => <CameraPicker groups={["size", "angle", "lens", "aperture", "lighting"]} value={camera} onChange={setCamera} />}</Field>

      <details className="grid gap-2 border-t border-rule pt-3" onToggle={(e) => !(e.target as HTMLDetailsElement).open && setAdvanced(false)}>
        <summary className="cursor-pointer text-control font-semibold">Prompt</summary>
        {advanced ? (
          <TextArea value={override} onChange={setOverride} rows={10} />
        ) : (
          <pre className="max-h-64 overflow-auto font-body text-control whitespace-pre-wrap text-ink-muted">{preview}</pre>
        )}
        <label className="flex items-center gap-2 text-control">
          <input
            type="checkbox"
            checked={advanced}
            onChange={(e) => {
              setAdvanced(e.target.checked);
              if (e.target.checked && !override) setOverride(preview);
            }}
          />
          Edit the prompt myself
        </label>
      </details>

      {error && (
        <p className="text-control text-drift" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={!ready || busy}>
        Generate{count > 1 ? ` ${count}` : ""} · {price}
      </Button>
    </form>
  );

  const set = (
    <div className="h-full w-full self-stretch overflow-auto">
      {groups.length === 0 && realism.length === 0 ? (
        <p className="flex h-full items-center justify-center text-body">Takes appear here.</p>
      ) : (
        <div className="grid gap-6">
          {pickedJob && (
            <div className="flex flex-wrap items-center gap-2 rounded-control bg-proof p-2 text-ink">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void generationImageBlobId(pickedJob.generationIds[0]!).then((id) => id && setSourceBlobId(id))}
              >
                Edit again
              </Button>
              <Button size="sm" variant="secondary" onClick={() => navigate(`/video?from=${pickedJob.generationIds[0]}`)}>
                Animate
              </Button>
              <SaveAsElement generationId={pickedJob.generationIds[0]!} />
              <RealismAction generationId={pickedJob.generationIds[0]!} className="border-l border-rule pl-3" />
            </div>
          )}
          {realism.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-6">
              {realism.map((job) => (
                <RealismTake key={job.id} job={job} />
              ))}
            </div>
          )}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-6">
            {groups.flatMap((group) =>
              group.map((job) => {
                const input = job.input as JobInput & { request?: ImageRequest };
                return (
                  <OutputTake
                    key={job.id}
                    job={job}
                    alt={input.prompt || "Image"}
                    aspect={aspectCss(input.request?.aspectRatio)}
                    label={job.parentJobId ? "Automatic retry" : undefined}
                    picked={picked === job.id}
                    onPick={() => setPicked(picked === job.id ? undefined : job.id)}
                  />
                );
              }),
            )}
          </div>
        </div>
      )}
    </div>
  );

  return <WorkScreen title="Image" callSheet={callSheet} set={set} />;
}
