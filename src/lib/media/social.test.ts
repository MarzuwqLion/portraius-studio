import { describe, expect, it } from "vitest";
import { AI_COMMENT } from "./ai-tag";
import { END_CARD_SEC, SOCIAL_HEIGHT, SOCIAL_WIDTH, socialArgs, socialLayout, type SocialPlan } from "./social";

describe("socialLayout", () => {
  it("fits one landscape clip across the frame, centred", () => {
    const { clips } = socialLayout([{ width: 1920, height: 1080 }]);
    expect(clips[0]).toEqual({ x: 0, y: 437, width: 720, height: 406 });
  });

  it("stacks a landscape pair, one in each half", () => {
    const { cells, clips } = socialLayout([{ width: 1280, height: 720 }, { width: 1344, height: 768 }]);
    expect(cells.map((c) => c.y)).toEqual([0, SOCIAL_HEIGHT / 2]);
    expect(clips[0]!.y).toBeGreaterThan(0);
    expect(clips[1]!.y).toBeGreaterThan(SOCIAL_HEIGHT / 2);
    for (const c of clips) {
      expect(c.width % 2).toBe(0);
      expect(c.height % 2).toBe(0);
    }
  });

  it("sets a 9:16 pair side by side, and stacks a 4:5 pair, whichever is larger", () => {
    expect(socialLayout([{ width: 858, height: 1072 }, { width: 858, height: 1072 }]).cells[1]!.y).toBe(SOCIAL_HEIGHT / 2);
    const { cells, clips } = socialLayout([{ width: 720, height: 1280 }, { width: 720, height: 1280 }]);
    expect(cells.map((c) => c.x)).toEqual([0, SOCIAL_WIDTH / 2]);
    expect(clips[0]).toMatchObject({ width: 360, height: 640, x: 0, y: 320 });
  });
});

describe("socialArgs", () => {
  const plan: SocialPlan = {
    clips: [
      { width: 1280, height: 720, hasAudio: true },
      { width: 1280, height: 720, hasAudio: false },
    ],
    durationSec: 6,
    background: "0x64676b",
    overlay: true,
    endCard: true,
    audioFrom: 0,
  };

  it("places both clips on Studio grey, adds the labels and the end card, and tags the file", () => {
    const args = socialArgs({ clips: ["a.mp4", "b.mp4"], overlay: "labels.png", endCard: "card.png" }, plan, "out.mp4");
    const graph = args[args.indexOf("-filter_complex") + 1]!;
    expect(graph).toContain(`color=c=0x64676b:s=${SOCIAL_WIDTH}x${SOCIAL_HEIGHT}`);
    expect(graph).toContain("[0:v]scale=");
    expect(graph).toContain("[1:v]scale=");
    expect(graph).toContain("[2:v]overlay=0:0");          // the labels
    expect(graph).toContain("[3:v]scale=720:1280");        // the end card
    expect(graph).toContain("concat=n=2:v=1:a=1[v][a]");
    expect(graph).toContain("[0:a]aresample=48000");       // sound from the clip that has it
    expect(args).toEqual(expect.arrayContaining(["-loop", "1", "-t", END_CARD_SEC.toFixed(3), "-i", "card.png"]));
    expect(args[args.indexOf("-metadata") + 1]).toBe(`comment=${AI_COMMENT}`);
    expect(args.at(-1)).toBe("out.mp4");
  });

  it("goes silent when no clip has sound, and skips the card when it's off", () => {
    const args = socialArgs({ clips: ["a.mp4"] }, { ...plan, clips: [plan.clips[1]!], overlay: false, endCard: false, audioFrom: 0 }, "out.mp4");
    const graph = args[args.indexOf("-filter_complex") + 1]!;
    expect(graph).toContain("anullsrc=r=48000");
    expect(graph).not.toContain("concat");
    expect(args).not.toContain("-loop");
  });
});
