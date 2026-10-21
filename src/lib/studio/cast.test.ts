import { describe, expect, it } from "vitest";
import { castOfTake } from "./cast";

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
