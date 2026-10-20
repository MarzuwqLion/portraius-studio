// Director (spec: Director): a scene card with film settings, a shot list,
// an anchor still per shot, one motion take per shot, finals, and one
// stitched export. Chaining ("continue") is P2 and not built.
//
// The Contracts schema has no scenes table, so a scene is a JSON blob in the
// blobs table (like the wizard draft), keyed "scene:<id>".
import { retryJob, type JobInput } from "@/lib/jobs/runner";
import { stitchClips } from "@/lib/media/stitch";
import { clipInfo } from "@/lib/media/video-prep";
import { slotsIn } from "@/lib/prompts/compile";
import type { CameraSelection } from "@/lib/prompts/camera";
import type { GenerateImageInput, ImageAspectRatio, VideoRatio } from "@/lib/registry/inputs";
import { SCENE_EXPORT_ID } from "@/lib/registry/models";
import { db } from "@/lib/store/db";
import type { Job } from "@/lib/types/jobs";
import type { CastPick } from "./cast";
import { startImages } from "./image";
import { DEFAULT_MODEL, isDraft, renderFinal, startVideo } from "./video";

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
  continuity: "cut";              // "continue" (chaining) is P2
  rolls: number;                  // motion re-rolls, so a re-roll gets a new seed
  anchorJobIds: string[];         // every still drawn for this shot
  anchorJobId?: string;           // the picked one
  takeJobId?: string;             // the motion take: a Seedance draft, or an H3 render
  finalJobId?: string;            // Seedance only: the 1080p final from the draft's ID
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
  return {
    ...edited,
    exportGenerationIds: stored.exportGenerationIds,
    shots: edited.shots.map((shot) => {
      const s = byId.get(shot.id);
      if (!s) return shot;
      const { anchorJobId: _a, takeJobId: _t, finalJobId: _f, ...typed } = shot;
      return {
        ...typed,
        rolls: s.rolls,
        anchorJobIds: s.anchorJobIds,
        ...(s.anchorJobId ? { anchorJobId: s.anchorJobId } : {}),
        ...(s.takeJobId ? { takeJobId: s.takeJobId } : {}),
        ...(s.finalJobId ? { finalJobId: s.finalJobId } : {}),
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

// Animate: the anchor is the first frame. Seedance makes a 480p draft; a
// face in the anchor sends the shot to H3 instead (Seedance refuses people),
// which renders once at 768P.
export async function animateShot(sceneId: string, shotId: string, reroll = false): Promise<string> {
  const scene = await loadScene(sceneId);
  const shot = scene?.shots.find((s) => s.id === shotId);
  if (!scene || !shot) throw new Error("This shot is gone.");
  if (!shot.anchorJobId) throw new Error("Pick an anchor still first.");
  const rolled = reroll ? { ...shot, rolls: shot.rolls + 1 } : shot;
  const jobId = await startVideo({
    mode: "image",
    model: DEFAULT_MODEL,
    scene: shotScene(scene, rolled),
    cast: shotCast(scene, rolled),
    sourceBlobId: await anchorBlobId(rolled.anchorJobId!),
    durationSec: rolled.durationSec,
    ratio: scene.ratio,
    audio: scene.sound,
    seed: shotSeed(scene, rolled),
    h3Resolution: "768P",
    camera: shotCamera(scene, rolled, true),
  });
  await updateShot(sceneId, shotId, (s) => {
    const { finalJobId: _old, ...rest } = s;
    return { ...rest, rolls: rolled.rolls, takeJobId: jobId };
  });
  return jobId;
}

// A failed take (or final) tried again with the same input.
export async function retryShotJob(sceneId: string, shotId: string, which: "take" | "final"): Promise<string> {
  const scene = await loadScene(sceneId);
  const shot = scene?.shots.find((s) => s.id === shotId);
  const jobId = which === "take" ? shot?.takeJobId : shot?.finalJobId;
  if (!jobId) throw new Error("There's nothing to retry.");
  const job = await retryJob(jobId);
  await updateShot(sceneId, shotId, (s) => (which === "take" ? { ...s, takeJobId: job.id } : { ...s, finalJobId: job.id }));
  return job.id;
}

export async function finalizeShot(sceneId: string, shotId: string): Promise<string> {
  const scene = await loadScene(sceneId);
  const shot = scene?.shots.find((s) => s.id === shotId);
  if (!shot?.takeJobId) throw new Error("Animate the shot first.");
  const jobId = await renderFinal(shot.takeJobId);
  await updateShot(sceneId, shotId, (s) => ({ ...s, finalJobId: jobId }));
  return jobId;
}

// Whether a take is a Seedance draft (it has a final to render) or already
// the final picture (H3).
export function takeIsDraft(job: Job | undefined): boolean {
  return Boolean(job && isDraft(job));
}

// The job whose video goes into the export: the final if there is one,
// otherwise the take (an H3 render, or a draft when no final was made).
export function exportJobId(shot: Shot): string | undefined {
  return shot.finalJobId ?? shot.takeJobId;
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
  const sources: { blob: Blob; durationSec: number }[] = [];
  const characterIds = new Set<string>();
  for (const [i, shot] of scene.shots.entries()) {
    const video = await shotVideo(shot);
    if (!video) throw new Error(`Shot ${i + 1} has no finished take yet.`);
    video.characterIds.forEach((id) => characterIds.add(id));
    sources.push({ blob: video.blob, durationSec: (await clipInfo(video.blob)).durationSec });
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

