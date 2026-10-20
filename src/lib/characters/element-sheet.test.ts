import { describe, expect, it } from "vitest";
import { ELEMENT_TYPES, elementCompositeInput, elementSheetPrompt, elementViewInput, elementViewPrompt } from "./element-sheet";
import { SHEET_VIEWS, viewAspect, viewLabel } from "./sheet";

const photo = { mime: "image/jpeg" as const, base64: "cGhvdG8=" };
const composite = { mime: "image/png" as const, base64: "Y29tcG9zaXRl" };

describe("element sheets", () => {
  it("draws the composite at 16:9 2K from every photo", () => {
    expect(elementCompositeInput("prop", [photo, photo])).toEqual({ prompt: elementSheetPrompt("prop"), references: [photo, photo], aspectRatio: "16:9", size: "2K", quality: "best" });
    expect(() => elementCompositeInput("prop", [])).toThrow(RangeError);
  });

  it("asks every prompt to leave out logos, brand names and people", () => {
    for (const type of ELEMENT_TYPES) {
      for (const prompt of [elementSheetPrompt(type), ...SHEET_VIEWS.map((v) => elementViewPrompt(type, v))]) {
        expect(prompt).toContain("No people, no logos or brand names, no text, labels, borders or watermarks.");
        expect(prompt).not.toContain("trademark");
      }
    }
  });

  it("shows outfits on an invisible mannequin and props on plain grey", () => {
    expect(elementSheetPrompt("outfit")).toContain("invisible mannequin");
    expect(elementSheetPrompt("prop")).toContain("Plain mid-grey studio background");
    expect(elementSheetPrompt("location")).toContain("The location is empty.");
  });

  it("draws each view from the photos plus the composite, at the view's shape", () => {
    const back = elementViewInput("outfit", "profile", [photo], composite);
    expect(back.references).toEqual([photo, composite]);
    expect(back.prompt).toMatch(/^Draw the back view of the outfit/);
    expect(back.aspectRatio).toBe("3:4");
    expect(elementViewInput("location", "front", [photo], composite).aspectRatio).toBe("16:9");
  });

  it("labels the file's view slots for the element type", () => {
    expect(viewLabel("profile", "outfit")).toBe("Back");
    expect(viewLabel("fullBody", "prop")).toBe("Detail");
    expect(viewLabel("front", "location")).toBe("Wide");
    expect(viewLabel("profile")).toBe("Profile");
    expect(viewAspect("front", "location")).toBe("16 / 9");
    expect(viewAspect("fullBody")).toBe("9 / 16");
  });
});
