import { describe, expect, it } from "vitest";
import { MODEL_IDS } from "@/lib/registry/models";
import { DEFAULT_MODEL, clipUsableAsIs, modelFor } from "./video";

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

  // Use references with only elements (a location, a prop): no person for Seedance to refuse.
  it("keeps the chosen model for a cast of elements in Use references only", () => {
    expect(modelFor({ mode: "references", cast: walt, model: MODEL_IDS.seedance }, false, false, true)).toBe(MODEL_IDS.seedance);
    // Image, then animate draws a still first, which may have someone in it.
    expect(modelFor({ mode: "still", cast: walt, model: MODEL_IDS.seedance }, false, false, true)).toBe(MODEL_IDS.minimaxH3);
  });

  it("leaves an explicit H3 choice alone", () => {
    expect(modelFor({ mode: "text", cast: [], model: MODEL_IDS.minimaxH3 }, false)).toBe(MODEL_IDS.minimaxH3);
  });
});

// A reference clip Seedance takes as it is skips the browser re-encode, which
// took minutes for a 30 s, 2880x1800 game capture.
describe("clipUsableAsIs", () => {
  const mp4 = (mb: number) => ({ type: "video/mp4", size: mb * 1024 * 1024 });
  it("takes an MP4 within Seedance's frame size, 30 s and the Worker's 100 MB", () => {
    expect(clipUsableAsIs(mp4(77), { durationSec: 29.55, width: 2880, height: 1800 })).toBe(true);
  });
  it("re-encodes anything else", () => {
    expect(clipUsableAsIs(mp4(77), { durationSec: 31, width: 2880, height: 1800 })).toBe(false);
    expect(clipUsableAsIs(mp4(77), { durationSec: 20, width: 4096, height: 2160 })).toBe(false);
    expect(clipUsableAsIs(mp4(120), { durationSec: 20, width: 1920, height: 1080 })).toBe(false);
    expect(clipUsableAsIs({ type: "video/quicktime", size: 1024 }, { durationSec: 5, width: 1920, height: 1080 })).toBe(false);
  });
});
