// Keeps workflows/ in step with the app's prompts. After changing a prompt,
// regenerate with: npm run workflows
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { SHEET_PROMPT } from "@/lib/characters/sheet";
import { allWorkflows, type ApiWorkflow, type UiWorkflow } from "./comfy";

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
