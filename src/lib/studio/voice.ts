// Voice and lip sync (spec: Finishing, Voice and Lip sync; P2). A line is
// spoken in a stock voice (ElevenLabs v4, a direct call: speech stays outside
// the job state machine) or brought in as the user's own recording, then put
// in a clip one of two ways:
//
// - Lip sync (Sync-3): moves the mouth of a finished clip to the line.
// - A new speaking clip (MiniMax H3): the cast's references plus the line as
//   reference audio, hosted (H3 refused it as a data URI in M7). The spec
//   planned Seedance for this, but Seedance refuses photoreal people, and H3
//   can't take a first frame with reference media.
//
// The line rides on the result as an audio asset, so the library keeps it.
import { MAX_LINE_CHARS } from "@/lib/adapters/elevenlabs";
import { runAndSave } from "@/lib/jobs/direct";
import { onRestart, startJob, type JobInput } from "@/lib/jobs/runner";
import { LINE_TYPES, audioDuration } from "@/lib/media/audio";
import { isStylised, type CameraSelection } from "@/lib/prompts/camera";
import { compileVideoPrompt, role } from "@/lib/prompts/compile";
import type { H3Input, LipSyncInput, SpeechInput, VideoRatio } from "@/lib/registry/inputs";
import { MODEL_IDS } from "@/lib/registry/models";
import { deleteAsset, uploadAsset, type HostedAsset } from "@/lib/router/client";
import { db } from "@/lib/store/db";
import type { Job } from "@/lib/types/jobs";
import type { GenerationAsset } from "@/lib/types/records";
import { buildCast, dataUri, type CastPick } from "./cast";

// A spoken line, saved in the blobs table ("audio:<uuid>").
export interface SpokenLine {
  blobId: string;
  mime: string;
  bytes: number;
  durationSec: number;
  text: string;          // empty for the user's own recording
  voiceId?: string;      // a stock voice; none for a recording
}

export { MAX_LINE_CHARS };

// Sync-3 and H3 both work on lines up to H3's 15 s.
export const MAX_LINE_SEC = 15;
export const MAX_RECORDING_BYTES = 10 * 1024 * 1024;

export async function speakLine(text: string, voiceId: string, seed?: number): Promise<SpokenLine> {
  const input: SpeechInput = { lines: [{ text, voiceId }], ...(seed !== undefined ? { seed } : {}) };
  const { assets } = await runAndSave(MODEL_IDS.elevenLabs, input, "audio");
  const audio = assets[0]!;
  const row = await db.blobs.get(audio.blobId);
  const durationSec = row ? await audioDuration(row.blob) : 0;
  if (durationSec > MAX_LINE_SEC) {
    await db.blobs.delete(audio.blobId);
    throw new Error(`That line runs ${Math.round(durationSec)} s; a clip can speak up to ${MAX_LINE_SEC} s. Shorten it.`);
  }
  return { blobId: audio.blobId, mime: audio.mime, bytes: audio.bytes, durationSec, text: text.trim(), voiceId };
}

// The user's own recording, after they confirm they have the rights to it
// (spec: Security, rights checkbox on every uploaded audio file).
export async function storeRecording(file: File): Promise<SpokenLine> {
  const mime = (LINE_TYPES as readonly string[]).includes(file.type) ? (file.type === "audio/mpeg" ? "audio/mpeg" : "audio/wav") : undefined;
  if (!mime) throw new Error("Use an MP3 or WAV recording.");
  if (file.size > MAX_RECORDING_BYTES) throw new Error("Keep the recording under 10 MB.");
  const durationSec = await audioDuration(file);
  if (durationSec > MAX_LINE_SEC) throw new Error(`That recording runs ${Math.round(durationSec)} s; a clip can speak up to ${MAX_LINE_SEC} s.`);
  const blob = new Blob([file], { type: mime });
  const blobId = `audio:${crypto.randomUUID()}`;
  await db.blobs.put({ id: blobId, blob, mime, bytes: blob.size });
  return { blobId, mime, bytes: blob.size, durationSec, text: "" };
}

const lineAsset = (line: SpokenLine): GenerationAsset => ({ blobId: line.blobId, kind: "audio", mime: line.mime, bytes: line.bytes });

const quoted = (line: SpokenLine) => (line.text ? `"${line.text}"` : "their own recording");

export interface LipSyncRequest {
  lipSyncOf: string;  // the generation whose clip speaks
  line: SpokenLine;
}

async function lineBlob(line: SpokenLine): Promise<Blob> {
  const row = await db.blobs.get(line.blobId);
  if (!row) throw new Error("That line is gone. Make it again.");
  return row.blob;
}

async function generationVideo(generationId: string) {
  const generation = await db.generations.get(generationId);
  const asset = generation?.assets.find((a) => a.kind === "video");
  const row = asset ? await db.blobs.get(asset.blobId) : undefined;
  if (!generation || !row) throw new Error("That clip isn't in your library any more.");
  return { generation, blob: row.blob };
}

const hostLine = async (line: SpokenLine) =>
  uploadAsset(await lineBlob(line), { filePath: line.mime === "audio/wav" ? "line.wav" : "line.mp3", contentType: line.mime });

// Hosted files belong to the job, which deletes them when it ends; if the job
// is never made, they're deleted here.
async function withUploads(uploads: HostedAsset[], start: (ids: string[]) => Promise<Job>): Promise<Job> {
  try {
    return await start(uploads.map((u) => u.id));
  } catch (err) {
    for (const u of uploads) await deleteAsset(u.id).catch(() => undefined);
    throw err;
  }
}

