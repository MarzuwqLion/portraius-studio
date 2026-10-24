import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, Trash2 } from "lucide-react";
import { Note, Screen, ScreenTitle } from "@/components/shell/Screen";
import { CameraPicker } from "@/components/studio/CameraPicker";
import { CastPicker } from "@/components/studio/CastPicker";
import { PromptEditor, PromptText, slotChips } from "@/components/studio/PromptEditor";
import { Field, Segmented, Select, TextArea } from "@/components/studio/fields";
import { OutputTake } from "@/components/studio/OutputTake";
import { SocialExport } from "@/components/studio/SocialExport";
import { SpeakAction } from "@/components/studio/Speak";
import { Take } from "@/components/studio/Take";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useEstimateLabel, useJob, useJobImageUrl, useJobs } from "@/lib/jobs/hooks";
import { withPrice } from "@/lib/jobs/estimate";
import { routerListed } from "@/lib/registry/availability";
import { MODEL_IDS, isLocalModel, registryEntry } from "@/lib/registry/models";
import { reachOf, useEngineStore, useFeatureModels } from "@/lib/session/engine";
import { useKeyStore } from "@/lib/session/key";
import { VIDEO_MODELS, type VideoModel } from "@/lib/studio/video";
import { ModelPicker } from "@/components/studio/ModelPicker";
import { db } from "@/lib/store/db";
import { useBlobUrl, useCharacters, useCharacterThumbs, useGeneration, useObjectUrl } from "@/lib/store/hooks";
import {
  animateShot,
  chainStale,
  continues,
  deleteScene,
  drawAnchors,
  exportJobId,
  exportLabel,
  lineSourceJobId,
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
  setShotLine,
  saveEdits,
  saveScene,
  shootOneTake,
  shotCamera,
  shotCast,
  shotScene,
  shotSummary,
  stopWaiting,
  takeIsDraft,
  type Scene,
  type SceneRatio,
  type Shot,
} from "@/lib/studio/director";
import { agentInput, collectDraft, draftShots } from "@/lib/studio/agent";
import { loadTour, samplePoster, tryWithWalt } from "@/lib/tour/tour";
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
// Secondary buttons in the set sit on Studio grey, so they take its text colour.
const ON_SEAMLESS = "border-on-seamless text-on-seamless";

export function DirectorScreen() {
  const { sceneId } = useParams();
  return sceneId ? <SceneEditor key={sceneId} sceneId={sceneId} /> : <SceneList />;
}

// ---- Scenes ----

function SceneList() {
  const navigate = useNavigate();
  const scenes = useLiveQuery(listScenes, []);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  async function create() {
    const scene = await saveScene(newScene(randomSeed()));
    navigate(`/director/${scene.id}`);
  }
  // The Letter from the Tour, the same way its "Try this with Walt" makes it.
  async function startSample() {
    setStarting(true);
    setError(undefined);
    try {
      navigate((await tryWithWalt(await loadTour(), "director")).to);
    } catch (err) {
      setError((err as Error).message);
      setStarting(false);
    }
  }
  const empty = scenes !== undefined && !scenes.length;
  return (
    <Screen
      title="Director"
      actions={
        <div className="flex flex-wrap gap-3">
          {empty && (
            <Button variant="secondary" disabled={starting} onClick={() => void startSample()}>
              Start from the sample scene
            </Button>
          )}
          <Button onClick={() => void create()}>New scene</Button>
        </div>
      }
    >
      <p className="mb-6 text-body text-ink-muted md:hidden">Director works best on a desktop screen.</p>
      {empty && (
        <Note>A scene is a short sequence of shots: set the film once, plan the shots, pick an anchor still for each, animate them, and export one stitched MP4.</Note>
      )}
      {error && (
        <p role="alert" className="mt-4 text-body text-drift">
          {error}
        </p>
      )}
      <ul className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
        {empty && (
          <li>
            <SampleSceneCard disabled={starting} onStart={() => void startSample()} />
          </li>
        )}
        {scenes?.map((scene) => (
          <li key={scene.id}>
            <SceneCard scene={scene} />
          </li>
        ))}
      </ul>
    </Screen>
  );
}

