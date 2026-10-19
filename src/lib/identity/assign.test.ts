import { describe, expect, it } from "vitest";
import { assignFaces } from "./assign";

const at = (x: number) => [x, 0];

describe("assignFaces", () => {
  it("gives each cast member their nearest face, nearest pair first", () => {
    const faces = [at(0.1), at(5.2), at(9.9)];
    const cast = [
      { id: "lead", references: [at(0), at(0.3)] },
      { id: "second", references: [at(5)] },
    ];
    expect(assignFaces(faces, cast)).toEqual({ lead: 0.1, second: expect.closeTo(0.2, 5) });
  });

  it("never gives one face to two people", () => {
    // Both are closest to face 0; the second person gets the next face.
    const faces = [at(1), at(4)];
    const cast = [
      { id: "a", references: [at(1.1)] },
      { id: "b", references: [at(1.5)] },
    ];
    const result = assignFaces(faces, cast);
    expect(result.a).toBeCloseTo(0.1, 5);
    expect(result.b).toBeCloseTo(2.5, 5);
  });

  it("leaves a member with no face left as null", () => {
    expect(assignFaces([at(0)], [{ id: "a", references: [at(0)] }, { id: "b", references: [at(1)] }])).toEqual({ a: 0, b: null });
    expect(assignFaces([], [{ id: "a", references: [at(0)] }])).toEqual({ a: null });
  });
});
