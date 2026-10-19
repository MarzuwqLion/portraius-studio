import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { CharacterFile } from "@/lib/types/records";
import { CONSENT_STATEMENT } from "./consent";
import { CharacterFileError, exportCharacter, importCharacter, isLocked } from "./format";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const WEBM = [0x1a, 0x45, 0xdf, 0xa3];
const blob = (magic: number[], tag: string) => new Blob([new Uint8Array([...magic, ...new TextEncoder().encode(tag)])]);
const vector = (seed: number) => Array.from({ length: 128 }, (_, i) => Math.round(Math.sin(seed + i) * 1e6) / 1e6);

function person(overrides: Partial<CharacterFile> = {}): CharacterFile {
  return {
    format: "portraius.character",
    version: 1,
    id: "0b6f2c1e-6d5a-4f7e-9c11-2a8d7e1f3b40",
    kind: "person",
    origin: "photos",
    name: "Ada",
    description: "Silver braids, green linen jacket.",
    createdAt: "2026-10-20T10:00:00.000Z",
    updatedAt: "2026-10-20T10:05:00.000Z",
    photos: [
      { path: "photos/001.jpg", width: 1536, height: 2048 },
      { path: "photos/002.jpg", width: 2048, height: 1536 },
    ],
    sheet: {
      composite: "sheet/turnaround.png",
      views: { front: "sheet/front.png", threeQuarter: "sheet/three-quarter.png", profile: "sheet/profile.png", fullBody: "sheet/full-body.png" },
      model: "vertexai/gemini-nano-banana-2.1",
    },
    identity: { descriptors: [vector(1), vector(2)], mean: vector(3), model: "face-api ssd_mobilenetv1", threshold: 0.55 },
    consent: {
      subjectName: "Ada Lovelace",
      method: "self-check",
      statement: CONSENT_STATEMENT,
      acceptedAt: "2026-10-20T10:02:00.000Z",
      challenge: ["turn-left", "smile", "blink-twice"],
      checkClip: "consent/check.webm",
      matchScore: 88,
      appVersion: "0.1.0",
    },
    tags: ["lead"],
    ...overrides,
  };
}

function files(withClip = true): Map<string, Blob> {
  const map = new Map<string, Blob>([
    ["photos/001.jpg", blob(JPEG, "photo one")],
    ["photos/002.jpg", blob(JPEG, "photo two")],
    ["sheet/turnaround.png", blob(PNG, "composite")],
    ["sheet/front.png", blob(PNG, "front")],
    ["sheet/three-quarter.png", blob(PNG, "three quarter")],
    ["sheet/profile.png", blob(PNG, "profile")],
    ["sheet/full-body.png", blob(PNG, "full body")],
    ["thumb.jpg", blob(JPEG, "thumb")],
  ]);
  if (withClip) map.set("consent/check.webm", blob(WEBM, "clip"));
  return map;
}

async function entries(zipBlob: Blob): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(zipBlob);
  const out: Record<string, string> = {};
  for (const f of Object.values(zip.files)) if (!f.dir) out[f.name] = Buffer.from(await f.async("uint8array")).toString("base64");
  return out;
}

async function zipOf(contents: Record<string, string | Blob>): Promise<Blob> {
  const zip = new JSZip();
  for (const [name, value] of Object.entries(contents)) zip.file(name, value);
  return zip.generateAsync({ type: "blob" });
}