// The sample scene as a card, with the Tour's first anchor as its cover: the
// opening frame of The Letter, which shot 1 animates from.
function SampleSceneCard({ disabled, onStart }: { disabled: boolean; onStart: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onStart} className="grid w-full overflow-hidden rounded-media border border-rule text-left hover:bg-tint-hover">
      <span className="relative block aspect-video bg-seamless">
        <img src={samplePoster("the-letter.mp4")} alt="" className="size-full object-cover" />
      </span>
      <span className="grid gap-1 p-4">
        <span className="font-display text-panel font-extrabold">The Letter</span>
        <span className="line-clamp-2 text-body">A retired harbour pilot finds a letter he never sent.</span>
        <span className="text-control text-ink-muted">{disabled ? "Adding Walt Harmon" : "Sample scene · 3 shots · 15 s · with Walt Harmon"}</span>
      </span>
    </button>
  );
}

// A scene's card (spec: Decisions, October 21, item 13): its first anchor as
// the cover, and how many shots have a finished take.
function SceneCard({ scene }: { scene: Scene }) {
  const cover = useJobImageUrl(scene.shots.find((s) => s.anchorJobId)?.anchorJobId);
  const jobs = useJobs(scene.shots.map((s) => exportJobId(s) ?? ""));
  const ready = (jobs ?? []).filter((j) => j?.status === "done").length;
  const total = scene.shots.reduce((t, s) => t + s.durationSec, 0);
  return (
    <Link to={`/director/${scene.id}`} className="grid overflow-hidden rounded-media border border-rule hover:bg-tint-hover">
      <span className="relative block aspect-video bg-seamless">
        {cover ? (
          <img src={cover} alt="" className="develop size-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-control text-on-seamless">No anchor yet</span>
        )}
      </span>
      <span className="grid gap-1 p-4">
        <span className="font-display text-panel font-extrabold">{scene.title}</span>
        {scene.logline && <span className="line-clamp-2 text-body">{scene.logline}</span>}
        <span className="text-control text-ink-muted">
          {scene.shots.length} {scene.shots.length === 1 ? "shot" : "shots"} · {total} s
          {scene.shots.length > 0 && (
            <>
              {" · "}
              <span className={cn(ready === scene.shots.length && "font-semibold text-ink")}>
                {ready} of {scene.shots.length} ready
              </span>
            </>
          )}
        </span>
      </span>
    </Link>
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
  // Only one shot shows its whole form; the rest fold to a row. "last"
  // follows a shot just added.
  const [openId, setOpenId] = useState<string>();
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
  const addShot = () => {
    edit((s) => ({ ...s, nextShot: s.nextShot + 1, shots: [...s.shots, newShot(s, s.shots.at(-1))] }));
    setOpenId("last");
  };
  const openShot = openId === "last" ? scene.shots.at(-1) : (scene.shots.find((s) => s.id === openId) ?? scene.shots[0]);
  const removeShot = (shotId: string) => edit((s) => ({ ...s, shots: s.shots.filter((shot) => shot.id !== shotId) }));

  const callSheet = (
    <div className="grid gap-5">
      <Link to="/director" className="inline-flex items-center gap-1 text-control font-semibold">
        <ArrowLeft className="size-4" aria-hidden /> All scenes
      </Link>
      <Field label="Title">{(id) => <Input id={id} value={scene.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} />}</Field>
      <div className="grid gap-2">
        <Field label="Logline">{(id) => <TextArea id={id} value={scene.logline} rows={2} maxLength={300} placeholder="A retired harbour pilot finds a letter he never sent." onChange={(logline) => set({ logline })} />}</Field>
        <DraftWithAI scene={scene} editor={editor} />
      </div>
      <Field label="Cast" hint="Then type @ in a shot's action to put them in it.">{(id) => <CastPicker id={id} value={scene.cast} onChange={(cast) => set({ cast })} />}</Field>
      <Field label="Location" hint="Added to every shot, word for word.">
        {(id) => <TextArea id={id} value={scene.location} rows={2} maxLength={300} placeholder="A late-night diner with red vinyl booths" onChange={(location) => set({ location })} />}
      </Field>
      <Field label="Film">{() => <CameraPicker groups={["genre", "body", "era", "pacing"]} value={scene.film} onChange={(film) => set({ film: { ...scene.film, ...film } })} />}</Field>
      <Field label="Frame">{() => <Segmented label="Frame" value={scene.ratio} options={RATIOS} onChange={(ratio) => set({ ratio })} />}</Field>
      <label className="flex items-center gap-3 text-body">
        <Checkbox checked={scene.sound} onCheckedChange={(v) => set({ sound: v === true })} />
        Generate sound (Seedance shots)
      </label>
      <ModelPicker feature="image" label="Stills drawn with" />
      <ModelPicker feature="video" label="Shots animated with" />
      <ModelPicker feature="plan" label="Shots drafted with" />
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
      <section aria-label="Call sheet" data-scroll-top className="shrink-0 overflow-auto border-rule p-6 md:w-80 md:border-r xl:w-96">
        <ScreenTitle className="mb-6">Director</ScreenTitle>
        {callSheet}
      </section>
      {/* The set scrolls; the timeline stays pinned under it (spec: Decisions, October 21, item 13). */}
      <section aria-label="Set" className="flex min-h-64 min-w-0 flex-1 flex-col bg-seamless text-on-seamless">
        <div className="min-h-0 flex-1 overflow-auto p-6">
          <p className="mb-4 border-b border-rule pb-3 text-control md:hidden">Director works best on a desktop screen.</p>
          {error && (
            // Sticky, so a failure from Export or One take shows wherever the set is scrolled.
            <p role="alert" className="sticky top-0 z-10 mb-4 rounded-control bg-proof px-3 py-2 text-body text-drift">
              {error}
            </p>
          )}
          <div className="grid gap-3">
            {scene.shots.map((shot, i) => (
              <ShotCard
                key={shot.id}
                scene={scene}
                shot={shot}
                index={i}
                editor={editor}
                open={shot.id === openShot?.id}
                onOpen={() => setOpenId(shot.id)}
                onChange={(patch) => setShot(shot.id, patch)}
                onMove={(to) => move(i, to)}
                onRemove={() => removeShot(shot.id)}
              />
            ))}
            <div className="flex flex-wrap items-center gap-3 pt-3">
              <Button variant="secondary" className="border-on-seamless text-on-seamless" onClick={addShot}>
                Add shot
              </Button>
            </div>
            <Exports scene={scene} />
            {scene.shots.length > 1 && <OneTake scene={scene} editor={editor} />}
          </div>
        </div>
        {scene.shots.length > 0 && <Timeline scene={scene} editor={editor} onMove={move} openId={openShot?.id} onOpen={setOpenId} />}
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
  open,
  onOpen,
  onChange,
  onMove,
  onRemove,
}: {
  scene: Scene;
  shot: Shot;
  index: number;
  editor: Editor;
  open: boolean;
  onOpen: () => void;
  onChange: (patch: Partial<Shot>) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  if (!open) return <CollapsedShot scene={scene} shot={shot} index={index} onOpen={onOpen} onMove={onMove} onRemove={onRemove} />;
  return <OpenShot scene={scene} shot={shot} index={index} editor={editor} onChange={onChange} onMove={onMove} onRemove={onRemove} />;
}

// A shot that isn't being edited, in one row (spec: Decisions, October 21,
// item 13): its anchor, the first line of its action and its camera.
function CollapsedShot({ scene, shot, index, onOpen, onMove, onRemove }: { scene: Scene; shot: Shot; index: number; onOpen: () => void; onMove: (to: number) => void; onRemove: () => void }) {
  const chained = continues(scene, shot);
  const anchor = useJobImageUrl(shot.anchorJobId);
  const chainFrame = useChainFrameUrl(chained ? previousShot(scene, shot) : undefined);
  const still = chained ? chainFrame : anchor;
  const job = useJob(exportJobId(shot));
  const characters = useCharacters();
  const thumbs = useCharacterThumbs();
  const { names, faces } = slotChips(Object.fromEntries(scene.cast.map((c) => [c.slot, c.characterId])), characters, thumbs);
  const firstLine = shot.action.split("\n")[0]?.trim();
  return (
    <article aria-label={`Shot ${index + 1}`} className="flex items-center gap-2 rounded-media border border-rule bg-proof p-2 text-ink">
      <button type="button" aria-expanded={false} onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 rounded-control p-1 text-left hover:bg-tint-hover">
        <span className="relative w-28 shrink-0 overflow-hidden rounded-media border border-rule bg-seamless" style={{ aspectRatio: aspectOf(scene.ratio) }}>
          {still ? (
            <img src={still} alt="" className="size-full object-cover" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center font-display text-panel font-extrabold text-on-seamless">{index + 1}</span>
          )}
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span className="flex items-baseline gap-2">
            <span className="font-display text-panel font-extrabold">Shot {index + 1}</span>
            <span className="text-control text-ink-muted">{shotStatus(shot, job, chained)}</span>
          </span>
          <span className="truncate text-body">{firstLine ? <PromptText text={firstLine} names={names} faces={faces} /> : <span className="text-ink-muted">No action yet</span>}</span>
          <span className="text-control text-ink-muted">{shotSummary(shot)}</span>
        </span>
      </button>
      <span className="flex shrink-0 gap-1">
        <Button variant="ghost" size="icon" aria-label={`Move shot ${index + 1} earlier`} disabled={index === 0} onClick={() => onMove(index - 1)}>
          <ArrowUp className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label={`Move shot ${index + 1} later`} disabled={index === scene.shots.length - 1} onClick={() => onMove(index + 1)}>
          <ArrowDown className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label={`Remove shot ${index + 1}`} onClick={onRemove}>
          <Trash2 className="size-4" />
        </Button>
      </span>
    </article>
  );
}

function OpenShot({
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
  const [cameraOpen, setCameraOpen] = useState(false);
  const { run, busy } = editor;
  const take = useJob(shot.takeJobId);
  const final = useJob(shot.finalJobId);
  const lineSource = useJob(lineSourceJobId(shot, final));
  const lipSync = useJob(shot.lipSyncJobId);
  const lineGenerationId = lineSource?.status === "done" ? lineSource.generationIds[0] : undefined;
  const anchors = useAnchorJobs(shot.anchorJobIds);
  const castSlots = shotCast(scene, shot).map((c) => c.slot);
  const aspect = aspectOf(scene.ratio);
  const ready = Boolean(shot.action.trim());
  const chained = continues(scene, shot);
  const stale = chainStale(scene, shot);
  const previous = previousShot(scene, shot);
  const chainFrame = useChainFrameUrl(chained ? previous : undefined);
  const canAnimate = chained || Boolean(shot.anchorJobId);

  const stills = useFeatureModels("image");
  const motion = useFeatureModels("video");
  const stillsPrice = useEstimateLabel(
    stills.modelId,
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
              modelId: stills.modelId,
            })
          ).input
      : undefined,
    `${stills.modelId}:${shot.id}:${shot.action}:${castSlots.join()}:${scene.ratio}`,
  );
  // On Comfy, a shot with people renders on H3 (Seedance refuses them); on the
  // visitor's GPU it stays on the Wan model picked.
  const motionModel = isLocalModel(motion.modelId) ? motion.modelId : castSlots.length ? MODEL_IDS.minimaxH3 : MODEL_IDS.seedance;
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
        <Field label="Action" hint="What happens. Type @ for someone from your vault; they join the scene's cast.">
          {(id) => (
            <PromptEditor
              id={id}
              value={shot.action}
              onChange={(action) => onChange({ action })}
              cast={scene.cast}
              onAddCast={(pick) => editor.edit((s) => ({ ...s, cast: [...s.cast, pick] }))}
              rows={3}
              maxLength={600}
              placeholder="Type @ to add someone, then what happens: slides the envelope across the table"
            />
          )}
        </Field>
        {/* The camera folds to its summary and opens on click. */}
        <div className="grid gap-3">
          <button
            type="button"
            aria-expanded={cameraOpen}
            onClick={() => setCameraOpen(!cameraOpen)}
            className="flex items-center justify-between gap-2 rounded-control border border-rule px-3 py-2 text-left hover:bg-tint-hover"
          >
            <span className="grid">
              <span className="text-control font-semibold">Camera</span>
              <span className="text-control text-ink-muted">{shotSummary(shot, { length: false })}</span>
            </span>
            <ChevronDown aria-hidden className={cn("size-4 shrink-0", cameraOpen && "rotate-180")} />
          </button>
          {cameraOpen && (
            <CameraPicker
              groups={["size", "angle", "lens", "aperture", "movement", "lighting"]}
              withLook={false}
              value={{ size: shot.size, angle: shot.angle, lens: shot.lens, aperture: shot.aperture, movement: shot.movement, lighting: shot.lighting }}
              onChange={(c) => onChange({ size: c.size ?? shot.size, angle: c.angle ?? shot.angle, lens: c.lens ?? shot.lens, aperture: c.aperture, movement: c.movement ?? "static", lighting: c.lighting })}
            />
          )}
        </div>
        <Field label="Length" hint={lengthHint(shot.durationSec, motion.modelId)}>
          {(id) => <Select id={id} value={String(shot.durationSec)} options={DURATIONS} onChange={(v) => onChange({ durationSec: Number(v ?? 5) })} />}
        </Field>
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
            <Button size="sm" disabled={!ready || busy !== undefined} onClick={() => void run(`stills:${shot.id}`, () => drawAnchors(scene.id, shot.id, Number(count), stills.modelId))}>
              {withPrice(shot.anchorJobIds.length ? "Draw more" : "Draw stills", stillsPrice)}
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
                      <Button size="sm" variant="secondary" className={`justify-self-start ${ON_SEAMLESS}`} onClick={() => void run(`retry:${job.id}`, () => retryAnchor(job.id))}>
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
              <Button size="sm" variant="secondary" className={ON_SEAMLESS} disabled={busy !== undefined} onClick={() => void run(`wait:${shot.id}`, () => stopWaiting(scene.id, shot.id))}>
                Stop waiting
              </Button>
            ) : !shot.takeJobId ? (
              <Button size="sm" disabled={!canAnimate || !ready || busy !== undefined} onClick={() => void run(`animate:${shot.id}`, () => animateShot(scene.id, shot.id, false, motion.modelId as VideoModel))}>
                {withPrice("Animate", motionPrice)}
              </Button>
            ) : (
              <>
                <Button size="sm" variant={stale ? "primary" : "secondary"} className={stale ? undefined : ON_SEAMLESS} disabled={busy !== undefined || !canAnimate} onClick={() => void run(`animate:${shot.id}`, () => animateShot(scene.id, shot.id, true, motion.modelId as VideoModel))}>
                  {withPrice("Re-roll", motionPrice)}
                </Button>
                {canFinal && (
                  <Button size="sm" disabled={busy !== undefined} onClick={() => void run(`final:${shot.id}`, () => finalizeShot(scene.id, shot.id))}>
                    {take && isLocalModel(take.modelId) ? "Render final on Wan 14B" : "Render final 1080p"}
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
                label={
                  isLocalModel(take.modelId) ? `${registryEntry(take.modelId)?.label ?? "Take"} · your GPU`
                  : takeIsDraft(take) ? "Draft, 480p"
                  : take.modelId === MODEL_IDS.minimaxH3 ? "MiniMax H3, 768p"
                  : (registryEntry(take.modelId)?.label ?? "Take")
                }
                actions={
                  failed(take) ? (
                    <Button size="sm" variant="secondary" className={`justify-self-start ${ON_SEAMLESS}`} onClick={() => void run(`retry:${shot.id}`, () => retryShotJob(scene.id, shot.id, "take"))}>
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
                label={isLocalModel(final.modelId) ? `${LOCAL_FINAL} · may differ from the take` : "Final, 1080p"}
                actions={
                  failed(final) ? (
                    <Button size="sm" variant="secondary" className={`justify-self-start ${ON_SEAMLESS}`} onClick={() => void run(`retry:${shot.id}`, () => retryShotJob(scene.id, shot.id, "final"))}>
                      Retry
                    </Button>
                  ) : undefined
                }
              />
            )}
            {lipSync && (
              <OutputTake
                job={lipSync}
                alt={`Shot ${index + 1} with its line`}
                aspect={aspect}
                label="With the line"
                actions={
                  <span className="flex flex-wrap gap-2">
                    {failed(lipSync) && (
                      <Button size="sm" variant="secondary" className={ON_SEAMLESS} onClick={() => void run(`retry:${shot.id}`, () => retryShotJob(scene.id, shot.id, "line"))}>
                        Retry
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" className={ON_SEAMLESS} disabled={busy !== undefined} onClick={() => void run(`line:${shot.id}`, () => setShotLine(scene.id, shot.id, undefined))}>
                      Drop the line
                    </Button>
                  </span>
                }
              />
            )}
          </div>
          {lineGenerationId && castSlots.length > 0 && (
            <details className="rounded-control bg-proof p-3 text-ink">
              <summary className="cursor-pointer text-control font-semibold">{shot.lipSyncJobId ? "Change the line" : "Speak a line"}</summary>
              <SpeakAction
                generationId={lineGenerationId}
                allowNewClip={false}
                heading={false}
                className="pt-3"
                onStarted={(job) => void run(`line:${shot.id}`, () => setShotLine(scene.id, shot.id, job.id))}
              />
            </details>
          )}
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

// Pinned under the set: the shots in order, how many are ready, and Export.
function Timeline({
  scene,
  editor,
  onMove,
  openId,
  onOpen,
}: {
  scene: Scene;
  editor: Editor;
  onMove: (from: number, to: number) => void;
  openId: string | undefined;
  onOpen: (shotId: string) => void;
}) {
  const [crossfade, setCrossfade] = useState(true);
  const [progress, setProgress] = useState<number>();
  const dragFrom = useRef<number | undefined>(undefined);
  const jobs = useJobs(scene.shots.map((s) => exportJobId(s) ?? ""));
  const readyCount = (jobs ?? []).filter((j) => j?.status === "done").length;
  const allReady = readyCount === scene.shots.length;
  const total = scene.shots.reduce((t, s) => t + s.durationSec, 0);
  const { run, busy } = editor;

  return (
    <section aria-label="Timeline" className="grid shrink-0 gap-2 border-t border-rule px-6 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="font-display text-panel font-extrabold">Timeline</h2>
        <span className="text-control">
          {scene.shots.length} shots · about {total} s · {readyCount} of {scene.shots.length} ready
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-4">
          {!allReady && <span className="text-control">Every shot needs a finished take first.</span>}
          <label className="flex items-center gap-2 text-control">
            <Checkbox checked={crossfade} onCheckedChange={(v) => setCrossfade(v === true)} className="border-on-seamless" />
            6-frame crossfades
          </label>
          <Button
            size="sm"
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
        </span>
      </div>
      <ol className="flex gap-2 overflow-x-auto pb-1" aria-label="Shots in order. Drag to reorder, or use the arrows on each shot.">
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
            className="w-28 shrink-0 cursor-grab"
          >
            <button type="button" aria-current={shot.id === openId ? "true" : undefined} onClick={() => onOpen(shot.id)} className="block w-full rounded-media text-left">
              <StripFrame shot={shot} index={i} chained={continues(scene, shot)} aspect={aspectOf(scene.ratio)} open={shot.id === openId} />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

// An export ends on a large player (spec: Decisions, October 21, item 13),
// named like "Export 2 · 14 s · crossfades", with what to do next. Earlier
// exports sit in a short list under it. A new export scrolls into view.
function Exports({ scene }: { scene: Scene }) {
  const [latest, ...earlier] = scene.exportGenerationIds;
  const box = useRef<HTMLElement>(null);
  const seen = useRef(latest);
  useEffect(() => {
    if (latest && latest !== seen.current) box.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    seen.current = latest;
  }, [latest]);
  if (!latest) return null;
  return (
    <section ref={box} aria-label="Export" className="grid scroll-mt-6 gap-4 border-t border-rule pt-6">
      <ExportPlayer scene={scene} generationId={latest} />
      {earlier.length > 0 && (
        <details className="grid gap-2">
          <summary className="cursor-pointer text-control font-semibold">Earlier exports ({earlier.length})</summary>
          <ul className="grid gap-1 pt-2">
            {earlier.map((id) => (
              <li key={id}>
                <ExportLink scene={scene} generationId={id} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

const exportFileName = (title: string) => `${title.replace(/[^\w -]+/g, "").trim() || "scene"}.mp4`;

// "Draft shots with AI" (spec: Director, Workflow step 2), beside the
// logline it works from: Claude drafts 3 to 6 shots from the scene card,
// added after any already there, and the note says so.
function DraftWithAI({ scene, editor }: { scene: Scene; editor: Editor }) {
  const { run, busy } = editor;
  const ready = Boolean(scene.logline.trim());
  const key = JSON.stringify([scene.logline, scene.location, scene.cast, scene.film, scene.ratio, scene.shots.map((s) => s.action)]);
  const plan = useFeatureModels("plan");
  const price = useEstimateLabel(plan.modelId, ready ? () => agentInput(scene.id, plan.modelId) : undefined, `${plan.modelId}:${key}`);
  const drafting = busy === "agent" || Boolean(scene.agentRequest);
  const n = scene.shots.length;
  return (
    <div className="grid gap-1">
      <Button variant="secondary" size="sm" className="justify-self-start" disabled={!ready || busy !== undefined || drafting || Boolean(plan.option?.blocked)} onClick={() => void run("agent", () => draftShots(scene.id, plan.modelId))}>
        {drafting ? "Drafting shots" : withPrice("Draft shots with AI", price)}
      </Button>
      <p className="text-control text-ink-muted">
        {!ready
          ? `Write a logline, then ${registryEntry(plan.modelId)?.label ?? "the agent"} can plan the shots.`
          : n
            ? `Adds 3 to 6 shots after the ${n} here; nothing is replaced.`
            : "Plans 3 to 6 shots from the scene card. Edit them after."}
      </p>
    </div>
  );
}

// Kling shoots every shot as one clip (spec: One-take multi-shot).
function OneTake({ scene, editor }: { scene: Scene; editor: Editor }) {
  const { run, busy } = editor;
  // Kling has no open-weight stand-in, so a one-take needs Comfy (spec: Local engine).
  const engine = useEngineStore();
  const hasKey = useKeyStore((s) => s.location !== "none");
  const problem = routerListed(reachOf(engine, hasKey)) ? oneTakeProblem(scene) : "Needs Comfy credits.";
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
          {withPrice("Shoot as one take", price)}
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
                  <Button size="sm" variant="secondary" className={`justify-self-start ${ON_SEAMLESS}`} disabled={busy !== undefined} onClick={() => void run(`retry:${job.id}`, () => retryOneTake(scene.id, job.id))}>
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

// A take's own length once it has one: startVideo fits a shot's length to the
// model, so an 8 s shot animated by Wan on the visitor's GPU runs 5 s.
function takeSeconds(shot: Shot, job: Job | undefined): number {
  return (job?.input as { model?: { durationSec?: number } } | undefined)?.model?.durationSec ?? shot.durationSec;
}

// Why the take will be shorter or longer than the shot, when it will.
function lengthHint(seconds: number, modelId: string): string | undefined {
  const model = VIDEO_MODELS.find((m) => m.id === modelId);
  if (!model) return undefined;
  const [min, max] = model.duration;
  const fitted = Math.min(max, Math.max(min, seconds));
  return fitted === seconds ? undefined : `${model.label}${isLocalModel(modelId) ? " on your GPU" : ""} makes ${min} to ${max} s clips, so this take runs ${fitted} s.`;
}

const LOCAL_FINAL = "Wan 14B final · your GPU";

// Where a shot stands, in a word or two.
function shotStatus(shot: Shot, job: Job | undefined, chained: boolean): string {
  if (!job) return chained ? (shot.waiting ? "Waiting" : "Not animated") : !shot.anchorJobId ? "No anchor" : "Not animated";
  if (job.status !== "done") return "Working";
  return shot.lipSyncJobId ? "With the line" : shot.finalJobId ? "Final" : takeIsDraft(job) ? "Draft" : "Ready";
}

function StripFrame({ shot, index, chained, aspect, open }: { shot: Shot; index: number; chained: boolean; aspect: string; open: boolean }) {
  const anchor = useJobImageUrl(shot.anchorJobId);
  const job = useJob(exportJobId(shot));
  const take = useJob(shot.takeJobId);
  // A continued shot's still is the frame its take started from.
  const startFrame = useBlobUrl((take?.input as { request?: { sourceBlobId?: string } } | undefined)?.request?.sourceBlobId);
  const still = chained ? startFrame : anchor;
  const status = shotStatus(shot, job, chained);
  // Spans, not a figure: the frame sits inside a button.
  return (
    <span className="grid gap-1">
      <span className={cn("relative block overflow-hidden rounded-media border bg-seamless", open ? "border-on-seamless outline-2 outline-on-seamless" : "border-rule")} style={{ aspectRatio: aspect }}>
        {still ? (
          <img src={still} alt={`Shot ${index + 1}`} className="size-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center font-display text-panel font-extrabold">{index + 1}</span>
        )}
      </span>
      <span className="text-control">
        <span className="font-semibold">{index + 1}</span> · {takeSeconds(shot, job)} s · <span className={cn(job?.status === "done" && "font-semibold")}>{status}</span>
      </span>
    </span>
  );
}

function ExportPlayer({ scene, generationId }: { scene: Scene; generationId: string }): ReactNode {
  const generation = useGeneration(generationId);
  const url = useBlobUrl(generation?.assets.find((a) => a.kind === "video")?.blobId);
  if (!generation) return null;
  const label = exportLabel(scene, generationId);
  return (
    <figure className="grid gap-3">
      <figcaption className="font-display text-screen font-extrabold">{label}</figcaption>
      <span className="relative block w-full max-w-5xl overflow-hidden rounded-media border border-rule" style={{ aspectRatio: aspectOf(scene.ratio), maxHeight: "70vh" }}>
        {url && <video src={url} controls playsInline className="develop absolute inset-0 size-full object-contain" aria-label={`${scene.title}, ${label}`} />}
      </span>
      <div className="flex flex-wrap items-start gap-3">
        {url && (
          <a href={url} download={exportFileName(scene.title)} className={buttonVariants({ variant: "primary" })}>
            Download
          </a>
        )}
        <SocialExport generationId={generationId} onSeamless />
        <Link to={`/library/${generation.id}`} className={buttonVariants({ variant: "secondary", className: ON_SEAMLESS })}>
          Open in library
        </Link>
      </div>
    </figure>
  );
}

function ExportLink({ scene, generationId }: { scene: Scene; generationId: string }): ReactNode {
  const generation = useGeneration(generationId);
  const url = useBlobUrl(generation?.assets.find((a) => a.kind === "video")?.blobId);
  if (!generation) return null;
  return (
    <span className="flex flex-wrap items-baseline gap-3 text-control">
      <span className="font-semibold">{exportLabel(scene, generationId)}</span>
      {url && (
        <a href={url} download={exportFileName(scene.title)} className="underline underline-offset-4">
          Download
        </a>
      )}
      <Link to={`/library/${generation.id}`} className="underline underline-offset-4">
        Open in library
      </Link>
    </span>
  );
}
