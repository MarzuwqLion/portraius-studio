// Keeps workflows/ in step with the app's prompts. After changing a prompt,
// regenerate with: npm run workflows
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { MAX_SHOT_PROMPT } from "@/lib/adapters/kling-omni";
import { SHEET_PROMPT } from "@/lib/characters/sheet";
import { preset } from "@/lib/presets/load";
import { settingPrompt } from "@/lib/studio/recast";
import { SHEET_PHOTOS, allWorkflows } from "./comfy";
import { WALT_FILES, type ApiWorkflow, type UiWorkflow } from "./graph";
import { EDIT_SOURCE } from "./studio";

const dir = new URL("../../../workflows/", import.meta.url);
const workflows = allWorkflows();
const text = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

if (import.meta.env.MODE === "workflows") {
  mkdirSync(dir, { recursive: true });
  for (const [name, { ui, api }] of Object.entries(workflows)) {
    writeFileSync(new URL(`${name}.json`, dir), text(ui));
    writeFileSync(new URL(`${name}.api.json`, dir), text(api));
  }
}

function checkGraph(ui: UiWorkflow, api: ApiWorkflow) {
  const nodes = new Map(ui.nodes.map((n) => [n.id, n]));
  for (const [id, from, out, to, slot, type] of ui.links) {
    expect(nodes.get(from)!.outputs[out]!.links).toContain(id);
    expect(nodes.get(to)!.inputs[slot]!.link).toBe(id);
    expect(nodes.get(from)!.outputs[out]!.type).toBe(type);
  }
  for (const node of ui.nodes) {
    if (node.type === "MarkdownNote" || node.mode === 4) {
      expect(api[String(node.id)]).toBeUndefined();
      continue;
    }
    const entry = api[String(node.id)]!;
    expect(entry.class_type).toBe(node.type);
    // Every connected input is a link in the API format too.
    for (const input of node.inputs.filter((i) => i.link !== null)) expect(Array.isArray(entry.inputs[input.name])).toBe(true);
    expect(Object.keys(entry.inputs)).not.toContain("control_after_generate");
  }
}

