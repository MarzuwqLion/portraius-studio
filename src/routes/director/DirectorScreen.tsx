import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDown, ArrowLeft, ArrowUp, Trash2 } from "lucide-react";
import { Note, Screen, ScreenTitle } from "@/components/shell/Screen";
import { CameraPicker } from "@/components/studio/CameraPicker";
import { CastPicker } from "@/components/studio/CastPicker";
import { Field, Segmented, Select, TextArea } from "@/components/studio/fields";
import { OutputTake } from "@/components/studio/OutputTake";
import { Take } from "@/components/studio/Take";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useEstimateLabel, useJob, useJobImageUrl, useJobs } from "@/lib/jobs/hooks";
import { MODEL_IDS, registryEntry } from "@/lib/registry/models";
import { db } from "@/lib/store/db";
import { useBlobUrl, useGeneration, useObjectUrl } from "@/lib/store/hooks";
import {
  animateShot,
  chainStale,
  continues,
  deleteScene,
  drawAnchors,
  exportJobId,
  exportScene,
  finalizeShot,
  listScenes,
  loadScene,
  newScene,
  newShot,
  ONE_TAKE_MAX_SEC,
  oneTakeDurations,
  oneTakeInput,
  oneTakeProblem,
  pickAnchor,
  previousShot,
  retryAnchor,
  retryOneTake,
  retryShotJob,
  saveEdits,
  saveScene,
  shootOneTake,
  shotCamera,
  shotCast,
  shotScene,
  stopWaiting,
  takeIsDraft,
  type Scene,
  type SceneRatio,
  type Shot,
} from "@/lib/studio/director";
import { agentInput, collectDraft, draftShots } from "@/lib/studio/agent";
import { compileImageRequest, randomSeed } from "@/lib/studio/image";
import type { Job } from "@/lib/types/jobs";
import { cn } from "@/lib/utils";

const RATIOS: { value: SceneRatio; label: string }[] = [
  { value: "16:9", label: "16:9" },
  { value: "21:9", label: "21:9" },
  { value: "9:16", label: "9:16" },
];
const DURATIONS = [4, 5, 6, 8, 10, 12, 15].map((s) => ({ value: String(s), label: `${s} s` }));
const ANCHOR_COUNTS = ["2", "3", "4"].map((n) => ({ value: n, label: `${n} stills` }));
const aspectOf = (ratio: SceneRatio) => ratio.replace(":", " / ");

export function DirectorScreen() {
  const { sceneId } = useParams();
  return sceneId ? <SceneEditor key={sceneId} sceneId={sceneId} /> : <SceneList />;
}

// ---- Scenes ----

function SceneList() {
  const navigate = useNavigate();
  const scenes = useLiveQuery(listScenes, []);
  async function create() {
    const scene = await saveScene(newScene(randomSeed()));
    navigate(`/director/${scene.id}`);
  }
  return (
    <Screen title="Director" actions={<Button onClick={() => void create()}>New scene</Button>}>
      <p className="mb-6 text-body text-ink-muted md:hidden">Director works best on a desktop screen.</p>
      {scenes && !scenes.length && (
        <Note>A scene is a short sequence of shots: set the film once, plan the shots, pick an anchor still for each, animate them, and export one stitched MP4.</Note>
      )}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
        {scenes?.map((scene) => (
          <li key={scene.id}>
            <Link to={`/director/${scene.id}`} className="grid gap-1 rounded-media border border-rule p-4 hover:bg-tint-hover">
              <span className="font-display text-panel font-extrabold">{scene.title}</span>
              {scene.logline && <span className="line-clamp-2 text-body">{scene.logline}</span>}
              <span className="text-control text-ink-muted">
                {scene.shots.length} {scene.shots.length === 1 ? "shot" : "shots"} · {scene.shots.reduce((t, s) => t + s.durationSec, 0)} s
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Screen>
  );
}

// Edits apply locally at once and save shortly after; an action (draw,
// animate, export) saves first, runs, then reloads what it wrote.
function useSceneEditor(id: string) {
  const [scene, setScene] = useState<Scene | null>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const pending = useRef<Scene | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void loadScene(id).then((s) => live && setScene(s ?? null));
    return () => {
      live = false;
    };
  }, [id]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const next = pending.current;
    pending.current = undefined;
    if (next) await saveEdits(next);
  }, []);

  useEffect(() => () => void flush(), [flush]);

  const edit = useCallback(
    (change: (s: Scene) => Scene) => {
      setScene((prev) => {
        if (!prev) return prev;
        const next = change(prev);
        pending.current = next;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), 400);
        return next;
      });
    },
    [flush],
  );

  const run = useCallback(
    async (label: string, action: () => Promise<unknown>) => {
      setBusy(label);
      setError(undefined);
      try {
        await flush();
        await action();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        await flush();
        setScene((await loadScene(id)) ?? null);
        setBusy(undefined);
      }
    },
    [flush, id],
  );

  return { scene, edit, run, error, busy };
}