// Sync-3 takes both files as public links only: they go up to the media host.
export async function startLipSync(generationId: string, line: SpokenLine, parentJobId?: string): Promise<Job> {
  const { generation, blob } = await generationVideo(generationId);
  const video = await uploadAsset(blob, { filePath: "speaking.mp4", contentType: "video/mp4" });
  const sound = await hostLine(line).catch(async (err) => {
    await deleteAsset(video.id).catch(() => undefined);
    throw err;
  });
  const input: LipSyncInput = { videoUrl: video.url, audioUrl: sound.url };
  return withUploads([video, sound], (uploads) => startJob({
    kind: "lipsync",
    modelId: MODEL_IDS.sync3,
    input: {
      model: input,
      characterIds: generation.characterIds,
      prompt: `${generation.prompt ?? "A clip"}, saying ${quoted(line)}`,
      ...(generation.scoreNote === "stylised" ? { stylised: true } : {}),
      keepAssets: [lineAsset(line)],
      request: { lipSyncOf: generationId, line } satisfies LipSyncRequest,
    } satisfies JobInput<LipSyncInput>,
    uploads,
    ...(parentJobId ? { parentJobId } : {}),
  }));
}

// The cast and stock voice to offer for a clip: its own request when the
// Video studio made it, otherwise the people in it, in order.
export async function speakingDefaults(generationId: string): Promise<{ request: Omit<SpeakingRequest, "line">; speakerName: string; voiceId?: string } | undefined> {
  const generation = await db.generations.get(generationId);
  if (!generation) return undefined;
  const job = await db.jobs.get(generation.jobId);
  const asked = (job?.input as { request?: Partial<SpeakingRequest> & { mode?: string } } | undefined)?.request;
  const people = (await db.characters.bulkGet(generation.characterIds)).filter((c) => c?.kind === "person");
  const cast: CastPick[] =
    asked?.cast?.length && asked.scene ? asked.cast : people.map((p, i) => ({ slot: ["lead", "second", "third"][i] ?? `person${i + 1}`, characterId: p!.id }));
  const speaker = cast.find((c) => people.some((p) => p!.id === c.characterId));
  if (!speaker) return undefined;
  const record = people.find((p) => p!.id === speaker.characterId)!;
  const scene = asked?.scene ?? generation.prompt ?? `{${speaker.slot}} faces the camera`;
  return {
    request: {
      scene,
      cast,
      speaker: speaker.slot,
      ratio: asked?.ratio ?? "16:9",
      resolution: "768P",
      camera: asked?.camera ?? {},
      seed: typeof asked?.seed === "number" ? asked.seed : Math.floor(Math.random() * 2 ** 31),
    },
    speakerName: record.name,
    ...(record.file.voice ? { voiceId: record.file.voice.voiceId } : {}),
  };
}

// ---- A new speaking clip (H3) ----

export interface SpeakingRequest {
  scene: string;            // with {slots}, e.g. "{lead} leans across the diner table"
  cast: CastPick[];
  speaker: string;          // the slot that speaks
  line: SpokenLine;
  ratio: VideoRatio;
  resolution: H3Input["resolution"];
  camera: CameraSelection;
  seed: number;
}

// H3 runs whole seconds from 4 to 15: the line's length, rounded up, plus a
// moment either side.
export function speakingDuration(lineSec: number): number {
  return Math.min(MAX_LINE_SEC, Math.max(4, Math.ceil(lineSec + 1)));
}

export function speakingScene(scene: string, speaker: string): string {
  const action = scene.trim().replace(/[.!?]?$/, ".");
  return `${action} ${role(speaker)} speaks the words in the reference audio, lips moving in sync with it.`;
}

// audioUrl is the line's hosted link (a stand-in for a price estimate).
export async function speakingInput(request: SpeakingRequest, audioUrl: string): Promise<{ input: H3Input; characterIds: string[] }> {
  if (!request.cast.some((c) => c.slot === request.speaker)) throw new Error("Pick who speaks the line.");
  const cast = await buildCast(request.cast);
  const prompt = compileVideoPrompt({
    scene: speakingScene(request.scene, request.speaker),
    cast: cast.members,
    camera: request.camera,
    modelId: MODEL_IDS.minimaxH3,
    withReferences: true,
  });
  return {
    input: {
      stage: "generate",
      prompt,
      referenceImages: cast.images.map(dataUri),
      referenceAudios: [audioUrl],
      durationSec: speakingDuration(request.line.durationSec),
      ratio: request.ratio,
      resolution: request.resolution,
      seed: request.seed,
    },
    characterIds: cast.characterIds,
  };
}

export async function startSpeakingClip(request: SpeakingRequest, parentJobId?: string): Promise<Job> {
  const sound = await hostLine(request.line);
  const { input, characterIds } = await speakingInput(request, sound.url).catch(async (err) => {
    await deleteAsset(sound.id).catch(() => undefined);
    throw err;
  });
  return withUploads([sound], (uploads) => startJob({
    kind: "lipsync",
    modelId: MODEL_IDS.minimaxH3,
    input: {
      model: input,
      characterIds,
      prompt: `${request.scene}, saying ${quoted(request.line)}`,
      stylised: isStylised(request.camera),
      keepAssets: [lineAsset(request.line)],
      request,
    } satisfies JobInput<H3Input>,
    uploads,
    ...(parentJobId ? { parentJobId } : {}),
  }));
}

// Retry: the line and the clip are hosted again (the old links went when the
// job ended).
async function restartVoiceJob(job: Job): Promise<Job | undefined> {
  if (job.kind !== "lipsync") return undefined;
  const request = (job.input as JobInput).request as LipSyncRequest | SpeakingRequest | undefined;
  if (!request) return undefined;
  return "lipSyncOf" in request ? startLipSync(request.lipSyncOf, request.line, job.id) : startSpeakingClip(request, job.id);
}

export function registerVoice(): () => void {
  return onRestart(restartVoiceJob);
}
