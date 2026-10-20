// Director's export (spec: Workflow, step 6): every shot re-encoded to one
// size, 24 fps and AAC, then joined, with optional 6-frame crossfades. Shots
// without sound get silence, so the joined file always has an audio track.
//
// Unknowns row 15: single-thread ffmpeg.wasm re-encoded a 17 s, 3-shot scene
// at 1080p in about 140 s, past the 2-minute bar. So shots that already match
// (same codec, size, frame rate and audio) are joined by stream copy, and
// everything else is re-encoded at 720p (docs/notes/m6-notes.md).
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { loadFfmpeg } from "./video-prep";

export const STITCH_FPS = 24;
export const CROSSFADE_FRAMES = 6;

// Spec: Security (metadata row). Every exported MP4 says it's AI-generated.
export const AI_COMMENT = "AI-generated with Portraius Studio";

export interface StitchClip {
  durationSec: number;
  hasAudio: boolean;
}

// What ffmpeg reports about an input's streams.
export interface Probe {
  video?: { codec: string; width: number; height: number; fps: number };
  audio?: { codec: string; rate: number; channels: string };
}

export function parseProbe(log: string): Probe {
  const probe: Probe = {};
  const v = /Stream #\d+:\d+.*?Video: (\w+).*?, (\d{2,5})x(\d{2,5}).*?([\d.]+) fps/.exec(log);
  if (v) probe.video = { codec: v[1]!, width: Number(v[2]), height: Number(v[3]), fps: Number(v[4]) };
  const a = /Stream #\d+:\d+.*?Audio: (\w+).*?, (\d+) Hz, ([\w.()]+)/.exec(log);
  if (a) probe.audio = { codec: a[1]!, rate: Number(a[2]), channels: a[3]! };
  return probe;
}

// Stream copy only works when the inputs could already be one file.
export function canStreamCopy(probes: Probe[]): boolean {
  const first = probes[0];
  if (!first?.video || first.video.codec !== "h264") return false;
  const { video, audio } = first;
  return probes.every(
    (p) =>
      p.video?.codec === video.codec &&
      p.video.width === video.width &&
      p.video.height === video.height &&
      Math.abs(p.video.fps - video.fps) < 0.01 &&
      Boolean(p.audio) === Boolean(audio) &&
      (!p.audio || (p.audio.codec === audio!.codec && p.audio.rate === audio!.rate && p.audio.channels === audio!.channels)),
  );
}

export function copyArgs(listFile: string, output: string): string[] {
  return ["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-metadata", `comment=${AI_COMMENT}`, "-movflags", "+faststart", output];
}

export interface StitchOptions {
  width: number;
  height: number;
  crossfade: boolean;
}

const fixed = (n: number) => n.toFixed(3);

// The filter graph and arguments, separate from ffmpeg so they can be tested.
export function stitchArgs(inputs: string[], clips: StitchClip[], o: StitchOptions, output: string): string[] {
  const { width: w, height: h } = o;
  const graph: string[] = [];
  clips.forEach((clip, i) => {
    const d = fixed(clip.durationSec);
    graph.push(
      `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${STITCH_FPS},format=yuv420p,trim=duration=${d},setpts=PTS-STARTPTS[v${i}]`,
    );
    graph.push(
      clip.hasAudio
        ? `[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${d},asetpts=PTS-STARTPTS[a${i}]`
        : `anullsrc=r=48000:cl=stereo,atrim=duration=${d},aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`,
    );
  });

  if (!o.crossfade || clips.length < 2) {
    graph.push(`${clips.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${clips.length}:v=1:a=1[v][a]`);
  } else {
    const fade = CROSSFADE_FRAMES / STITCH_FPS;
    let offset = 0;
    let v = "v0";
    let a = "a0";
    for (let i = 1; i < clips.length; i++) {
      offset += clips[i - 1]!.durationSec - fade;
      const last = i === clips.length - 1;
      const nv = last ? "v" : `x${i}`;
      const na = last ? "a" : `y${i}`;
      graph.push(`[${v}][v${i}]xfade=transition=fade:duration=${fixed(fade)}:offset=${fixed(offset)}[${nv}]`);
      graph.push(`[${a}][a${i}]acrossfade=d=${fixed(fade)}[${na}]`);
      v = nv;
      a = na;
    }
  }

  return [
    ...inputs.flatMap((name) => ["-i", name]),
    "-filter_complex", graph.join(";"),
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-r", String(STITCH_FPS),
    "-c:a", "aac", "-b:a", "160k",
    "-metadata", `comment=${AI_COMMENT}`,
    "-movflags", "+faststart",
    output,
  ];
}

// "frame=  120 fps= 14 ... time=00:00:05.00 ..." on ffmpeg's status lines.
export function outputSeconds(line: string): number | undefined {
  const m = /time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(line);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : undefined;
}

// ffmpeg prints an input's streams when it has nothing else to do.
async function probe(ffmpeg: FFmpeg, name: string): Promise<Probe> {
  const lines: string[] = [];
  const listen = ({ message }: { message: string }) => lines.push(message);
  ffmpeg.on("log", listen);
  try {
    await ffmpeg.exec(["-hide_banner", "-i", name]);
  } finally {
    ffmpeg.off("log", listen);
  }
  return parseProbe(lines.filter((l) => l.includes("Stream #")).join("\n"));
}

export async function stitchClips(
  sources: { blob: Blob; durationSec: number }[],
  options: StitchOptions,
  onProgress?: (share: number) => void,
): Promise<Blob> {
  if (!sources.length) throw new RangeError("There are no shots to export.");
  const ffmpeg = await loadFfmpeg();
  const id = crypto.randomUUID();
  const inputs = sources.map((_, i) => `s${i}-${id}.mp4`);
  const output = `scene-${id}.mp4`;
  const list = `list-${id}.txt`;
  // ffmpeg's own progress share follows the first input, so a multi-shot join
  // reads 100% a third of the way in. Its "time=" log lines track the output.
  const total = sources.reduce((t, s) => t + s.durationSec, 0);
  const progress = ({ message }: { message: string }) => {
    const seconds = outputSeconds(message);
    if (seconds !== undefined && total > 0) onProgress?.(Math.min(1, seconds / total));
  };
  try {
    const probes: Probe[] = [];
    for (let i = 0; i < sources.length; i++) {
      await ffmpeg.writeFile(inputs[i]!, new Uint8Array(await sources[i]!.blob.arrayBuffer()));
      probes.push(await probe(ffmpeg, inputs[i]!));
    }
    ffmpeg.on("log", progress);
    let code: number;
    if (!options.crossfade && canStreamCopy(probes)) {
      await ffmpeg.writeFile(list, inputs.map((name) => `file '${name}'`).join("\n"));
      code = await ffmpeg.exec(copyArgs(list, output));
    } else {
      const clips = sources.map((s, i) => ({ durationSec: s.durationSec, hasAudio: Boolean(probes[i]!.audio) }));
      code = await ffmpeg.exec(stitchArgs(inputs, clips, options, output));
    }
    if (code !== 0) throw new Error("The scene couldn't be joined.");
    const data = await ffmpeg.readFile(output);
    return new Blob([data as Uint8Array<ArrayBuffer>], { type: "video/mp4" });
  } finally {
    ffmpeg.off("log", progress);
    for (const f of [...inputs, output, list]) await ffmpeg.deleteFile(f).catch(() => undefined);
  }
}
