import { describe, expect, it } from "vitest";
import {
  chainStale,
  continues,
  exportJobId,
  exportLabel,
  lineSourceJobId,
  mergeEdits,
  newScene,
  newShot,
  oneTakeDurations,
  oneTakeProblem,
  previousShot,
  shotCamera,
  shotCast,
  shotScene,
  shotSeed,
  shotSummary,
  type Scene,
  type Shot,
} from "./director";
import type { Job } from "@/lib/types/jobs";

function scene(): Scene {
  const s = newScene(1000);
  const one = newShot(s);
  s.nextShot = 1;
  const two = newShot(s, one);
  s.nextShot = 2;
  s.cast = [
    { slot: "lead", characterId: "walt" },
    { slot: "friend", characterId: "ada" },
  ];
  s.location = "A late-night diner";
  s.shots = [
    { ...one, action: "Rain streaks the window." },
    { ...two, action: "{lead} turns the envelope over.", size: "CU", movement: "slow-push-in" },
  ];
  return s;
}

describe("shots", () => {
  it("cast only the members a shot's action names", () => {
    const s = scene();
    expect(shotCast(s, s.shots[0]!)).toEqual([]);
    expect(shotCast(s, s.shots[1]!)).toEqual([{ slot: "lead", characterId: "walt" }]);
  });

  it("carry the location word for word", () => {
    const s = scene();
    expect(shotScene(s, s.shots[1]!)).toBe("{lead} turns the envelope over. Location: A late-night diner.");
    expect(shotScene({ ...s, location: " " }, s.shots[0]!)).toBe("Rain streaks the window.");
  });

  it("end the action before the location when it has no full stop", () => {
    const s = scene();
    const shot = { ...s.shots[1]!, action: "{lead} turns the envelope over" };
    expect(shotScene(s, shot)).toBe("{lead} turns the envelope over. Location: A late-night diner.");
    expect(shotScene(s, { ...shot, action: "{lead} looks up!" })).toBe("{lead} looks up! Location: A late-night diner.");
    // No location: the prompt compiler ends the sentence.
    expect(shotScene({ ...s, location: "" }, shot)).toBe("{lead} turns the envelope over");
  });

  it("take the film settings, and movement only when animating", () => {
    const s = scene();
    const still = shotCamera(s, s.shots[1]!, false);
    expect(still).toMatchObject({ genre: "drama", body: "digital-cinema", size: "CU" });
    expect(still.movement).toBeUndefined();
    expect(shotCamera(s, s.shots[1]!, true).movement).toBe("slow-push-in");
  });

  it("keep their seed when moved, and change it only on a re-roll", () => {
    const s = scene();
    const second = s.shots[1]!;
    const moved = { ...s, shots: [second, s.shots[0]!] };
    expect(shotSeed(moved, second)).toBe(shotSeed(s, second));
    expect(shotSeed(s, { ...second, rolls: 1 })).not.toBe(shotSeed(s, second));
    expect(shotSeed(s, s.shots[0]!)).not.toBe(shotSeed(s, second));
  });

  it("follow the pacing for length and copy the previous framing", () => {
    const s = { ...scene(), film: { pacing: "calm" } };
    const next = newShot(s, s.shots[1]);
    expect(next.durationSec).toBe(8);
    expect(next.size).toBe("CU");
    expect(next.movement).toBe("static");
    expect(next.anchorJobIds).toEqual([]);
  });

  it("export the lip-synced clip, then the final, otherwise the take", () => {
    const shot = { ...scene().shots[0]!, takeJobId: "t" } satisfies Shot;
    expect(exportJobId(shot)).toBe("t");
    expect(exportJobId({ ...shot, finalJobId: "f" })).toBe("f");
    expect(exportJobId({ ...shot, finalJobId: "f", lipSyncJobId: "l" })).toBe("l");
  });

  it("sync a line onto the final once it's done, otherwise the take", () => {
    const shot = { ...scene().shots[0]!, takeJobId: "t", finalJobId: "f" } satisfies Shot;
    expect(lineSourceJobId(shot, { status: "done" } as Job)).toBe("f");
    expect(lineSourceJobId(shot, { status: "running" } as Job)).toBe("t");
    expect(lineSourceJobId(shot, undefined)).toBe("t");
  });
});

describe("chaining", () => {
  it("never continues the first shot", () => {
    const s = scene();
    const first = { ...s.shots[0]!, continuity: "continue" as const };
    const chained = { ...s, shots: [first, { ...s.shots[1]!, continuity: "continue" as const }] };
    expect(continues(chained, chained.shots[0]!)).toBe(false);
    expect(continues(chained, chained.shots[1]!)).toBe(true);
    expect(previousShot(chained, chained.shots[1]!)?.id).toBe(first.id);
  });

  it("marks a continued take stale once the shot before it is re-rolled or moved", () => {
    const s = scene();
    s.shots[0] = { ...s.shots[0]!, takeJobId: "t1" };
    s.shots[1] = { ...s.shots[1]!, continuity: "continue", takeJobId: "t2", fromTakeJobId: "t1" };
    expect(chainStale(s, s.shots[1]!)).toBe(false);
    const rerolled = { ...s, shots: [{ ...s.shots[0]!, takeJobId: "t1b" }, s.shots[1]!] };
    expect(chainStale(rerolled, rerolled.shots[1]!)).toBe(true);
    const third = { ...newShot(s), takeJobId: "t3" };
    const moved = { ...s, shots: [s.shots[0]!, third, s.shots[1]!] };
    expect(chainStale(moved, s.shots[1]!)).toBe(true);
    // A cut is never stale, and a continued shot with no take yet has nothing to match.
    expect(chainStale(rerolled, { ...rerolled.shots[1]!, continuity: "cut" })).toBe(false);
    const { takeJobId: _t, ...untaken } = rerolled.shots[1]!;
    expect(chainStale(rerolled, untaken)).toBe(false);
  });
});

