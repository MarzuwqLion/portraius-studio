// The 9:16 social export (spec: Remix links, Social export; Recast, Result
// view): one clip fitted into a 720x1280 frame on Studio grey, or a Recast's
// original and result in one frame, with an optional end card. 720p, not
// 1080p: single-thread ffmpeg.wasm is too slow at 1080p (Unknowns row 15).
import { AI_COMMENT } from "./ai-tag";
import { outputSeconds, probeInput } from "./stitch";
import { loadFfmpeg } from "./video-prep";

export const SOCIAL_WIDTH = 720;
export const SOCIAL_HEIGHT = 1280;
export const SOCIAL_FPS = 24;
export const END_CARD_SEC = 2;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

function fit(cells: Box[], clips: { width: number; height: number }[]): Box[] {
  return cells.map((cell, i) => {
    const clip = clips[i]!;
    const scale = Math.min(cell.width / clip.width, cell.height / clip.height);
    const width = even(clip.width * scale);
    const height = even(clip.height * scale);
    return { x: cell.x + Math.round((cell.width - width) / 2), y: cell.y + Math.round((cell.height - height) / 2), width, height };
  });
}

const area = (boxes: Box[]) => boxes.reduce((n, b) => n + b.width * b.height, 0);

// Where each clip sits in the frame. A pair stacks or sits side by side,
// whichever shows the clips larger (a tie goes side by side).
export function socialLayout(clips: { width: number; height: number }[]): { cells: Box[]; clips: Box[] } {
  const W = SOCIAL_WIDTH;
  const H = SOCIAL_HEIGHT;
  if (clips.length === 1) {
    const cells = [{ x: 0, y: 0, width: W, height: H }];
    return { cells, clips: fit(cells, clips) };
  }
  const stacked = [{ x: 0, y: 0, width: W, height: H / 2 }, { x: 0, y: H / 2, width: W, height: H / 2 }];
  const sideBySide = [{ x: 0, y: 0, width: W / 2, height: H }, { x: W / 2, y: 0, width: W / 2, height: H }];
  const a = fit(stacked, clips);
  const b = fit(sideBySide, clips);
  return area(a) > area(b) ? { cells: stacked, clips: a } : { cells: sideBySide, clips: b };
}

export interface SocialPlan {
  clips: { width: number; height: number; hasAudio: boolean }[];
  durationSec: number;     // the result's length; a shorter original holds its last frame
  background: string;      // ffmpeg colour, from the --seamless token
  overlay: boolean;        // input after the clips: a full-frame PNG of labels
  endCard: boolean;        // input after that: the end card PNG, looped
  audioFrom?: number;      // which clip's sound to keep; silence when none
}

const fixed = (n: number) => n.toFixed(3);

