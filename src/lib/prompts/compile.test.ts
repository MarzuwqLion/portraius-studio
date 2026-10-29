import { describe, expect, it } from "vitest";
import { CAMERA, LOOKS } from "@/lib/presets/load";
import { CAMERA_GROUPS } from "@/lib/presets/schema";
import { cameraPhrases } from "./camera";
import { REFERENCE_CLIP_RULES, compileImagePrompt, compileOneTakeShots, compileVideoPrompt, slotsIn, type CastMember } from "./compile";

const NANO = "vertexai/gemini-nano-banana-2.1";
const lead: CastMember = { slot: "lead", name: "Marcus", kind: "person", references: ["sheet", "photo"] };
const outfit: CastMember = { slot: "outfit", name: "Rust jacket", kind: "element", references: ["sheet"] };

describe("presets", () => {
  it("load every camera group and the looks", () => {
    for (const group of CAMERA_GROUPS) expect(CAMERA[group].length, group).toBeGreaterThan(0);
    expect(LOOKS).toHaveLength(8);
    expect(LOOKS.filter((l) => l.stylised).map((l) => l.id).sort()).toEqual(["anime", "cel-shaded", "claymation"]);
  });

  it("use per-model wording where a preset has it", () => {
    expect(cameraPhrases({ movement: "slow-push-in" }, NANO)).toEqual(["the camera slowly pushes in toward the subject"]);
    expect(cameraPhrases({ movement: "slow-push-in" }, "kling/kling-v3-omni")).toEqual(["slow dolly-in, steady"]);
  });
});

describe("compileImagePrompt", () => {
  it("builds legend, identity lock, scene, camera and realism in order (spec example)", () => {
    const prompt = compileImagePrompt({
      scene: "{lead} reading in a Tampa coffee shop, wearing the {outfit}",
      cast: [lead, outfit],
      camera: { size: "MCU", lens: "85mm", aperture: "f2", lighting: "soft-key", look: "warm-film" },
      modelId: NANO,
    });
    expect(prompt).toBe(
      [
        "Image 1 is the reference sheet for LEAD (Marcus). Image 2 is a photo of LEAD. Image 3 is the OUTFIT.",
        "Keep LEAD's exact face, skin tone, skin texture and hair from images 1 and 2. Do not beautify or change their age.",
        "LEAD reading in a Tampa coffee shop, wearing the OUTFIT.",
        "Medium close-up from the chest up, 85mm portrait lens with a compressed background, shot at f/2 with a shallow depth of field, soft key light from one side, warm colour-negative film look with golden highlights and gentle contrast.",
        "Natural skin texture with visible pores, real lens imperfections.",
      ].join("\n"),
    );
  });

  it("numbers references after the source image in edit mode", () => {
    const prompt = compileImagePrompt({ scene: "Put {lead} behind the counter", cast: [lead], camera: {}, modelId: NANO, editing: true });
    expect(prompt.split("\n")[0]).toBe("Image 1 is the image to edit. Image 2 is the reference sheet for LEAD (Marcus). Image 3 is a photo of LEAD.");
    expect(prompt).toContain("from images 2 and 3.");
  });

  it("adds each member's description and locks every person", () => {
    const second: CastMember = { slot: "second", name: "Ada", kind: "person", description: "silver braids, green linen jacket", references: ["sheet", "front"] };
    const prompt = compileImagePrompt({ scene: "{lead} and {second} share a table", cast: [lead, second], camera: {}, modelId: NANO });
    expect(prompt).toContain("Image 3 is the reference sheet for SECOND (Ada). Image 4 is a front portrait of SECOND.");
    expect(prompt).toContain("Keep SECOND's exact face, skin tone, skin texture and hair from images 3 and 4.");
    expect(prompt).toContain("SECOND: Silver braids, green linen jacket.");
  });

  it("locks an animated person to their design and style, without the realism line", () => {
    const toon: CastMember = { slot: "lead", name: "Hana", kind: "person", appearance: "animated", artStyle: "hand-drawn anime", references: ["sheet", "front"] };
    const prompt = compileImagePrompt({ scene: "{lead} waits at a rainy bus stop", cast: [toon, outfit], camera: {}, modelId: NANO });
    expect(prompt).toContain("Keep LEAD's exact character design, face, hair and colours from images 1 and 2, drawn in the same art style (hand-drawn anime). Do not make them photoreal.");
    expect(prompt).not.toMatch(/skin|pores/);
    expect(compileImagePrompt({ scene: "{lead} and {second}", cast: [toon, { ...lead, slot: "second" }], camera: {}, modelId: NANO, editing: true })).not.toContain("pores");
    expect(compileVideoPrompt({ scene: "{lead} waves", cast: [toon], camera: {}, modelId: NANO, withReferences: true })).toContain("drawn in the same art style");
  });

  it("is plain text-to-image with no cast, without the skin realism line", () => {
    expect(compileImagePrompt({ scene: "a teapot on a windowsill", cast: [], camera: {}, modelId: NANO })).toBe("A teapot on a windowsill.");
    expect(compileImagePrompt({ scene: "make it morning", cast: [], camera: {}, modelId: NANO, editing: true })).toContain("visible pores");
  });

  it("drops the realism line for a stylised look", () => {
    expect(compileImagePrompt({ scene: "{lead} waves", cast: [lead], camera: { look: "anime" }, modelId: NANO })).not.toContain("visible pores");
  });
});