describe("one take", () => {
  it("keeps planned lengths that fit in 15 s and scales longer scenes to fill 15 s", () => {
    expect(oneTakeDurations([5, 4, 6])).toEqual([5, 4, 6]);
    expect(oneTakeDurations([8, 8])).toEqual([8, 7]);
    const six = oneTakeDurations([4, 4, 4, 4, 8, 15]);
    expect(six.reduce((t, d) => t + d, 0)).toBe(15);
    expect(Math.min(...six)).toBeGreaterThanOrEqual(1);
    expect(six[5]).toBeGreaterThan(six[0]!);
  });

  it("needs 2 to 6 described shots", () => {
    const s = scene();
    expect(oneTakeProblem(s)).toBeUndefined();
    expect(oneTakeProblem({ ...s, shots: [s.shots[0]!] })).toMatch(/at least 2/);
    expect(oneTakeProblem({ ...s, shots: Array(7).fill(s.shots[0]!) })).toMatch(/up to 6/);
    expect(oneTakeProblem({ ...s, shots: [s.shots[0]!, { ...s.shots[1]!, action: " " }] })).toMatch(/Describe/);
  });
});

describe("mergeEdits", () => {
  it("keeps where a continued shot started from and whether it's waiting", () => {
    const stored = scene();
    stored.shots[1] = { ...stored.shots[1]!, continuity: "continue", fromTakeJobId: "t1", waiting: true };
    const edited = { ...stored, shots: stored.shots.map((s) => ({ ...s, fromTakeJobId: undefined, waiting: undefined })) };
    edited.shots[1] = { ...edited.shots[1]!, continuity: "cut" };
    const merged = mergeEdits(stored, edited).shots[1]!;
    expect(merged).toMatchObject({ continuity: "cut", fromTakeJobId: "t1", waiting: true });
  });

  it("keeps what steps wrote while taking what was typed", () => {
    const stored = scene();
    stored.shots[0] = { ...stored.shots[0]!, anchorJobIds: ["a1", "a2"], anchorJobId: "a2", takeJobId: "t1", rolls: 2 };
    stored.exportGenerationIds = ["e1"];
    stored.oneTakeJobIds = ["k1"];
    const edited = scene();
    edited.id = stored.id;
    edited.shots = edited.shots.map((s, i) => ({ ...s, id: stored.shots[i]!.id }));
    edited.title = "The Letter";
    edited.shots[0] = { ...edited.shots[0]!, action: "Rain, harder now." };
    edited.shots.reverse();

    const merged = mergeEdits(stored, edited);
    expect(merged.title).toBe("The Letter");
    expect(merged.exportGenerationIds).toEqual(["e1"]);
    expect(merged.oneTakeJobIds).toEqual(["k1"]);
    expect(merged.shots.map((s) => s.id)).toEqual(edited.shots.map((s) => s.id));
    const first = merged.shots.find((s) => s.id === stored.shots[0]!.id)!;
    expect(first).toMatchObject({ action: "Rain, harder now.", anchorJobIds: ["a1", "a2"], anchorJobId: "a2", takeJobId: "t1", rolls: 2 });
  });

  it("keeps a shot added in the editor and drops one removed there", () => {
    const stored = scene();
    const edited = { ...stored, shots: [stored.shots[1]!, newShot(stored)] };
    const merged = mergeEdits(stored, edited);
    expect(merged.shots).toHaveLength(2);
    expect(merged.shots[0]!.id).toBe(stored.shots[1]!.id);
    expect(merged.shots[1]!.anchorJobIds).toEqual([]);
  });
});

describe("shot and export labels", () => {
  it("sums a shot's camera up in one line", () => {
    const s = scene();
    const shot: Shot = { ...s.shots[0]!, size: "WS", lens: "35mm", movement: "static", durationSec: 5 };
    expect(shotSummary(shot)).toBe("Wide · 35 mm · Static · 5 s");
    expect(shotSummary(shot, { length: false })).toBe("Wide · 35 mm · Static");
  });

  it("numbers exports oldest first, with length and transitions", () => {
    const s: Scene = { ...scene(), exportGenerationIds: ["new", "old"], exportInfo: { new: { crossfade: true, durationSec: 14.2 }, old: { crossfade: false, durationSec: 15 } } };
    expect(exportLabel(s, "new")).toBe("Export 2 · 14 s · crossfades");
    expect(exportLabel(s, "old")).toBe("Export 1 · 15 s · straight cuts");
    expect(exportLabel({ ...s, exportInfo: undefined }, "old")).toBe("Export 1");
  });
});
