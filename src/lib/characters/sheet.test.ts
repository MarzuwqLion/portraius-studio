import { describe, expect, it } from "vitest";
import { SHEET_PROMPT, SHEET_VIEWS, candidateInput, candidatePrompt, compositeInput, sheetPrompt, viewInput, viewPrompt } from "./sheet";

const photo = (n: number) => ({ mime: "image/jpeg" as const, base64: `cGhvdG8${n}` });
const composite = { mime: "image/png" as const, base64: "Y29tcG9zaXRl" };

describe("sheet inputs", () => {
  it("draws the composite at 16:9 2K from every photo, with the spec's template", () => {
    const input = compositeInput([photo(1), photo(2), photo(3)]);
    expect(input).toEqual({ prompt: SHEET_PROMPT, references: [photo(1), photo(2), photo(3)], aspectRatio: "16:9", size: "2K", quality: "best" });
    expect(SHEET_PROMPT).toMatch(/^Create a character reference sheet of the same person shown in the attached photos\./);
    expect(SHEET_PROMPT).toContain("Do not beautify, slim, smooth the skin or change their age.");
    expect(SHEET_PROMPT).toContain("No text, labels, borders or watermarks.");
  });

  it("draws each view from the photos plus the composite", () => {
    for (const view of SHEET_VIEWS) {
      const input = viewInput(view, [photo(1), photo(2)], composite);
      expect(input.references).toEqual([photo(1), photo(2), composite]);
      expect(input.prompt).toBe(viewPrompt(view));
      expect(input.aspectRatio).toBe(view === "fullBody" ? "9:16" : "4:5");
    }
  });

  it("needs photos for a composite and a real description for a candidate", () => {
    expect(() => compositeInput([])).toThrow(RangeError);
    expect(() => candidateInput("tall")).toThrow(RangeError);
    expect(candidateInput("A woman in her fifties with a grey crew cut and laugh lines")).toMatchObject({ references: [], size: "1K", quality: "fast" });
    expect(candidateInput("A woman in her fifties with a grey crew cut").prompt).toContain("Not a real or famous person.");
  });
});

// Real is the default; an animated character's prompts have no photographic
// wording at any step (the four views drifted to a photoreal woman when they did).
const PHOTOREAL = /(?<!not a )photograph|pores|skin texture|studio background|smooth the skin/i;
const anime = { appearance: "animated" as const, artStyle: "Studio Ghibli-style hand-drawn anime." };

describe("animated sheet inputs", () => {
  it("keep the photoreal wording only for a real person", () => {
    expect(sheetPrompt()).toBe(SHEET_PROMPT);
    expect(sheetPrompt({ appearance: "real" })).toBe(SHEET_PROMPT);
    expect(viewPrompt("front", { appearance: "real" })).toBe(viewPrompt("front"));
    expect(candidatePrompt("A woman in her fifties with a grey crew cut", { appearance: "real" })).toMatch(/^A photograph/);
  });

  it("never ask an animated character for a photograph or skin texture", () => {
    const prompts = [
      sheetPrompt(anime, true),
      sheetPrompt(anime, false),
      ...SHEET_VIEWS.map((view) => viewPrompt(view, anime)),
      candidatePrompt("A girl with a messy auburn braid and a yellow raincoat", anime),
    ];
    for (const prompt of prompts) {
      expect(prompt).not.toMatch(PHOTOREAL);
      expect(prompt).toContain("Studio Ghibli-style hand-drawn anime");
    }
    for (const view of SHEET_VIEWS) {
      expect(viewPrompt(view, anime)).toContain("not a photograph");
      expect(viewPrompt(view, anime)).toContain("the same art style (Studio Ghibli-style hand-drawn anime)");
    }
  });

  it("draw a picked animated face as the same character, and photos as a drawn likeness", () => {
    expect(sheetPrompt(anime, false)).toMatch(/^Create a character reference sheet of the same character shown in the attached image\./);
    expect(sheetPrompt(anime, true)).toContain("the person shown in the attached photos, drawn as an animated character");
    expect(compositeInput([photo(1)], anime, false).prompt).toBe(sheetPrompt(anime, false));
    expect(viewInput("profile", [], composite, anime)).toMatchObject({ references: [composite], prompt: viewPrompt("profile", anime) });
  });

  it("let the description name the style when no art style is given", () => {
    const prompt = candidatePrompt("A Studio Ghibli-style girl with a messy auburn braid", { appearance: "animated" });
    expect(prompt).toContain("Follow any art style the description names.");
    expect(viewPrompt("front", { appearance: "animated" })).toContain("Draw them in the same art style,");
  });
});