describe("compileVideoPrompt", () => {
  it("uses names, not roles, when identity rides in the first frame", () => {
    const prompt = compileVideoPrompt({ scene: "{lead} turns toward the window", cast: [lead], camera: { movement: "slow-push-in" }, modelId: "byteplus/dreamina-seedance-2-5-260628", withReferences: false });
    expect(prompt).toBe("Marcus turns toward the window.\nThe camera slowly pushes in toward the subject.");
  });

  it("gives reference images their own legend", () => {
    const prompt = compileVideoPrompt({ scene: "{lead} walks out of a diner", cast: [lead], camera: {}, modelId: "byteplus/dreamina-seedance-2-5-260628", withReferences: true });
    expect(prompt.split("\n")[0]).toBe("Reference image 1 is the reference sheet for LEAD (Marcus). Reference image 2 is a photo of LEAD.");
  });

  // A blockout or simple 3D render (Use references, reference clip): it sets
  // camera, timing and blocking, so framing picks drop and the look stays.
  it("follows a reference clip for camera and timing, keeping the look", () => {
    const prompt = compileVideoPrompt({
      scene: "{lead} crosses the bridge as the lights go out",
      cast: [lead, outfit],
      camera: { size: "MCU", movement: "slow-push-in", lighting: "soft-key" },
      modelId: "byteplus/dreamina-seedance-2-5-260628",
      withReferences: true,
      referenceClip: true,
    });
    const lines = prompt.split("\n");
    expect(lines[0]).toContain("Reference image 3 is the OUTFIT.");
    expect(lines[1]).toBe(REFERENCE_CLIP_RULES);
    expect(prompt).not.toMatch(/pushes in|close-up/i);
    expect(lines.at(-1)).toMatch(/soft/i);
  });

  it("adds no clip rules without a clip", () => {
    const prompt = compileVideoPrompt({ scene: "{lead} waits", cast: [lead], camera: {}, modelId: "byteplus/dreamina-seedance-2-5-260628", withReferences: true });
    expect(prompt).not.toContain("Reference video 1");
  });
});

describe("compileOneTakeShots", () => {
  const KLING = "kling/kling-v3-omni";
  const second: CastMember = { slot: "second", name: "Ada", kind: "person", references: ["sheet", "photo"] };

  it("names each shot's own references with Kling's tokens, numbered across the cast", () => {
    const [one, two] = compileOneTakeShots({
      shots: [
        { scene: "{lead} slides the envelope across the table", camera: { size: "MS", movement: "slow-push-in" } },
        { scene: "{second} opens it", camera: { size: "CU" } },
      ],
      cast: [lead, second],
      location: "a late-night diner",
      modelId: KLING,
      limit: 512,
    });
    expect(one).toMatch(/^LEAD is the person in <<<image_1>>> and <<<image_2>>>, with the same face and hair\. LEAD slides the envelope across the table\. Location: A late-night diner\./);
    expect(one).toContain("Slow dolly-in, steady.");
    expect(two).toMatch(/^SECOND is the person in <<<image_3>>> and <<<image_4>>>/);
    expect(two).not.toContain("LEAD");
  });

  it("drops camera phrases before going over the limit, and refuses an action that can't fit", () => {
    const shots = [{ scene: "{lead} waits by the door", camera: { size: "MS", angle: "low", lens: "35mm", lighting: "neon", genre: "thriller", era: "1970s" } }];
    const [short] = compileOneTakeShots({ shots, cast: [lead], modelId: KLING, limit: 140 });
    expect(short!.length).toBeLessThanOrEqual(140);
    expect(short).toContain("LEAD waits by the door.");
    expect(() => compileOneTakeShots({ shots: [{ scene: "{lead} " + "walks ".repeat(100), camera: {} }], cast: [lead], modelId: KLING, limit: 512 })).toThrow(/Shot 1 is too long/);
  });

  it("gives an element its own line", () => {
    const [shot] = compileOneTakeShots({ shots: [{ scene: "{lead} puts on the {outfit}", camera: {} }], cast: [lead, outfit], modelId: KLING, limit: 512 });
    expect(shot).toContain("The OUTFIT is the one in <<<image_3>>>.");
  });
});

describe("slotsIn", () => {
  it("lists slots in order of first use", () => {
    expect(slotsIn("{lead} hands {Outfit} to {second}, then {lead} leaves")).toEqual(["lead", "outfit", "second"]);
  });
});
