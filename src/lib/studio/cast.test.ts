import { describe, expect, it } from "vitest";
import type { CharacterRecord } from "@/lib/types/records";
import { castOfTake, isAnimatedCast } from "./cast";

const record = (kind: "person" | "element", appearance?: "real" | "animated") => ({ kind, file: { kind, ...(appearance ? { appearance } : {}) } }) as CharacterRecord;

describe("isAnimatedCast", () => {
  it("is true only when every person is animated", () => {
    expect(isAnimatedCast([record("person", "animated")])).toBe(true);
    expect(isAnimatedCast([record("person", "animated"), record("element")])).toBe(true);
    expect(isAnimatedCast([record("person", "animated"), record("person", "real")])).toBe(false);
    // An older file has no appearance: a real person.
    expect(isAnimatedCast([record("person")])).toBe(false);
    expect(isAnimatedCast([record("element")])).toBe(false);
    expect(isAnimatedCast([])).toBe(false);
  });
});

describe("castOfTake", () => {
  it("uses the request's cast when the job kept it", () => {
    const cast = [
      { slot: "lead", characterId: "walt" },
      { slot: "second", characterId: "ruth" },
    ];
    expect(castOfTake("{lead} and {second} on a bench", ["walt", "ruth"], cast)).toEqual({ lead: "walt", second: "ruth" });
  });

  it("leaves out anyone no longer on the take", () => {
    expect(castOfTake("{lead} and {second}", ["walt"], [{ slot: "lead", characterId: "walt" }, { slot: "second", characterId: "gone" }])).toEqual({ lead: "walt" });
  });

  it("matches one character to one slot without a request", () => {
    expect(castOfTake("{lead} reading, then {lead} looks up", ["walt"])).toEqual({ lead: "walt" });
  });

  it("guesses nothing when it can't tell who is who", () => {
    expect(castOfTake("{lead} and {second}", ["walt", "ruth"])).toEqual({});
    expect(castOfTake("{lead} alone", [])).toEqual({});
  });
});
