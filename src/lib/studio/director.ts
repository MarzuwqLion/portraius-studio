// Director (spec: Director): a scene card with film settings, a shot list,
// an anchor still per shot, one motion take per shot, finals, and one
// stitched export. Chaining (P2): a "continue" shot starts from the previous
// shot's last frame instead of an anchor.
//
// The Contracts schema has no scenes table, so a scene is a JSON blob in the
// blobs table (like the wizard draft), keyed "scene:<id>".
import { MAX_ONE_TAKE_SHOTS, MAX_SHOT_PROMPT } from "@/lib/adapters/kling-omni";
import { onJobDone, retryJob, startJob, type JobInput } from "@/lib/jobs/runner";
import { stitchClips, type StitchSource } from "@/lib/media/stitch";
import { clipInfo } from "@/lib/media/video-prep";
import { isStylised, type CameraSelection } from "@/lib/prompts/camera";
import { compileOneTakeShots, slotsIn } from "@/lib/prompts/compile";
import type { GenerateImageInput, ImageAspectRatio, KlingInput, VideoRatio } from "@/lib/registry/inputs";
import { MODEL_IDS, SCENE_EXPORT_ID } from "@/lib/registry/models";
import { db } from "@/lib/store/db";
import type { Job } from "@/lib/types/jobs";
import { buildCast, dataUri, type CastBundle, type CastPick } from "./cast";
import { startImages } from "./image";
import { DEFAULT_MODEL, isDraft, lastFrameBlobId, renderFinal, startVideo } from "./video";

export type SceneRatio = Extract<VideoRatio, "16:9" | "9:16" | "21:9">;

export interface Film {
  genre?: string;
  body?: string;
  era?: string;
  pacing?: string;
  look?: string;
}

export interface Shot {
  id: string;
  n: number;                      // creation number: the seed offset, stable when shots move
  size: string;                   // camera preset option IDs (presets/camera)
  angle: string;
  lens: string;
  aperture?: string;
  movement: string;
  lighting?: string;
  action: string;                 // "{lead} slides the envelope across the table"
  durationSec: number;
  continuity: "cut" | "continue"; // continue = first frame is the previous shot's last frame
  rolls: number;                  // motion re-rolls, so a re-roll gets a new seed
  anchorJobIds: string[];         // every still drawn for this shot
  anchorJobId?: string;           // the picked one
  takeJobId?: string;             // the motion take: a Seedance draft, or an H3 render
  finalJobId?: string;            // Seedance only: the 1080p final from the draft's ID
  lipSyncJobId?: string;          // the take (or final) lip-synced to a spoken line (Sync-3)
  fromTakeJobId?: string;         // continue: the previous shot's take this one started from
  waiting?: boolean;              // continue: animate once the previous shot's take is done
}

export interface Scene {
  id: string;
  title: string;
  logline: string;
  cast: CastPick[];
  location: string;
  film: Film;
  ratio: SceneRatio;
  sound: boolean;
  seed: number;
  nextShot: number;
  shots: Shot[];
  exportGenerationIds: string[];
  oneTakeJobIds?: string[];       // Kling one-takes of the whole scene, newest first
  agentRequest?: { requestId: string; startedAt: number };  // a "Draft with AI" plan still to collect
  createdAt: number;
  updatedAt: number;
}

const PREFIX = "scene:";
const key = (id: string) => `${PREFIX}${id}`;

// Pacing sets the default shot length (spec: Film and camera controls).
export const PACING_SECONDS: Record<string, number> = { calm: 8, standard: 5, fast: 4 };