type Editor = ReturnType<typeof useSceneEditor>;

function SceneEditor({ sceneId }: { sceneId: string }) {
  const editor = useSceneEditor(sceneId);
  const navigate = useNavigate();
  const { scene, edit, run, error } = editor;
  // A plan asked for before a reload is collected when the scene opens again.
  const collecting = useRef(false);
  const pendingPlan = scene?.agentRequest?.requestId;
  useEffect(() => {
    if (!pendingPlan || collecting.current) return;
    collecting.current = true;
    void run("agent", () => collectDraft(sceneId)).finally(() => (collecting.current = false));
  }, [pendingPlan, run, sceneId]);

  if (scene === undefined) return null;
  if (scene === null) {
    return (
      <Screen title="Director">
        <Note>This scene isn't on this device.</Note>
        <Link to="/director" className="mt-4 inline-block text-body underline">
          All scenes
        </Link>
      </Screen>
    );
  }

  const set = (patch: Partial<Scene>) => edit((s) => ({ ...s, ...patch }));
  const setShot = (shotId: string, patch: Partial<Shot>) => edit((s) => ({ ...s, shots: s.shots.map((shot) => (shot.id === shotId ? { ...shot, ...patch } : shot)) }));
  const move = (from: number, to: number) =>
    edit((s) => {
      if (to < 0 || to >= s.shots.length) return s;
      const shots = [...s.shots];
      const [shot] = shots.splice(from, 1);
      shots.splice(to, 0, shot!);
      return { ...s, shots };
    });
  const addShot = () => edit((s) => ({ ...s, nextShot: s.nextShot + 1, shots: [...s.shots, newShot(s, s.shots.at(-1))] }));
  const removeShot = (shotId: string) => edit((s) => ({ ...s, shots: s.shots.filter((shot) => shot.id !== shotId) }));

  const callSheet = (
    <div className="grid gap-5">
      <Link to="/director" className="inline-flex items-center gap-1 text-control font-semibold">
        <ArrowLeft className="size-4" aria-hidden /> All scenes
      </Link>
      <Field label="Title">{(id) => <Input id={id} value={scene.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} />}</Field>
      <Field label="Logline">{(id) => <TextArea id={id} value={scene.logline} rows={2} maxLength={300} placeholder="A retired harbour pilot finds a letter he never sent." onChange={(logline) => set({ logline })} />}</Field>
      <Field label="Cast" hint="Name them in a shot's action with their slot, like {lead}.">{(id) => <CastPicker id={id} value={scene.cast} onChange={(cast) => set({ cast })} />}</Field>
      <Field label="Location" hint="Added to every shot, word for word.">
        {(id) => <TextArea id={id} value={scene.location} rows={2} maxLength={300} placeholder="A late-night diner with red vinyl booths" onChange={(location) => set({ location })} />}
      </Field>
      <Field label="Film">{() => <CameraPicker groups={["genre", "body", "era", "pacing"]} value={scene.film} onChange={(film) => set({ film: { ...scene.film, ...film } })} />}</Field>
      <Field label="Frame">{() => <Segmented label="Frame" value={scene.ratio} options={RATIOS} onChange={(ratio) => set({ ratio })} />}</Field>
      <label className="flex items-center gap-3 text-body">
        <Checkbox checked={scene.sound} onCheckedChange={(v) => set({ sound: v === true })} />
        Generate sound (Seedance shots)
      </label>
      <Button
        variant="ghost"
        className="justify-self-start text-drift"
        onClick={() =>
          void run("delete", async () => {
            await deleteScene(scene.id);
            navigate("/director");
          })
        }
      >
        <Trash2 className="size-4" aria-hidden /> Delete scene
      </Button>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <section aria-label="Call sheet" className="shrink-0 overflow-auto border-rule p-6 md:w-80 md:border-r">
        <ScreenTitle className="mb-6">Director</ScreenTitle>
        {callSheet}
      </section>
      <section aria-label="Set" className="min-h-64 flex-1 overflow-auto bg-seamless p-6 text-on-seamless">
        <p className="mb-4 border-b border-rule pb-3 text-control md:hidden">Director works best on a desktop screen.</p>
        {error && (
          <p role="alert" className="mb-4 rounded-control bg-proof px-3 py-2 text-body text-drift">
            {error}
          </p>
        )}
        <div className="grid gap-6">
          {scene.shots.map((shot, i) => (
            <ShotCard key={shot.id} scene={scene} shot={shot} index={i} editor={editor} onChange={(patch) => setShot(shot.id, patch)} onMove={(to) => move(i, to)} onRemove={() => removeShot(shot.id)} />
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" className="border-on-seamless text-on-seamless" onClick={addShot}>
              Add shot
            </Button>
            <DraftWithAI scene={scene} editor={editor} />
          </div>
          {scene.shots.length > 0 && <Timeline scene={scene} editor={editor} onMove={move} />}
          {scene.shots.length > 1 && <OneTake scene={scene} editor={editor} />}
        </div>
      </section>
    </div>
  );
}

// ---- Shots ----

function ShotCard({
  scene,
  shot,
  index,
  editor,
  onChange,
  onMove,
  onRemove,
}: {
  scene: Scene;
  shot: Shot;
  index: number;
  editor: Editor;
  onChange: (patch: Partial<Shot>) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const [count, setCount] = useState("2");
  const { run, busy } = editor;
  const take = useJob(shot.takeJobId);
  const final = useJob(shot.finalJobId);
  const anchors = useAnchorJobs(shot.anchorJobIds);
  const castSlots = shotCast(scene, shot).map((c) => c.slot);
  const named = scene.cast.length ? scene.cast.map((c) => `{${c.slot}}`).join(", ") : "Add cast in the scene card";
  const aspect = aspectOf(scene.ratio);
  const ready = Boolean(shot.action.trim());
  const chained = continues(scene, shot);
  const stale = chainStale(scene, shot);
  const previous = previousShot(scene, shot);
  const chainFrame = useChainFrameUrl(chained ? previous : undefined);
  const canAnimate = chained || Boolean(shot.anchorJobId);

  const stillsPrice = useEstimateLabel(
    MODEL_IDS.nanoBanana,
    ready
      ? async () =>
          (
            await compileImageRequest({
              scene: shotScene(scene, shot),
              cast: shotCast(scene, shot),
              aspectRatio: scene.ratio,
              size: "2K",
              quality: "fast",
              count: 1,
              camera: shotCamera(scene, shot, false),
            })
          ).input
      : undefined,
    `${shot.id}:${shot.action}:${castSlots.join()}:${scene.ratio}`,
  );
  const motionModel = castSlots.length ? MODEL_IDS.minimaxH3 : MODEL_IDS.seedance;
  const motionPrice = useEstimateLabel(
    motionModel,
    canAnimate
      ? async () =>
          motionModel === MODEL_IDS.minimaxH3
            ? { stage: "generate", prompt: shot.action, firstFrame: "https://example.invalid/anchor.jpg", durationSec: shot.durationSec, resolution: "768P" }
            : { stage: "draft", prompt: shot.action, firstFrame: "https://example.invalid/anchor.jpg", durationSec: shot.durationSec, generateAudio: scene.sound }
      : undefined,
    `${shot.id}:${motionModel}:${shot.durationSec}:${scene.sound}:${canAnimate}`,
  );

  const takeDone = take?.status === "done";
  const canFinal = takeDone && takeIsDraft(take) && !shot.finalJobId;
  const failed = (job: typeof take) => (job?.status === "failed" || job?.status === "expired") && job.error?.retry !== "never";

  return (
    <article aria-label={`Shot ${index + 1}`} className="grid overflow-hidden rounded-media border border-rule bg-proof text-ink lg:grid-cols-[24rem_minmax(0,1fr)]">
      <div className="grid content-start gap-4 p-4">
        <header className="flex items-center justify-between gap-2">
          <h2 className="font-display text-panel font-extrabold">Shot {index + 1}</h2>
          <span className="flex gap-1">
            <Button variant="ghost" size="icon" aria-label="Move shot earlier" disabled={index === 0} onClick={() => onMove(index - 1)}>
              <ArrowUp className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Move shot later" disabled={index === scene.shots.length - 1} onClick={() => onMove(index + 1)}>
              <ArrowDown className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Remove shot" onClick={onRemove}>
              <Trash2 className="size-4" />
            </Button>
          </span>
        </header>
        <Field label="Action" hint={`What happens. Cast: ${named}.`}>
          {(id) => <TextArea id={id} value={shot.action} rows={3} maxLength={600} placeholder="{lead} slides the envelope across the table" onChange={(action) => onChange({ action })} />}
        </Field>
        <CameraPicker
          groups={["size", "angle", "lens", "aperture", "movement", "lighting"]}
          withLook={false}
          value={{ size: shot.size, angle: shot.angle, lens: shot.lens, aperture: shot.aperture, movement: shot.movement, lighting: shot.lighting }}
          onChange={(c) => onChange({ size: c.size ?? shot.size, angle: c.angle ?? shot.angle, lens: c.lens ?? shot.lens, aperture: c.aperture, movement: c.movement ?? "static", lighting: c.lighting })}
        />
        <Field label="Length">{(id) => <Select id={id} value={String(shot.durationSec)} options={DURATIONS} onChange={(v) => onChange({ durationSec: Number(v ?? 5) })} />}</Field>
        {index > 0 && (
          <Field label="Starts with" hint={shot.continuity === "continue" ? `Picks up from the last frame of shot ${index}, with no anchor still.` : undefined}>
            {() => (
              <Segmented
                label="Starts with"
                value={shot.continuity}
                options={[
                  { value: "cut", label: "A cut" },
                  { value: "continue", label: `Shot ${index}'s last frame` },
                ]}
                onChange={(continuity) => onChange({ continuity })}
              />
            )}
          </Field>
        )}
      </div>

      <div className="grid content-start gap-4 bg-seamless p-4 text-on-seamless lg:border-l lg:border-rule">
        {chained ? (
          <section aria-label="First frame" className="grid gap-3">
            <h3 className="text-control font-semibold">First frame</h3>
            <div className="w-44">
              <Take src={chainFrame} alt={`Last frame of shot ${index}`} aspect={aspect}>
                Shot {index}'s last frame
              </Take>
            </div>
            <p className="text-control">{chainFrame ? `The last frame of shot ${index}'s take.` : `Taken from shot ${index}'s take once it's done.`}</p>
          </section>
        ) : (
        <section aria-label="Anchor stills" className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="mr-auto text-control font-semibold">Anchor</h3>
            <span className="w-32">
              <Select value={count} label="How many stills to draw" options={ANCHOR_COUNTS} onChange={(v) => setCount(v ?? "2")} />
            </span>
            <Button size="sm" disabled={!ready || busy !== undefined} onClick={() => void run(`stills:${shot.id}`, () => drawAnchors(scene.id, shot.id, Number(count)))}>
              {shot.anchorJobIds.length ? "Draw more" : "Draw stills"} · {stillsPrice}
            </Button>
          </div>
          {anchors.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
              {anchors.map((job) => (
                <OutputTake
                  key={job.id}
                  job={job}
                  alt={`Shot ${index + 1} still`}
                  aspect={aspect}
                  picked={shot.anchorJobId === job.id}
                  onPick={() => void run(`pick:${shot.id}`, () => pickAnchor(scene.id, shot.id, job.id))}
                  label={job.parentJobId ? "Retry" : undefined}
                  actions={
                    failed(job) ? (
                      <Button size="sm" variant="secondary" className="justify-self-start" onClick={() => void run(`retry:${job.id}`, () => retryAnchor(job.id))}>
                        Retry
                      </Button>
                    ) : undefined
                  }
                />
              ))}
            </div>
          ) : (
            <p className="text-control">{ready ? "Draw stills, then pick the one to animate." : "Describe the action first."}</p>
          )}
        </section>
        )}

        <section aria-label="Motion" className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="mr-auto text-control font-semibold">Motion</h3>
            {shot.waiting && chained ? (
              <Button size="sm" variant="secondary" disabled={busy !== undefined} onClick={() => void run(`wait:${shot.id}`, () => stopWaiting(scene.id, shot.id))}>
                Stop waiting
              </Button>
            ) : !shot.takeJobId ? (
              <Button size="sm" disabled={!canAnimate || !ready || busy !== undefined} onClick={() => void run(`animate:${shot.id}`, () => animateShot(scene.id, shot.id))}>
                Animate · {motionPrice}
              </Button>
            ) : (
              <>
                <Button size="sm" variant={stale ? "primary" : "secondary"} disabled={busy !== undefined || !canAnimate} onClick={() => void run(`animate:${shot.id}`, () => animateShot(scene.id, shot.id, true))}>
                  Re-roll · {motionPrice}
                </Button>
                {canFinal && (
                  <Button size="sm" disabled={busy !== undefined} onClick={() => void run(`final:${shot.id}`, () => finalizeShot(scene.id, shot.id))}>
                    Render final 1080p
                  </Button>
                )}
              </>
            )}
          </div>
          {!chained && !shot.anchorJobId && shot.anchorJobIds.length > 0 && <p className="text-control">Pick an anchor still to animate.</p>}
          {chained && shot.waiting && <p className="text-control">Starts as soon as shot {index}'s take is done.</p>}
          {stale && <p className="text-control">Shot {index} has a different take now, so this one no longer starts where it ends. Re-roll to match.</p>}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
            {take && (
              <OutputTake
                job={take}
                alt={`Shot ${index + 1} take`}
                aspect={aspect}
                label={takeIsDraft(take) ? "Draft, 480p" : take.modelId === MODEL_IDS.minimaxH3 ? "MiniMax H3, 768P" : (registryEntry(take.modelId)?.label ?? "Take")}
                actions={
                  failed(take) ? (
                    <Button size="sm" variant="secondary" className="justify-self-start" onClick={() => void run(`retry:${shot.id}`, () => retryShotJob(scene.id, shot.id, "take"))}>
                      Retry
                    </Button>
                  ) : undefined
                }
              />
            )}
            {final && (
              <OutputTake
                job={final}
                alt={`Shot ${index + 1} final`}
                aspect={aspect}
                label="Final, 1080p"
                actions={
                  failed(final) ? (
                    <Button size="sm" variant="secondary" className="justify-self-start" onClick={() => void run(`retry:${shot.id}`, () => retryShotJob(scene.id, shot.id, "final"))}>
                      Retry
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>
        </section>
      </div>
    </article>
  );
}

// A shot's stills, with retries (automatic drift retries and manual ones)
// beside them; a failed still that was retried steps aside.
function useAnchorJobs(ids: string[]) {
  const roots = useJobs(ids);
  const retries = useLiveQuery(() => (ids.length ? db.jobs.where("parentJobId").anyOf(ids).toArray() : []), [ids.join(",")]) ?? [];
  const retried = new Set(retries.map((j) => j.parentJobId));
  const shown = (roots ?? []).filter((j): j is Job => j !== undefined && !(j.status === "failed" && retried.has(j.id)));
  return [...shown, ...retries];
}

// The frame a continued shot starts from: the previous shot's saved last
// frame. Seedance returns one; for an H3 take it's taken when the shot is animated.
function useChainFrameUrl(previous: Shot | undefined): string | undefined {
  const blob = useLiveQuery(async () => {
    if (!previous) return undefined;
    const [take, final] = await db.jobs.bulkGet([previous.takeJobId ?? "", previous.finalJobId ?? ""]);
    const job = final?.status === "done" ? final : take?.status === "done" ? take : undefined;
    const generation = job ? await db.generations.get(job.generationIds[0] ?? "") : undefined;
    const frame = generation?.assets.find((a) => a.kind === "frame");
    return frame ? (await db.blobs.get(frame.blobId))?.blob : undefined;
  }, [previous?.takeJobId, previous?.finalJobId]);
  return useObjectUrl(blob);
}

// ---- Timeline and export ----

function Timeline({ scene, editor, onMove }: { scene: Scene; editor: Editor; onMove: (from: number, to: number) => void }) {
  const [crossfade, setCrossfade] = useState(true);
  const [progress, setProgress] = useState<number>();
  const dragFrom = useRef<number | undefined>(undefined);
  const jobs = useJobs(scene.shots.map((s) => exportJobId(s) ?? ""));
  const readyCount = (jobs ?? []).filter((j) => j?.status === "done").length;
  const allReady = readyCount === scene.shots.length;
  const total = scene.shots.reduce((t, s) => t + s.durationSec, 0);
  const { run, busy } = editor;

  return (
    <section aria-label="Timeline" className="grid gap-4 border-t border-rule pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-panel font-extrabold">Timeline</h2>
        <span className="text-control">
          {scene.shots.length} shots · about {total} s · {readyCount} of {scene.shots.length} ready
        </span>
      </div>
      <ol className="flex gap-2 overflow-x-auto pb-2" aria-label="Shots in order. Drag to reorder, or use the arrows on each shot.">
        {scene.shots.map((shot, i) => (
          <li
            key={shot.id}
            draggable
            onDragStart={() => (dragFrom.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom.current !== undefined && dragFrom.current !== i) onMove(dragFrom.current, i);
              dragFrom.current = undefined;
            }}
            className="w-40 shrink-0 cursor-grab"
          >
            <StripFrame shot={shot} index={i} chained={continues(scene, shot)} aspect={aspectOf(scene.ratio)} />
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-3 text-body">
          <Checkbox checked={crossfade} onCheckedChange={(v) => setCrossfade(v === true)} className="border-on-seamless" />
          6-frame crossfades
        </label>
        <Button
          disabled={!allReady || busy !== undefined}
          onClick={() =>
            void run("export", async () => {
              setProgress(0);
              try {
                await exportScene(scene.id, crossfade, setProgress);
              } finally {
                setProgress(undefined);
              }
            })
          }
        >
          {progress !== undefined ? `Joining ${Math.round(progress * 100)}%` : "Export scene"}
        </Button>
        {!allReady && <span className="text-control">Every shot needs a finished take first.</span>}
      </div>
      {scene.exportGenerationIds.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-4">
          {scene.exportGenerationIds.map((id) => (
            <ExportTake key={id} generationId={id} title={scene.title} aspect={aspectOf(scene.ratio)} />
          ))}
        </div>
      )}
    </section>
  );
}

// "Draft with AI" (spec: Director, Workflow step 2): Claude drafts 3 to 6
// shots from the scene card, added after any already there.
function DraftWithAI({ scene, editor }: { scene: Scene; editor: Editor }) {
  const { run, busy } = editor;
  const ready = Boolean(scene.logline.trim());
  const key = JSON.stringify([scene.logline, scene.location, scene.cast, scene.film, scene.ratio, scene.shots.map((s) => s.action)]);
  const price = useEstimateLabel(MODEL_IDS.directorAgent, ready ? () => agentInput(scene.id) : undefined, key);
  const drafting = busy === "agent" || Boolean(scene.agentRequest);
  return (
    <>
      <Button variant="secondary" className="border-on-seamless text-on-seamless" disabled={!ready || busy !== undefined || drafting} onClick={() => void run("agent", () => draftShots(scene.id))}>
        {drafting ? "Drafting shots" : `Draft shots with AI · ${price}`}
      </Button>
      <span className="text-control">{ready ? "Claude Sonnet 5.5 plans 3 to 6 shots from the scene card. Edit them after." : "Write a logline to draft shots with AI."}</span>
    </>
  );
}

// Kling shoots every shot as one clip (spec: One-take multi-shot).
function OneTake({ scene, editor }: { scene: Scene; editor: Editor }) {
  const { run, busy } = editor;
  const problem = oneTakeProblem(scene);
  const planned = scene.shots.reduce((t, s) => t + s.durationSec, 0);
  const length = oneTakeDurations(scene.shots.map((s) => s.durationSec)).reduce((t, d) => t + d, 0);
  const key = JSON.stringify([scene.shots.map((s) => [s.action, s.durationSec, s.size, s.angle, s.lens, s.movement, s.lighting]), scene.cast, scene.location, scene.film, scene.ratio, scene.sound]);
  const price = useEstimateLabel(MODEL_IDS.klingOmni, problem ? undefined : async () => (await oneTakeInput(scene)).input, key);
  const jobs = (useJobs(scene.oneTakeJobIds ?? []) ?? []).filter((j): j is Job => j !== undefined);
  const aspect = scene.ratio === "9:16" ? "9 / 16" : "16 / 9";
  return (
    <section aria-label="One take" className="grid gap-4 border-t border-rule pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-panel font-extrabold">One take</h2>
        <span className="text-control">Kling V3 Omni · 720p · {length} s</span>
      </div>
      <p className="max-w-prose text-body">
        Every shot in one clip, with Kling making the cuts. A quick first pass at the whole scene before you refine it shot by shot.
        {planned > ONE_TAKE_MAX_SEC ? ` The shots add up to ${planned} s, so they're shortened to fit Kling's ${ONE_TAKE_MAX_SEC} s.` : ""}
        {scene.ratio === "21:9" ? " Kling has no 21:9, so it shoots 16:9." : ""}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Button disabled={problem !== undefined || busy !== undefined} onClick={() => void run("one-take", () => shootOneTake(scene.id))}>
          Shoot as one take · {price}
        </Button>
        {problem && <span className="text-control">{problem}</span>}
      </div>
      {jobs.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-4">
          {jobs.map((job) => (
            <OutputTake
              key={job.id}
              job={job}
              alt={`${scene.title}, one take`}
              aspect={aspect}
              label="One take, 720p"
              actions={
                (job.status === "failed" || job.status === "expired") && job.error?.retry !== "never" ? (
                  <Button size="sm" variant="secondary" className="justify-self-start" disabled={busy !== undefined} onClick={() => void run(`retry:${job.id}`, () => retryOneTake(scene.id, job.id))}>
                    Retry
                  </Button>
                ) : undefined
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

function StripFrame({ shot, index, chained, aspect }: { shot: Shot; index: number; chained: boolean; aspect: string }) {
  const anchor = useJobImageUrl(shot.anchorJobId);
  const job = useJob(exportJobId(shot));
  const take = useJob(shot.takeJobId);
  // A continued shot's still is the frame its take started from.
  const startFrame = useBlobUrl((take?.input as { request?: { sourceBlobId?: string } } | undefined)?.request?.sourceBlobId);
  const still = chained ? startFrame : anchor;
  const status = !job
    ? chained
      ? shot.waiting
        ? "Waiting"
        : "Not animated"
      : !shot.anchorJobId
        ? "No anchor"
        : "Not animated"
    : job.status === "done"
      ? shot.finalJobId
        ? "Final"
        : takeIsDraft(job)
          ? "Draft"
          : "Ready"
      : "Working";
  return (
    <figure className="grid gap-1">
      <Take src={still} alt={`Shot ${index + 1}`} aspect={aspect}>
        {index + 1}
      </Take>
      <figcaption className="text-control">
        <span className="font-semibold">{index + 1}</span> · {shot.durationSec} s · <span className={cn(job?.status === "done" && "font-semibold")}>{status}</span>
      </figcaption>
    </figure>
  );
}

function ExportTake({ generationId, title, aspect }: { generationId: string; title: string; aspect: string }): ReactNode {
  const generation = useGeneration(generationId);
  const asset = generation?.assets.find((a) => a.kind === "video");
  const url = useBlobUrl(asset?.blobId);
  if (!generation) return null;
  return (
    <figure className="grid gap-2">
      <span className="relative block overflow-hidden rounded-media border border-rule" style={{ aspectRatio: aspect }}>
        {url && <video src={url} controls playsInline className="develop absolute inset-0 size-full object-contain" aria-label={`${title}, exported`} />}
      </span>
      <figcaption className="flex flex-wrap items-center gap-3 text-control">
        <span>{new Date(generation.createdAt).toLocaleString()}</span>
        {url && (
          <a href={url} download={`${title.replace(/[^\w -]+/g, "").trim() || "scene"}.mp4`} className="font-semibold underline">
            Download
          </a>
        )}
        <Link to={`/library/${generation.id}`} className="underline">
          In the library
        </Link>
      </figcaption>
    </figure>
  );
}
