import { describe, expect, it } from "vitest";
import { SHEET_PROMPT, SHEET_VIEWS, candidateInput, compositeInput, viewInput, viewPrompt } from "./sheet";

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