describe("ComfyUI workflows", () => {
  for (const [name, { ui, api }] of Object.entries(workflows)) {
    it(`${name}: committed files match the app's prompts`, () => {
      expect(existsSync(new URL(`${name}.json`, dir)), `run npm run workflows`).toBe(true);
      expect(readFileSync(new URL(`${name}.json`, dir), "utf8").replace(/\r\n/g, "\n")).toBe(text(ui));
      expect(readFileSync(new URL(`${name}.api.json`, dir), "utf8").replace(/\r\n/g, "\n")).toBe(text(api));
    });

    it(`${name}: links agree on both ends and in the API format`, () => checkGraph(ui, api));
  }

  it("draws the sheet with the app's own template and Nano Banana 2.1 settings", () => {
    const sheet = Object.values(workflows["character-sheet"]!.api).find((n) => n._meta.title === "Turnaround sheet")!;
    expect(sheet.inputs).toMatchObject({ prompt: SHEET_PROMPT, model: "Gemini Nano Banana 2.1", "model.aspect_ratio": "16:9", "model.resolution": "2K", "model.thinking_level": "HIGH", system_prompt: "" });
  });

  // Seedance refuses photoreal people (CLAUDE.md): no Seedance node may have
  // a character image, or a still drawn from one, anywhere upstream.
  it("never sends a person to Seedance", () => {
    const people = new Set([WALT_FILES.sheet, WALT_FILES.front, EDIT_SOURCE, ...SHEET_PHOTOS]);
    for (const [name, { api }] of Object.entries(workflows)) {
      const upstream = (id: string, seen = new Set<string>()): Set<string> => {
        for (const v of Object.values(api[id]!.inputs)) {
          if (Array.isArray(v) && !seen.has(v[0])) {
            seen.add(v[0]);
            upstream(v[0], seen);
          }
        }
        return seen;
      };
      for (const [id, node] of Object.entries(api).filter(([, n]) => n.class_type.startsWith("ByteDance2"))) {
        const files = [...upstream(id)].map((u) => api[u]!).filter((n) => n.class_type === "LoadImage").map((n) => n.inputs.image);
        expect(files.filter((f) => people.has(String(f))), `${name} node ${id} (${node._meta.title})`).toEqual([]);
      }
    }
  });

  it("uses Nano Banana 2.1 for every image", () => {
    const images = Object.values(workflows).flatMap(({ api }) => Object.values(api).filter((n) => n.class_type.startsWith("GeminiNanoBanana")));
    expect(images.length).toBeGreaterThan(20);
    for (const node of images) expect(node).toMatchObject({ class_type: "GeminiNanoBanana2V2", inputs: { model: "Gemini Nano Banana 2.1", system_prompt: "" } });
  });

  it("fits the one-take in Kling's limits: storyboards add up to the duration, each prompt within 512 characters", () => {
    const kling = Object.values(workflows["kling-one-take"]!.api).find((n) => n.class_type === "KlingOmniProImageToVideoNode")!.inputs;
    const shots = Number(String(kling.storyboards).split(" ")[0]);
    let total = 0;
    for (let i = 1; i <= shots; i++) {
      total += Number(kling[`storyboards.storyboard_${i}_duration`]);
      expect(String(kling[`storyboards.storyboard_${i}_prompt`]).length).toBeLessThanOrEqual(MAX_SHOT_PROMPT);
      expect(kling[`storyboards.storyboard_${i}_prompt`]).toContain("<<<image_1>>> and <<<image_2>>>");
    }
    expect(total).toBe(kling.duration);
    expect(kling).toMatchObject({ model_name: "kling-v3-omni", resolution: "720p" });
  });

  it("recasts like the app: H3 performs, HappyHorse changes the setting, the clip's own audio goes back on", () => {
    const { api } = workflows.recast!;
    const byTitle = (title: string) => Object.entries(api).find(([, n]) => n._meta.title === title)!;
    const [performerId] = byTitle("MiniMax H3 (motion transfer)");
    const [, setting] = byTitle("HappyHorse (new setting)");
    expect(setting.inputs.video).toEqual([performerId, 0]);
    expect(setting.inputs["model.prompt"]).toBe(settingPrompt(String(preset("concert-stage")!.recipe.params?.setting)));
    // The joined clip's audio is the source clip's, not the edit's.
    const joins = Object.values(api).filter((n) => n.class_type === "CreateVideo");
    expect(joins).toHaveLength(2);
    for (const join of joins) {
      const [audioFrom] = join.inputs.audio as [string, number];
      expect(api[(api[audioFrom]!.inputs.video as [string, number])[0]]!.class_type).toBe("LoadVideo");
    }
  });

  it("makes it real with the app's skin settings at the default strength", () => {
    const skin = Object.values(workflows["make-it-real"]!.api).find((n) => n.class_type === "MagnificImageSkinEnhancerNode")!;
    expect(skin.inputs).toMatchObject({ mode: "faithful", "mode.skin_detail": 80, sharpen: 10, smart_grain: 4 });
  });

  it("draws Director anchors at the Director's setting and joins the takes in shot order", () => {
    const { api } = workflows["director-scene"]!;
    const anchors = Object.values(api).filter((n) => n._meta.title.endsWith("anchor"));
    expect(anchors.map((n) => n.inputs["model.thinking_level"])).toEqual(["MINIMAL", "MINIMAL", "MINIMAL"]);
    const join = Object.values(api).find((n) => n.class_type === "ConcatenateVideo")!;
    const order = [0, 1, 2].map((i) => api[(join.inputs[`videos.video${i}`] as [string, number])[0]]!._meta.title);
    expect(order).toEqual(["Shot 1 take (MiniMax H3)", "Shot 2 take (MiniMax H3)", "Shot 3 take (MiniMax H3)"]);
  });

  it("animates the character on H3 and the empty shot on a Seedance draft, with the final left off", () => {
    const { ui, api } = workflows["still-first-video"]!;
    const types = Object.values(api).map((n) => n.class_type);
    expect(types).toEqual(expect.arrayContaining(["GeminiNanoBanana2V2", "MinimaxHailuo03FirstLastFrameNode", "ByteDance2FirstLastFrameNode"]));
    // The final is a second run, from the draft's ID: off in the graph, absent from the API format.
    expect(types).not.toContain("ByteDance2DraftToFinalVideoNode");
    expect(ui.nodes.find((n) => n.type === "ByteDance2DraftToFinalVideoNode")!.mode).toBe(4);
    const draft = Object.values(api).find((n) => n.class_type === "ByteDance2FirstLastFrameNode")!;
    expect(draft.inputs).toMatchObject({ model: "Seedance 2.5 Draft", "model.resolution": "480p" });
  });
});
