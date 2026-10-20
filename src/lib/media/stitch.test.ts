import { describe, expect, it } from "vitest";
import { AI_COMMENT, canStreamCopy, copyArgs, outputSeconds, parseProbe, stitchArgs } from "./stitch";

describe("outputSeconds", () => {
  it("reads the output time from ffmpeg's status line", () => {
    expect(outputSeconds("frame=  120 fps= 14 q=28.0 size=     512kB time=00:00:05.00 bitrate= 838.9kbits/s speed=0.6x")).toBe(5);
    expect(outputSeconds("size=1kB time=01:02:03.50 bitrate=1")).toBe(3723.5);
    expect(outputSeconds("Stream #0:0: Video: h264")).toBeUndefined();
  });
});

const SEEDANCE = [
  "  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 3906 kb/s, 24 fps, 24 tbr, 12288 tbn (default)",
  "  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 128 kb/s (default)",
].join("\n");
const H3 = "  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1344x768, 2400 kb/s, 25 fps, 25 tbr, 12800 tbn (default)";

describe("parseProbe and canStreamCopy", () => {
  it("reads codec, size, frame rate and audio from ffmpeg's stream lines", () => {
    expect(parseProbe(SEEDANCE)).toEqual({
      video: { codec: "h264", width: 1920, height: 1080, fps: 24 },
      audio: { codec: "aac", rate: 44100, channels: "stereo" },
    });
    expect(parseProbe(H3)).toEqual({ video: { codec: "h264", width: 1344, height: 768, fps: 25 } });
  });

  it("copies only when every shot already matches", () => {
    expect(canStreamCopy([parseProbe(SEEDANCE), parseProbe(SEEDANCE)])).toBe(true);
    expect(canStreamCopy([parseProbe(SEEDANCE), parseProbe(H3)])).toBe(false);
    expect(canStreamCopy([parseProbe(SEEDANCE), parseProbe(SEEDANCE.split("\n")[0]!)])).toBe(false);
    expect(canStreamCopy([])).toBe(false);
  });

  it("stream copy keeps the AI-generated comment", () => {
    expect(copyArgs("list.txt", "o.mp4")).toEqual(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "-metadata", `comment=${AI_COMMENT}`, "-movflags", "+faststart", "o.mp4"]);
  });
});

const graphOf = (args: string[]) => args[args.indexOf("-filter_complex") + 1]!;

describe("stitchArgs", () => {
  const clips = [
    { durationSec: 5, hasAudio: true },
    { durationSec: 4, hasAudio: false },
    { durationSec: 6, hasAudio: true },
  ];

  it("joins with concat when there are no crossfades", () => {
    const args = stitchArgs(["a", "b", "c"], clips, { width: 1920, height: 1080, crossfade: false }, "out.mp4");
    const graph = graphOf(args);
    expect(graph).toContain("[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[v][a]");
    expect(graph).toContain("scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080");
    expect(graph).toContain("fps=24");
    expect(args.slice(0, 6)).toEqual(["-i", "a", "-i", "b", "-i", "c"]);
    expect(args.at(-1)).toBe("out.mp4");
  });

  it("gives a silent shot a silent track", () => {
    const graph = graphOf(stitchArgs(["a", "b", "c"], clips, { width: 1280, height: 720, crossfade: false }, "o.mp4"));
    expect(graph).toContain("anullsrc=r=48000:cl=stereo,atrim=duration=4.000");
    expect(graph).not.toContain("[1:a]");
    expect(graph).toContain("[0:a]aresample=48000");
  });

  it("crossfades 6 frames at offsets that account for each overlap", () => {
    const graph = graphOf(stitchArgs(["a", "b", "c"], clips, { width: 1920, height: 1080, crossfade: true }, "o.mp4"));
    // 6 frames at 24 fps is 0.25 s: the second shot starts at 5 - 0.25, the third at 4.75 + 4 - 0.25.
    expect(graph).toContain("[v0][v1]xfade=transition=fade:duration=0.250:offset=4.750[x1]");
    expect(graph).toContain("[x1][v2]xfade=transition=fade:duration=0.250:offset=8.500[v]");
    expect(graph).toContain("[a0][a1]acrossfade=d=0.250[y1]");
    expect(graph).toContain("[y1][a2]acrossfade=d=0.250[a]");
    expect(graph).not.toContain("concat=");
  });

  it("tags the file as AI-generated", () => {
    const args = stitchArgs(["a"], [clips[0]!], { width: 1920, height: 1080, crossfade: true }, "o.mp4");
    expect(args[args.indexOf("-metadata") + 1]).toBe(`comment=${AI_COMMENT}`);
    expect(graphOf(args)).toContain("concat=n=1");
  });
});
