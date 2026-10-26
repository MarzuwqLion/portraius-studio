import { describe, expect, it } from "vitest";
import { SHEET_MAX_SHOTS, SHEET_WIDTH, sheetCells, sheetHeight, sheetSummary } from "@/lib/media/likeness-sheet";
import type { Generation } from "@/lib/types/records";
import { scoreFor } from "./likeness-sheet";

const generation = (over: Partial<Generation>): Generation => ({ characterIds: ["walt"], assets: [], ...over }) as Generation;

describe("the likeness sheet", () => {
  it("lays out up to six shots, three across, inside the sheet", () => {
    const cells = sheetCells(9);
    expect(cells).toHaveLength(SHEET_MAX_SHOTS);
    expect(new Set(cells.map((c) => c.y)).size).toBe(2);
    for (const c of cells) {
      expect(c.x + c.w).toBeLessThanOrEqual(SHEET_WIDTH);
      expect(c.y + c.h).toBeLessThan(sheetHeight(9) - 80);
    }
  });

  it("is as tall as its rows", () => {
    expect(sheetHeight(2)).toBe(sheetHeight(3));
    expect(sheetHeight(4)).toBeGreaterThan(sheetHeight(3));
    expect(sheetHeight(6)).toBe(sheetHeight(9));
  });

  it("says how many shots and their average likeness", () => {
    expect(sheetSummary("Walt Harmon", [90, 85, 80])).toBe("Walt Harmon's best 3 shots, average likeness 85");
    expect(sheetSummary("Walt Harmon", [97])).toBe("Walt Harmon's best shot, average likeness 97");
  });

  it("uses each person's own score, and no score for stylised looks", () => {
    expect(scoreFor(generation({ identityScore: 88 }), "walt")).toBe(88);
    expect(scoreFor(generation({ characterIds: ["walt", "samir"], identityScore: 60, identityScores: { walt: 91, samir: 60 } }), "walt")).toBe(91);
    expect(scoreFor(generation({ characterIds: ["walt", "samir"], identityScore: 60, identityScores: { walt: null, samir: 60 } }), "walt")).toBeUndefined();
    expect(scoreFor(generation({ identityScore: 88, scoreNote: "stylised" }), "walt")).toBeUndefined();
  });
});