export function newScene(seed: number): Scene {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "Untitled scene",
    logline: "",
    cast: [],
    location: "",
    film: { genre: "drama", body: "digital-cinema", era: "present", pacing: "standard" },
    ratio: "16:9",
    sound: true,
    seed,
    nextShot: 0,
    shots: [],
    exportGenerationIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function newShot(scene: Scene, previous?: Shot): Shot {
  return {
    id: crypto.randomUUID(),
    n: scene.nextShot,
    size: previous?.size ?? "MS",
    angle: previous?.angle ?? "eye",
    lens: previous?.lens ?? "35mm",
    movement: "static",
    ...(previous?.lighting ? { lighting: previous.lighting } : {}),
    action: "",
    durationSec: PACING_SECONDS[scene.film.pacing ?? "standard"] ?? 5,
    continuity: "cut",
    rolls: 0,
    anchorJobIds: [],
  };
}

// ---- Storage ----

export async function loadScene(id: string): Promise<Scene | undefined> {
  const row = await db.blobs.get(key(id));
  if (!row) return undefined;
  try {
    return JSON.parse(await row.blob.text()) as Scene;
  } catch {
    return undefined;
  }
}

export async function listScenes(): Promise<Scene[]> {
  const rows = await db.blobs.where("id").startsWith(PREFIX).toArray();
  const scenes: Scene[] = [];
  for (const row of rows) {
    try {
      scenes.push(JSON.parse(await row.blob.text()) as Scene);
    } catch {
      // A broken row is skipped, not fatal.
    }
  }
  return scenes.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveScene(scene: Scene): Promise<Scene> {
  const next = { ...scene, updatedAt: Date.now() };
  const blob = new Blob([JSON.stringify(next)], { type: "application/json" });
  await db.blobs.put({ id: key(scene.id), blob, mime: blob.type, bytes: blob.size });
  return next;
}

// Read, change, write, one update at a time, so two quick edits can't drop
// one. Not a Dexie transaction: reading the JSON (Blob.text) isn't an
// IndexedDB call, and awaiting it would commit the transaction early.
let updates: Promise<unknown> = Promise.resolve();

export function updateScene(id: string, change: (scene: Scene) => Scene): Promise<Scene> {
  const next = updates.then(async () => {
    const scene = await loadScene(id);
    if (!scene) throw new Error("This scene is gone.");
    return saveScene(change(scene));
  });
  updates = next.catch(() => undefined);
  return next;
}

// The editor's copy wins for what people type and how shots are ordered; the
// stored copy wins for what the steps write (stills, picks, takes, finals,
// exports), so a late save from the editor can't undo a step.
export function mergeEdits(stored: Scene, edited: Scene): Scene {
  const byId = new Map(stored.shots.map((s) => [s.id, s]));
  const { oneTakeJobIds: _o, agentRequest: _r, ...typedScene } = edited;
  return {
    ...typedScene,
    exportGenerationIds: stored.exportGenerationIds,
    ...(stored.oneTakeJobIds ? { oneTakeJobIds: stored.oneTakeJobIds } : {}),
    ...(stored.agentRequest ? { agentRequest: stored.agentRequest } : {}),
    shots: edited.shots.map((shot) => {
      const s = byId.get(shot.id);
      if (!s) return shot;
      const { anchorJobId: _a, takeJobId: _t, finalJobId: _f, lipSyncJobId: _l, fromTakeJobId: _p, waiting: _w, ...typed } = shot;
      return {
        ...typed,
        rolls: s.rolls,
        anchorJobIds: s.anchorJobIds,
        ...(s.anchorJobId ? { anchorJobId: s.anchorJobId } : {}),
        ...(s.takeJobId ? { takeJobId: s.takeJobId } : {}),
        ...(s.finalJobId ? { finalJobId: s.finalJobId } : {}),
        ...(s.lipSyncJobId ? { lipSyncJobId: s.lipSyncJobId } : {}),
        ...(s.fromTakeJobId ? { fromTakeJobId: s.fromTakeJobId } : {}),
        ...(s.waiting ? { waiting: true } : {}),
      };
    }),
  };
}

export function saveEdits(edited: Scene): Promise<Scene> {
  return updateScene(edited.id, (stored) => mergeEdits(stored, edited));
}

export async function updateShot(sceneId: string, shotId: string, change: (shot: Shot) => Shot): Promise<Scene> {
  return updateScene(sceneId, (s) => ({ ...s, shots: s.shots.map((shot) => (shot.id === shotId ? change(shot) : shot)) }));
}

// Deletes the scene card only; its stills, takes and exports stay in the library.
export async function deleteScene(id: string): Promise<void> {
  await db.blobs.delete(key(id));
}

// ---- Prompts ----

// Cast members named in the action ("{lead} ..."); a shot naming nobody has no cast.
export function shotCast(scene: Scene, shot: Shot): CastPick[] {
  const named = new Set(slotsIn(shot.action));
  return scene.cast.filter((c) => named.has(c.slot));
}

// Film settings and the location ride on every shot, word for word
// (spec: Continuity rules).
export function shotScene(scene: Scene, shot: Shot): string {
  const location = scene.location.trim();
  return [shot.action.trim(), location ? `Location: ${location}.` : ""].filter(Boolean).join(" ");
}

export function shotCamera(scene: Scene, shot: Shot, withMovement: boolean): CameraSelection {
  return {
    ...scene.film,
    size: shot.size,
    angle: shot.angle,
    lens: shot.lens,
    ...(shot.aperture ? { aperture: shot.aperture } : {}),
    ...(shot.lighting ? { lighting: shot.lighting } : {}),
    ...(withMovement ? { movement: shot.movement } : {}),
  };
}

// A scene-level seed is the base; a shot's seed is base + its number, so
// re-rolling one shot doesn't change the others.
export function shotSeed(scene: Scene, shot: Shot): number {
  return (scene.seed + shot.n + shot.rolls * 1009) % 2147483647;
}

export function anchorAspect(ratio: SceneRatio): ImageAspectRatio {
  return ratio;
}

// ---- Chaining ----

export function previousShot(scene: Scene, shot: Shot): Shot | undefined {
  const i = scene.shots.findIndex((s) => s.id === shot.id);
  return i > 0 ? scene.shots[i - 1] : undefined;
}

// The first shot has nothing to continue from, so it's always a cut.
export function continues(scene: Scene, shot: Shot): boolean {
  return shot.continuity === "continue" && previousShot(scene, shot) !== undefined;
}

// A continued shot whose previous shot has been re-rolled or moved since: its
// first frame no longer matches what comes before it.
export function chainStale(scene: Scene, shot: Shot): boolean {
  return continues(scene, shot) && Boolean(shot.takeJobId) && shot.fromTakeJobId !== previousShot(scene, shot)?.takeJobId;
}

// The job whose last frame a continued shot starts from: the previous shot's
// lip sync or final once it's done (same motion; Sync-3 can cut the clip to
// the line), otherwise its take.
async function chainSourceJob(previous: Shot): Promise<Job | undefined> {
  const [take, final, lipSync] = await db.jobs.bulkGet([previous.takeJobId ?? "", previous.finalJobId ?? "", previous.lipSyncJobId ?? ""]);
  return [lipSync, final, take].find((job) => job?.status === "done");
}

async function chainFrameBlobId(previous: Shot): Promise<string | undefined> {
  const job = await chainSourceJob(previous);
  const generationId = job?.generationIds[0];
  return generationId ? lastFrameBlobId(generationId) : undefined;
}

// ---- Steps ----

// Anchors: 2 to 4 stills with the cast references and the shot's camera
// phrases (no movement: they're stills). 2K at the fast setting: "best"
// (high thinking) hit the provider's deadline on half of six parallel stills.
export async function drawAnchors(sceneId: string, shotId: string, count: number): Promise<string[]> {
  const scene = await loadScene(sceneId);
  const shot = scene?.shots.find((s) => s.id === shotId);
  if (!scene || !shot) throw new Error("This shot is gone.");
  if (!shot.action.trim()) throw new Error("Describe what happens in the shot first.");
  const ids = await startImages({
    scene: shotScene(scene, shot),
    cast: shotCast(scene, shot),
    aspectRatio: anchorAspect(scene.ratio),
    size: "2K",
    quality: "fast",
    count: Math.min(4, Math.max(1, count)),
    camera: shotCamera(scene, shot, false),
  });
  await updateShot(sceneId, shotId, (s) => ({ ...s, anchorJobIds: [...s.anchorJobIds, ...ids] }));
  return ids;
}

// A failed still, drawn again at the anchor settings (older stills asked for
// "best").
export async function retryAnchor(jobId: string): Promise<string> {
  const job = await db.jobs.get(jobId);
  if (!job) throw new Error("That still is gone.");
  const input = job.input as JobInput<GenerateImageInput>;
  return (await retryJob(jobId, { input: { ...input, model: { ...input.model, quality: "fast" } } })).id;
}

export async function pickAnchor(sceneId: string, shotId: string, jobId: string): Promise<void> {
  await updateShot(sceneId, shotId, (s) => ({ ...s, anchorJobId: jobId }));
}

async function anchorBlobId(jobId: string): Promise<string> {
  const job = await db.jobs.get(jobId);
  const generation = job?.status === "done" ? await db.generations.get(job.generationIds[0] ?? "") : undefined;
  const asset = generation?.assets.find((a) => a.kind === "image");
  if (!asset) throw new Error("The anchor still isn't ready.");
  return asset.blobId;
}

// Animate: the anchor is the first frame, or for a continued shot the
// previous shot's last frame. Seedance makes a 480p draft; a face in that
// frame sends the shot to H3 instead (Seedance refuses people), which renders
// once at 768P. A continued shot whose previous take isn't done yet waits for
// it, so a whole chain can be started at once and runs in order.
export async function animateShot(sceneId: string, shotId: string, reroll = false): Promise<string | undefined> {
  const scene = await loadScene(sceneId);
  const shot = scene?.shots.find((s) => s.id === shotId);
  if (!scene || !shot) throw new Error("This shot is gone.");
  const previous = continues(scene, shot) ? previousShot(scene, shot) : undefined;
  let sourceBlobId: string;
  if (previous) {
    const frame = await chainFrameBlobId(previous);
    if (!frame) {
      await updateShot(sceneId, shotId, (s) => ({ ...s, waiting: true }));
      // The previous take may have finished while this one was being marked.
      void resumeWaitingShots();
      return undefined;
    }
    sourceBlobId = frame;
  } else {
    if (!shot.anchorJobId) throw new Error("Pick an anchor still first.");
    sourceBlobId = await anchorBlobId(shot.anchorJobId);
  }
  const rolled = reroll ? { ...shot, rolls: shot.rolls + 1 } : shot;
  const jobId = await startVideo({
    mode: "image",
    model: DEFAULT_MODEL,
    scene: shotScene(scene, rolled),
    cast: shotCast(scene, rolled),
    sourceBlobId,
    durationSec: rolled.durationSec,
    ratio: scene.ratio,
    audio: scene.sound,
    seed: shotSeed(scene, rolled),
    h3Resolution: "768P",
    camera: shotCamera(scene, rolled, true),
  });
  await updateShot(sceneId, shotId, (s) => {
    const { finalJobId: _old, lipSyncJobId: _line, fromTakeJobId: _from, waiting: _w, ...rest } = s;
    return { ...rest, rolls: rolled.rolls, takeJobId: jobId, ...(previous?.takeJobId ? { fromTakeJobId: previous.takeJobId } : {}) };
  });
  return jobId;
}

export async function stopWaiting(sceneId: string, shotId: string): Promise<void> {
  await updateShot(sceneId, shotId, (s) => {
    const { waiting: _w, ...rest } = s;
    return rest;
  });
}

// A waiting shot keeps its flag until its take is recorded (animateShot
// clears it then), so a page closed halfway through starting it starts it
// again next time. One starter per shot: in this tab, and across tabs with a
// Web Lock when the browser has them.
const starting = new Set<string>();

async function startWaiting(sceneId: string, shotId: string): Promise<void> {
  if (starting.has(shotId)) return;
  starting.add(shotId);
  const work = async () => {
    const shot = (await loadScene(sceneId))?.shots.find((s) => s.id === shotId);
    if (!shot?.waiting) return;
    // A re-roll when the shot already has a take, so it gets a new seed.
    await animateShot(sceneId, shotId, Boolean(shot.takeJobId));
  };
  try {
    const locks = globalThis.navigator?.locks;
    if (locks) await locks.request(`portraius-shot-${shotId}`, { ifAvailable: true }, async (lock) => (lock ? work() : undefined));
    else await work();
  } catch (err) {
    console.warn("a continued shot didn't start", { shot: shotId, error: (err as Error).message });
  } finally {
    starting.delete(shotId);
  }
}

// Starts every waiting shot whose previous shot now has a finished take.
// Runs when a video job finishes and once on start-up.
export async function resumeWaitingShots(): Promise<void> {
  for (const scene of await listScenes()) {
    for (const shot of scene.shots) {
      const previous = shot.waiting ? previousShot(scene, shot) : undefined;
      if (previous && (await chainSourceJob(previous))) await startWaiting(scene.id, shot.id);
    }
  }
}

export function registerDirector(): () => void {
  return onJobDone((job) => (job.kind === "video" ? resumeWaitingShots() : undefined));
}

// A failed take (or final) tried again with the same input.
export async function retryShotJob(sceneId: string, shotId: string, which: "take" | "final" | "line"): Promise<string> {
  const scene = await loadScene(sceneId);
  const shot = scene?.shots.find((s) => s.id === shotId);
  const jobId = which === "take" ? shot?.takeJobId : which === "final" ? shot?.finalJobId : shot?.lipSyncJobId;
  if (!jobId) throw new Error("There's nothing to retry.");
  const job = await retryJob(jobId);
  await updateShot(sceneId, shotId, (s) => (which === "take" ? { ...s, takeJobId: job.id } : which === "final" ? { ...s, finalJobId: job.id } : { ...s, lipSyncJobId: job.id }));
  return job.id;
}

export async function finalizeShot(sceneId: string, shotId: string): Promise<string> {
  const scene = await loadScene(sceneId);
  const shot = scene?.shots.find((s) => s.id === shotId);
  if (!shot?.takeJobId) throw new Error("Animate the shot first.");
  const jobId = await renderFinal(shot.takeJobId);
  // A line synced onto the draft would lose the final's pixels: sync it again.
  await updateShot(sceneId, shotId, (s) => {
    const { lipSyncJobId: _line, ...rest } = s;
    return { ...rest, finalJobId: jobId };
  });
  return jobId;
}

// The clip a line is synced onto: the final once it's done, else the take.
export function lineSourceJobId(shot: Shot, final: Job | undefined): string | undefined {
  return final?.status === "done" ? shot.finalJobId : shot.takeJobId;
}

export async function setShotLine(sceneId: string, shotId: string, lipSyncJobId: string | undefined): Promise<void> {
  await updateShot(sceneId, shotId, (s) => {
    const { lipSyncJobId: _old, ...rest } = s;
    return lipSyncJobId ? { ...rest, lipSyncJobId } : rest;
  });
}

// Whether a take is a Seedance draft (it has a final to render) or already
// the final picture (H3).
export function takeIsDraft(job: Job | undefined): boolean {
  return Boolean(job && isDraft(job));
}

// The job whose video goes into the export: the lip-synced clip if the shot
// has a line, then the final, otherwise the take (an H3 render, or a draft
// when no final was made).
export function exportJobId(shot: Shot): string | undefined {
  return shot.lipSyncJobId ?? shot.finalJobId ?? shot.takeJobId;
}

// ---- One take (P2) ----

// Kling V3 Omni shoots the whole scene as one clip, each shot with its own
// prompt (spec: One-take multi-shot): a fast first pass at 720p before
// refining shot by shot. Up to 6 shots and 15 s; Kling takes up to 7
// reference images.
export const ONE_TAKE_MAX_SEC = 15;
const ONE_TAKE_MAX_IMAGES = 7;
const ONE_TAKE_RATIO: Record<SceneRatio, NonNullable<KlingInput["ratio"]>> = { "16:9": "16:9", "21:9": "16:9", "9:16": "9:16" };

// The shots' planned lengths when they fit in 15 s; otherwise scaled down to
// fill 15 s, each at least 1 s, with spare seconds going to the longest.
export function oneTakeDurations(lengths: number[], max = ONE_TAKE_MAX_SEC): number[] {
  const total = lengths.reduce((t, d) => t + d, 0);
  if (total <= max) return lengths;
  const scaled = lengths.map((d) => Math.max(1, Math.floor((d * max) / total)));
  const longestFirst = lengths.map((d, i) => ({ d, i })).sort((a, b) => b.d - a.d || a.i - b.i);
  for (let left = max - scaled.reduce((t, d) => t + d, 0), k = 0; left > 0; left--, k = (k + 1) % longestFirst.length) {
    scaled[longestFirst[k]!.i]!++;
  }
  return scaled;
}

export function oneTakeProblem(scene: Scene): string | undefined {
  if (scene.shots.length < 2) return "A one-take needs at least 2 shots.";
  if (scene.shots.length > MAX_ONE_TAKE_SHOTS) return `A one-take holds up to ${MAX_ONE_TAKE_SHOTS} shots.`;
  if (scene.shots.some((s) => !s.action.trim())) return "Describe every shot's action first.";
  return undefined;
}

// Over Kling's 7 images, people keep their sheet and lose their photo, the
// last cast member first.
function fitReferences(cast: CastBundle, max: number): CastBundle {
  const groups = cast.members.map((member, i) => {
    const start = cast.members.slice(0, i).reduce((t, m) => t + m.references.length, 0);
    return { member: { ...member, references: [...member.references] }, images: cast.images.slice(start, start + member.references.length) };
  });
  for (let g = groups.length - 1; g >= 0 && groups.reduce((t, x) => t + x.images.length, 0) > max; g--) {
    while (groups[g]!.images.length > 1 && groups.reduce((t, x) => t + x.images.length, 0) > max) {
      groups[g]!.images.pop();
      groups[g]!.member.references.pop();
    }
  }
  const images = groups.flatMap((x) => x.images);
  if (images.length > max) throw new Error(`A one-take takes up to ${max} reference images, one per cast member at least. Name fewer cast members in the shots.`);
  return { members: groups.map((x) => x.member), images, characterIds: cast.characterIds };
}

export async function oneTakeInput(scene: Scene): Promise<{ input: KlingInput; characterIds: string[] }> {
  const problem = oneTakeProblem(scene);
  if (problem) throw new Error(problem);
  const named = new Set(scene.shots.flatMap((s) => slotsIn(s.action)));
  const cast = fitReferences(await buildCast(scene.cast.filter((c) => named.has(c.slot))), ONE_TAKE_MAX_IMAGES);
  const durations = oneTakeDurations(scene.shots.map((s) => s.durationSec));
  const prompts = compileOneTakeShots({
    shots: scene.shots.map((s) => ({ scene: s.action, camera: shotCamera(scene, s, true) })),
    cast: cast.members,
    location: scene.location,
    modelId: MODEL_IDS.klingOmni,
    limit: MAX_SHOT_PROMPT,
  });
  return {
    input: {
      prompt: scene.title,
      quality: "std",
      ratio: ONE_TAKE_RATIO[scene.ratio],
      sound: scene.sound,
      ...(cast.images.length ? { referenceImages: cast.images.map(dataUri) } : {}),
      shots: prompts.map((prompt, i) => ({ prompt, durationSec: durations[i]! })),
    },
    characterIds: cast.characterIds,
  };
}

export async function shootOneTake(sceneId: string): Promise<string> {
  const scene = await loadScene(sceneId);
  if (!scene) throw new Error("This scene is gone.");
  const { input, characterIds } = await oneTakeInput(scene);
  const job = await startJob({
    kind: "shot",
    modelId: MODEL_IDS.klingOmni,
    input: {
      model: input,
      characterIds,
      prompt: scene.logline.trim() ? `${scene.title}, one take: ${scene.logline.trim()}` : `${scene.title}, one take`,
      stylised: isStylised(scene.film),
      request: { oneTakeOf: scene.id },
    },
  });
  await updateScene(sceneId, (s) => ({ ...s, oneTakeJobIds: [job.id, ...(s.oneTakeJobIds ?? [])] }));
  return job.id;
}

// A failed one-take tried again in its place.
export async function retryOneTake(sceneId: string, jobId: string): Promise<string> {
  const job = await retryJob(jobId);
  await updateScene(sceneId, (s) => ({ ...s, oneTakeJobIds: (s.oneTakeJobIds ?? []).map((id) => (id === jobId ? job.id : id)) }));
  return job.id;
}

// ---- Export ----

// 720p unless the shots can be joined by stream copy (Unknowns row 15,
// lib/media/stitch.ts).
export const EXPORT_SIZE: Record<SceneRatio, { width: number; height: number }> = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "21:9": { width: 1680, height: 720 },
};

async function shotVideo(shot: Shot): Promise<{ blob: Blob; characterIds: string[] } | undefined> {
  const jobId = exportJobId(shot);
  const job = jobId ? await db.jobs.get(jobId) : undefined;
  if (job?.status !== "done") return undefined;
  const generation = await db.generations.get(job.generationIds[0] ?? "");
  const asset = generation?.assets.find((a) => a.kind === "video");
  const row = asset ? await db.blobs.get(asset.blobId) : undefined;
  return row && generation ? { blob: row.blob, characterIds: generation.characterIds } : undefined;
}

// Joins every shot's video, in order, into one MP4 in the library.
export async function exportScene(sceneId: string, crossfade: boolean, onProgress?: (share: number) => void): Promise<string> {
  const scene = await loadScene(sceneId);
  if (!scene?.shots.length) throw new Error("Add shots before exporting.");
  const sources: StitchSource[] = [];
  const characterIds = new Set<string>();
  for (const [i, shot] of scene.shots.entries()) {
    const video = await shotVideo(shot);
    if (!video) throw new Error(`Shot ${i + 1} has no finished take yet.`);
    video.characterIds.forEach((id) => characterIds.add(id));
    // A continued shot picks up where the last one stopped: a straight cut, never a crossfade.
    const chained = continues(scene, shot) && !chainStale(scene, shot);
    sources.push({ blob: video.blob, durationSec: (await clipInfo(video.blob)).durationSec, ...(chained ? { continues: true } : {}) });
  }
  const blob = await stitchClips(sources, { ...EXPORT_SIZE[scene.ratio], crossfade }, onProgress);
  const id = crypto.randomUUID();
  const blobId = `${id}-a0`;
  await db.transaction("rw", db.blobs, db.generations, async () => {
    await db.blobs.put({ id: blobId, blob, mime: "video/mp4", bytes: blob.size });
    await db.generations.put({
      id,
      type: "scene",
      modelId: SCENE_EXPORT_ID,
      jobId: key(scene.id),
      characterIds: [...characterIds],
      assets: [{ blobId, kind: "video", mime: "video/mp4", bytes: blob.size }],
      prompt: scene.logline.trim() ? `${scene.title}: ${scene.logline.trim()}` : scene.title,
      createdAt: Date.now(),
    });
  });
  await updateScene(scene.id, (s) => ({ ...s, exportGenerationIds: [id, ...s.exportGenerationIds] }));
  return id;
}