// The filter graph and arguments, apart from ffmpeg so they can be tested.
export function socialArgs(inputs: { clips: string[]; overlay?: string; endCard?: string }, plan: SocialPlan, output: string): string[] {
  const { clips: boxes } = socialLayout(plan.clips);
  const d = fixed(plan.durationSec);
  const graph: string[] = [];
  graph.push(`color=c=${plan.background}:s=${SOCIAL_WIDTH}x${SOCIAL_HEIGHT}:r=${SOCIAL_FPS}:d=${d}[base0]`);
  plan.clips.forEach((_, i) => {
    const box = boxes[i]!;
    graph.push(
      `[${i}:v]scale=${box.width}:${box.height},setsar=1,fps=${SOCIAL_FPS},tpad=stop_mode=clone:stop_duration=${d},trim=duration=${d},setpts=PTS-STARTPTS[c${i}]`,
    );
    graph.push(`[base${i}][c${i}]overlay=${box.x}:${box.y}:eof_action=pass[base${i + 1}]`);
  });
  let video = `base${plan.clips.length}`;
  let next = plan.clips.length;
  if (plan.overlay) {
    graph.push(`[${video}][${next}:v]overlay=0:0,format=yuv420p[framed]`);
    video = "framed";
    next++;
  } else {
    graph.push(`[${video}]format=yuv420p[framed]`);
    video = "framed";
  }
  graph.push(
    plan.audioFrom !== undefined && plan.clips[plan.audioFrom]?.hasAudio
      ? `[${plan.audioFrom}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${d},asetpts=PTS-STARTPTS[amain]`
      : `anullsrc=r=48000:cl=stereo,atrim=duration=${d},aformat=sample_fmts=fltp:channel_layouts=stereo[amain]`,
  );
  if (plan.endCard) {
    const card = fixed(END_CARD_SEC);
    graph.push(`[${next}:v]scale=${SOCIAL_WIDTH}:${SOCIAL_HEIGHT},setsar=1,fps=${SOCIAL_FPS},trim=duration=${card},setpts=PTS-STARTPTS,format=yuv420p[card]`);
    graph.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${card},aformat=sample_fmts=fltp:channel_layouts=stereo[acard]`);
    graph.push(`[${video}][amain][card][acard]concat=n=2:v=1:a=1[v][a]`);
  } else {
    graph.push(`[${video}]null[v]`, `[amain]anull[a]`);
  }

  return [
    ...inputs.clips.flatMap((name) => ["-i", name]),
    ...(inputs.overlay ? ["-i", inputs.overlay] : []),
    ...(inputs.endCard ? ["-loop", "1", "-framerate", String(SOCIAL_FPS), "-t", fixed(END_CARD_SEC), "-i", inputs.endCard] : []),
    "-filter_complex", graph.join(";"),
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-r", String(SOCIAL_FPS),
    "-c:a", "aac", "-b:a", "160k",
    "-metadata", `comment=${AI_COMMENT}`,
    "-movflags", "+faststart",
    output,
  ];
}

export interface SocialSource {
  blob: Blob;
  width: number;
  height: number;
}

// Runs the export. overlay and endCard are PNGs the caller drew.
export async function exportSocial(
  sources: SocialSource[],
  // audioOrder: clips whose sound to keep, first choice first; silence when none has any.
  options: { durationSec: number; background: string; overlay?: Blob; endCard?: Blob; audioOrder?: number[] },
  onProgress?: (share: number) => void,
): Promise<Blob> {
  if (!sources.length || sources.length > 2) throw new RangeError("The social export takes one clip, or an original and its recast.");
  const ffmpeg = await loadFfmpeg();
  const id = crypto.randomUUID();
  const clipNames = sources.map((_, i) => `social-${i}-${id}.mp4`);
  const overlayName = options.overlay ? `social-labels-${id}.png` : undefined;
  const cardName = options.endCard ? `social-card-${id}.png` : undefined;
  const output = `social-${id}.out.mp4`;
  const total = options.durationSec + (options.endCard ? END_CARD_SEC : 0);
  const progress = ({ message }: { message: string }) => {
    const seconds = outputSeconds(message);
    if (seconds !== undefined && total > 0) onProgress?.(Math.min(1, seconds / total));
  };
  const files = [...clipNames, ...(overlayName ? [overlayName] : []), ...(cardName ? [cardName] : []), output];
  try {
    const clips: SocialPlan["clips"] = [];
    for (let i = 0; i < sources.length; i++) {
      await ffmpeg.writeFile(clipNames[i]!, new Uint8Array(await sources[i]!.blob.arrayBuffer()));
      const probe = await probeInput(ffmpeg, clipNames[i]!);
      clips.push({ width: sources[i]!.width, height: sources[i]!.height, hasAudio: Boolean(probe.audio) });
    }
    if (overlayName) await ffmpeg.writeFile(overlayName, new Uint8Array(await options.overlay!.arrayBuffer()));
    if (cardName) await ffmpeg.writeFile(cardName, new Uint8Array(await options.endCard!.arrayBuffer()));
    const audioFrom = (options.audioOrder ?? [0]).find((i) => clips[i]?.hasAudio);
    const plan: SocialPlan = {
      clips,
      durationSec: options.durationSec,
      background: options.background,
      overlay: Boolean(overlayName),
      endCard: Boolean(cardName),
      ...(audioFrom !== undefined ? { audioFrom } : {}),
    };
    ffmpeg.on("log", progress);
    const code = await ffmpeg.exec(socialArgs({ clips: clipNames, ...(overlayName ? { overlay: overlayName } : {}), ...(cardName ? { endCard: cardName } : {}) }, plan, output));
    if (code !== 0) throw new Error("The 9:16 export didn't finish.");
    const data = await ffmpeg.readFile(output);
    return new Blob([data as Uint8Array<ArrayBuffer>], { type: "video/mp4" });
  } finally {
    ffmpeg.off("log", progress);
    for (const f of files) await ffmpeg.deleteFile(f).catch(() => undefined);
  }
}
