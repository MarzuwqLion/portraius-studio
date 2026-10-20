import { describe, expect, it } from "vitest";
import { CAMERA, LOOKS } from "@/lib/presets/load";
import { CAMERA_GROUPS } from "@/lib/presets/schema";
import { cameraPhrases } from "./camera";
import { compileImagePrompt, compileVideoPrompt, slotsIn, type CastMember } from "./compile";

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
});

describe("slotsIn", () => {
  it("lists slots in order of first use", () => {
    expect(slotsIn("{lead} hands {Outfit} to {second}, then {lead} leaves")).toEqual(["lead", "outfit", "second"]);
  });
});
