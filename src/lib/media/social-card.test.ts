import { describe, expect, it } from "vitest";
import { likenessLines } from "./social-card";

describe("the end card's likeness line", () => {
  it("names the score, its band and who it's of, in the band's colour", () => {
    expect(likenessLines({ score: 92.4, names: ["Walt Harmon"] })).toEqual({ score: "Likeness 92", detail: "Strong match to Walt Harmon", token: "--match" });
    expect(likenessLines({ score: 71, names: ["Walt Harmon", "Samir Haddad"] })).toMatchObject({ detail: "Close match to Walt Harmon and Samir Haddad", token: "--check" });
    expect(likenessLines({ score: 40, names: ["A", "B", "C"] })).toMatchObject({ detail: "Loose match to A, B and C", token: "--drift" });
  });

  it("still reads with nobody named", () => {
    expect(likenessLines({ score: 85, names: [] }).detail).toBe("Strong match");
  });
});
