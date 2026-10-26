import { describe, expect, it } from "vitest";
import { MODEL_IDS } from "@/lib/registry/models";
import { DEFAULT_MODEL, modelFor } from "./video";

const walt = [{ slot: "lead", characterId: "walt" }];

describe("modelFor", () => {
  it("keeps Seedance as the default for video without people", () => {
    expect(DEFAULT_MODEL).toBe(MODEL_IDS.seedance);
    expect(modelFor({ mode: "text", cast: [], model: MODEL_IDS.seedance }, false)).toBe(MODEL_IDS.seedance);
    expect(modelFor({ mode: "image", cast: [], model: MODEL_IDS.seedance }, false)).toBe(MODEL_IDS.seedance);
  });

  it("sends a cast to H3, since Seedance refuses photoreal people", () => {
    expect(modelFor({ mode: "still", cast: walt, model: MODEL_IDS.seedance }, false)).toBe(MODEL_IDS.minimaxH3);
    expect(modelFor({ mode: "references", cast: walt, model: MODEL_IDS.seedance }, false)).toBe(MODEL_IDS.minimaxH3);
  });

  it("sends a first frame with a face to H3", () => {
    expect(modelFor({ mode: "image", cast: [], model: MODEL_IDS.seedance }, true)).toBe(MODEL_IDS.minimaxH3);
  });

  it("keeps the chosen model for a cast of animated characters (October 26)", () => {
    expect(modelFor({ mode: "still", cast: walt, model: MODEL_IDS.seedance }, false, true)).toBe(MODEL_IDS.seedance);
    expect(modelFor({ mode: "references", cast: walt, model: MODEL_IDS.seedance }, false, true)).toBe(MODEL_IDS.seedance);
    // Director: an anchor of an animated cast is theirs, face or not.
    expect(modelFor({ mode: "image", cast: walt, model: MODEL_IDS.seedance }, true, true)).toBe(MODEL_IDS.seedance);
    expect(modelFor({ mode: "still", cast: walt, model: MODEL_IDS.minimaxH3 }, false, true)).toBe(MODEL_IDS.minimaxH3);
  });

  it("leaves an explicit H3 choice alone", () => {
    expect(modelFor({ mode: "text", cast: [], model: MODEL_IDS.minimaxH3 }, false)).toBe(MODEL_IDS.minimaxH3);
  });
});
