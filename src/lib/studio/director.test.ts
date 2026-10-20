import { describe, expect, it } from "vitest";
import { exportJobId, mergeEdits, newScene, newShot, shotCamera, shotCast, shotScene, shotSeed, type Scene, type Shot } from "./director";

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

  it("export the final when there is one, otherwise the take", () => {
    const shot = { ...scene().shots[0]!, takeJobId: "t" } satisfies Shot;
    expect(exportJobId(shot)).toBe("t");
    expect(exportJobId({ ...shot, finalJobId: "f" })).toBe("f");
  });
});

describe("mergeEdits", () => {
  it("keeps what steps wrote while taking what was typed", () => {
    const stored = scene();
    stored.shots[0] = { ...stored.shots[0]!, anchorJobIds: ["a1", "a2"], anchorJobId: "a2", takeJobId: "t1", rolls: 2 };
    stored.exportGenerationIds = ["e1"];
    const edited = scene();
    edited.id = stored.id;
    edited.shots = edited.shots.map((s, i) => ({ ...s, id: stored.shots[i]!.id }));
    edited.title = "The Letter";
    edited.shots[0] = { ...edited.shots[0]!, action: "Rain, harder now." };
    edited.shots.reverse();

    const merged = mergeEdits(stored, edited);
    expect(merged.title).toBe("The Letter");
    expect(merged.exportGenerationIds).toEqual(["e1"]);
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
