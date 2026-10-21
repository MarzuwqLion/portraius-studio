import { describe, expect, it } from "vitest";
import { scenePieces, slotsIn } from "./slots";

const join = (scene: string) => scenePieces(scene).map((p) => ("slot" in p ? `{${p.slot}}` : p.text)).join("");

describe("scenePieces", () => {
  it("splits a scene into text and slots, and joins back to the same scene", () => {
    const scene = "{lead} hands {second} the {prop}\non the pier";
    expect(scenePieces(scene)).toEqual([{ slot: "lead" }, { text: " hands " }, { slot: "second" }, { text: " the " }, { slot: "prop" }, { text: "\non the pier" }]);
    expect(join(scene)).toBe(scene);
  });

  it("leaves text without slots whole, and an empty scene empty", () => {
    expect(scenePieces("rain on a diner window")).toEqual([{ text: "rain on a diner window" }]);
    expect(scenePieces("")).toEqual([]);
  });

  it("lowercases slots the way slotsIn does", () => {
    expect(scenePieces("{Lead} waves")).toEqual([{ slot: "lead" }, { text: " waves" }]);
    expect(slotsIn("{Lead} waves")).toEqual(["lead"]);
  });
});
