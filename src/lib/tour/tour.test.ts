import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { describe, expect, it } from "vitest";
import { importCharacter } from "@/lib/characters/format";
import { posterName } from "@/lib/media/poster";
import { newScene, newShot, type Scene } from "@/lib/studio/director";
import { parseTour, untouchedSampleScene } from "./tour";

const dir = new URL("../../../public/samples/", import.meta.url);
const tour = parseTour(JSON.parse(readFileSync(new URL("tour.json", dir), "utf8")));

function filesIn(): string[] {
  const names = [tour.character.file, tour.character.sheet.src, ...tour.character.views.map((v) => v.src)];
  for (const section of tour.sections) {
    for (const { media: m } of section.items) {
      if (m.kind === "image" || m.kind === "video") names.push(m.src);
      if (m.kind === "split") names.push(m.original, m.recast);
      if (m.kind === "beforeAfter") names.push(m.before, m.after);
    }
  }
  // Every clip's first frame rides beside it as its poster (npm run posters).
  return [...names, ...names.filter((n) => n.endsWith(".mp4")).map(posterName)];
}

describe("Tour samples", () => {
  it("names only files that are in public/samples, and every clip has its poster", () => {
    for (const name of filesIn()) expect(existsSync(new URL(name, dir)), name).toBe(true);
  });

  it("ships no file the manifest doesn't use, and stays small for GitHub Pages", () => {
    const used = new Set([...filesIn(), "tour.json"]);
    const present = readdirSync(dir);
    expect(present.filter((f) => !used.has(f))).toEqual([]);
    const total = present.reduce((n, f) => n + statSync(new URL(f, dir)).size, 0);
    expect(total).toBeLessThan(25 * 1024 * 1024);
  });

  it("labels models by name, never by Router ID", () => {
    for (const section of tour.sections) for (const item of section.items) expect(item.model ?? "").not.toContain("/");
  });

  it("ships a designed character that imports unlocked, with face data", async () => {
    const zip = new Blob([readFileSync(new URL(tour.character.file, dir))]);
    const { bundle, summary } = await importCharacter(zip);
    expect(summary).toMatchObject({ name: tour.character.name, kind: "person", origin: "designed", locked: false });
    expect(bundle.file.identity?.descriptors.length).toBeGreaterThan(0);
  });
});

describe("untouchedSampleScene", () => {
  const sample = (id: string, characterId: string, take?: string): Scene => {
    const s = newScene(1);
    return { ...s, id, title: "The Letter, again", cast: [{ slot: "lead", characterId }], shots: [{ ...newShot(s), ...(take ? { takeJobId: take } : {}) }] };
  };

  it("finds the sample scene made before, while it has no takes", () => {
    expect(untouchedSampleScene([sample("a", "walt")], "walt")?.id).toBe("a");
  });

  it("makes another once the old one has a take, or for someone else", () => {
    expect(untouchedSampleScene([sample("a", "walt", "job-1")], "walt")).toBeUndefined();
    expect(untouchedSampleScene([sample("a", "ruth")], "walt")).toBeUndefined();
    expect(untouchedSampleScene([{ ...sample("a", "walt"), title: "My scene" }], "walt")).toBeUndefined();
  });
});