describe("export then import", () => {
  it("gives byte-identical character.json and files", async () => {
    const first = await exportCharacter({ file: person(), files: files() }, { includeClip: true });
    const { bundle, summary } = await importCharacter(first);
    const second = await exportCharacter(bundle, { includeClip: true });
    expect(await entries(second)).toEqual(await entries(first));
    expect(bundle.file).toEqual(person());
    expect(summary).toEqual({ name: "Ada", kind: "person", origin: "photos", consentAt: "2026-10-20T10:02:00.000Z", consentMethod: "self-check", locked: false });
  });

  it("splits face data and consent into their own folders", async () => {
    const names = Object.keys(await entries(await exportCharacter({ file: person(), files: files() }, { includeClip: true })));
    expect(names.sort()).toEqual(
      [
        "character.json", "consent/check.webm", "consent/consent.json", "identity/face.json", "photos/001.jpg", "photos/002.jpg",
        "sheet/front.png", "sheet/full-body.png", "sheet/profile.png", "sheet/three-quarter.png", "sheet/turnaround.png", "thumb.jpg",
      ].sort(),
    );
    const zip = await JSZip.loadAsync(await exportCharacter({ file: person(), files: files() }, { includeClip: true }));
    const json = JSON.parse(await zip.file("character.json")!.async("string"));
    expect(json).not.toHaveProperty("identity");
    expect(json).not.toHaveProperty("consent");
  });

  it("leaves the consent clip out unless the user includes it", async () => {
    const zipBlob = await exportCharacter({ file: person(), files: files() }, { includeClip: false });
    const names = Object.keys(await entries(zipBlob));
    expect(names).not.toContain("consent/check.webm");
    const { bundle } = await importCharacter(zipBlob);
    expect(bundle.file.consent).toBeDefined();
    expect(bundle.file.consent).not.toHaveProperty("checkClip");
  });

  it("round-trips a designed character with no photos, face data or consent", async () => {
    const designed = person({ origin: "designed", photos: [], identity: undefined, consent: undefined });
    delete designed.identity;
    delete designed.consent;
    const map = files(false);
    map.delete("photos/001.jpg");
    map.delete("photos/002.jpg");
    const { bundle, summary } = await importCharacter(await exportCharacter({ file: designed, files: map }, { includeClip: false }));
    expect(bundle.file).toEqual(designed);
    expect(summary.locked).toBe(false);
  });
});

describe("import", () => {
  it("locks a photo-based person with no consent record", async () => {
    const zipBlob = await exportCharacter({ file: person(), files: files() }, { includeClip: false });
    const zip = await JSZip.loadAsync(zipBlob);
    zip.remove("consent/consent.json");
    const { summary } = await importCharacter(await zip.generateAsync({ type: "blob" }));
    expect(summary).toMatchObject({ locked: true });
    expect(summary).not.toHaveProperty("consentAt");
  });

  it("refuses something that isn't a character file", async () => {
    await expect(importCharacter(new Blob(["not a zip"]))).rejects.toThrow(CharacterFileError);
    await expect(importCharacter(await zipOf({ "readme.txt": "hi" }))).rejects.toThrow("This file has no character.json.");
    await expect(importCharacter(await zipOf({ "character.json": "{" }))).rejects.toThrow("character.json isn't valid JSON.");
    await expect(importCharacter(await zipOf({ "character.json": JSON.stringify({ format: "other" }) }))).rejects.toThrow(/character.json has a problem at format/);
  });

  it("refuses a file whose images are missing or aren't what their names say", async () => {
    const valid = await JSZip.loadAsync(await exportCharacter({ file: person(), files: files() }, { includeClip: true }));
    valid.remove("sheet/profile.png");
    await expect(importCharacter(await valid.generateAsync({ type: "blob" }))).rejects.toThrow("This file is missing sheet/profile.png.");
    const disguised = await JSZip.loadAsync(await exportCharacter({ file: person(), files: files() }, { includeClip: true }));
    disguised.file("sheet/front.png", "<script>alert(1)</script>");
    await expect(importCharacter(await disguised.generateAsync({ type: "blob" }))).rejects.toThrow("sheet/front.png isn't the kind of file its name says.");
  });

  it("drops files outside the layout instead of storing them", async () => {
    const zip = await JSZip.loadAsync(await exportCharacter({ file: person(), files: files() }, { includeClip: true }));
    zip.file("../escape.png", new Uint8Array(PNG));
    zip.file("extra/notes.txt", "hello");
    const { bundle } = await importCharacter(await zip.generateAsync({ type: "blob" }));
    expect([...bundle.files.keys()].some((p) => p.includes("escape") || p.includes("notes"))).toBe(false);
  });

  it("refuses an element that carries face data", async () => {
    const element = person({ kind: "element", elementType: "outfit", origin: "photos" });
    delete element.consent;
    await expect(importCharacter(await exportCharacter({ file: element, files: files(false) }, { includeClip: false }))).rejects.toThrow("An element can't carry face data or consent.");
  });
});

describe("isLocked", () => {
  it("locks only photo-based people without consent", () => {
    expect(isLocked({ kind: "person", origin: "photos" })).toBe(true);
    expect(isLocked({ kind: "person", origin: "photos", consent: person().consent })).toBe(false);
    expect(isLocked({ kind: "person", origin: "designed" })).toBe(false);
    expect(isLocked({ kind: "element", origin: "photos" })).toBe(false);
  });
});

