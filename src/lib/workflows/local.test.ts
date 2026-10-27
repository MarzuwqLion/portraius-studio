// Keeps workflows/local/ in step with the app's local adapters and prompts.
// After changing either, regenerate with: npm run workflows
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { SHEET_PHOTOS } from "./comfy";
import type { ApiWorkflow, UiWorkflow } from "./graph";
import { localPrompts, localWorkflows } from "./local";
import NODES from "./local-nodes.json";

const dir = new URL("../../../workflows/", import.meta.url);
const samples = new URL("../../../public/samples/", import.meta.url);
const workflows = localWorkflows();
const prompts = localPrompts();
const text = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

if (import.meta.env.MODE === "workflows") {
  mkdirSync(new URL("local/", dir), { recursive: true });
  for (const [name, { ui, api }] of Object.entries(workflows)) {
    writeFileSync(new URL(`${name}.json`, dir), text(ui));
    writeFileSync(new URL(`${name}.api.json`, dir), text(api));
  }
}

function checkLinks(ui: UiWorkflow, api: ApiWorkflow) {
  const nodes = new Map(ui.nodes.map((n) => [n.id, n]));
  for (const [id, from, out, to, slot, type] of ui.links) {
    expect(nodes.get(from)!.outputs[out]!.links).toContain(id);
    expect(nodes.get(to)!.inputs[slot]!.link).toBe(id);
    expect(nodes.get(from)!.outputs[out]!.type).toBe(type);
  }
  for (const node of ui.nodes.filter((n) => n.type !== "MarkdownNote")) {
    const entry = api[String(node.id)]!;
    expect(entry.class_type).toBe(node.type);
    for (const input of node.inputs.filter((i) => i.link !== null)) expect(Array.isArray(entry.inputs[input.name])).toBe(true);
    expect(Object.keys(entry.inputs).filter((k) => k.startsWith("ui:") || k === "control_after_generate")).toEqual([]);
  }
}

// Files the graphs load: samples shipped in public/samples/, or the user's own.
const USER_FILES = new Set([...SHEET_PHOTOS, "my-line.mp3"]);
const LOADERS: Record<string, string> = { LoadImage: "image", LoadVideo: "file", LoadAudio: "audio" };

describe("local ComfyUI workflows", () => {
  for (const [path, { ui, api }] of Object.entries(workflows)) {
    const name = path.replace(/^local\//, "");
    const joined = prompts[name]!;

    it(`${name}: committed files match the app's local adapters`, () => {
      expect(existsSync(new URL(`${path}.json`, dir)), `run npm run workflows`).toBe(true);
      expect(readFileSync(new URL(`${path}.json`, dir), "utf8").replace(/\r\n/g, "\n")).toBe(text(ui));
      expect(readFileSync(new URL(`${path}.api.json`, dir), "utf8").replace(/\r\n/g, "\n")).toBe(text(api));
    });

    it(`${name}: links agree on both ends and in the API format`, () => checkLinks(ui, api));

    // The UI graph adds the widgets the adapters leave at their defaults; every
    // input the adapters set is in the API format unchanged. Node n of the
    // joined prompt is node n + 1 here: the note is node 1.
    it(`${name}: the API format is what the app sends, node for node`, () => {
      const shift = (v: unknown) => (Array.isArray(v) ? [String(Number(v[0]) + 1), v[1]] : v);
      expect(Object.keys(api)).toHaveLength(Object.keys(joined.prompt).length);
      for (const [id, node] of Object.entries(joined.prompt)) {
        const entry = api[String(Number(id) + 1)]!;
        expect(entry.class_type).toBe(node.class_type);
        for (const [input, value] of Object.entries(node.inputs)) expect(entry.inputs[input], `${node.class_type}.${input}`).toEqual(shift(value));
      }
    });

    it(`${name}: uses only ComfyUI's own nodes and loads files the note names`, () => {
      for (const node of Object.values(api)) {
        expect(Object.keys(NODES)).toContain(node.class_type);
        const field = LOADERS[node.class_type];
        if (!field) continue;
        const file = String(node.inputs[field]);
        expect(USER_FILES.has(file) || existsSync(new URL(file, samples)), file).toBe(true);
        expect(ui.nodes.find((n) => n.type === "MarkdownNote")!.widgets_values[0]).toContain(file);
      }
    });
  }

  it("draws the views from the sheet it just made, loading each model once", () => {
    const { api } = workflows["local/character-sheet"]!;
    const nodes = Object.values(api);
    expect(nodes.filter((n) => n.class_type === "LoadImage").map((n) => n.inputs.image)).toEqual(SHEET_PHOTOS);
    expect(nodes.filter((n) => n.class_type === "UNETLoader")).toHaveLength(1);
    expect(nodes.filter((n) => n.class_type === "SaveImage")).toHaveLength(5);
    // Each view's encoder takes two photos and the sheet's decoded image.
    const sheetImage = (nodes.find((n) => n.class_type === "SaveImage")!.inputs.images as [string, number])[0];
    const views = nodes.filter((n) => n.class_type === "TextEncodeQwenImageEditPlus" && n.inputs.prompt !== "").slice(1);
    expect(views).toHaveLength(4);
    for (const view of views) expect((view.inputs.image3 as [string, number])[0]).toBe(sheetImage);
  });

  it("recasts in two steps: Wan Animate moves the still Qwen draws, with the clip's own sound", () => {
    const { api } = workflows["local/recast"]!;
    const byType = (type: string) => Object.entries(api).filter(([, n]) => n.class_type === type);
    expect(byType("LoadImage").map(([, n]) => n.inputs.image).sort()).toEqual(["concert-original.webp", "walt-full-body.jpg"]);
    const [stillId] = byType("VAEDecode")[0]!;
    // The performer Wan Animate scales comes from Qwen's decoded still.
    const scaled = byType("ResizeImageMaskNode").map(([, n]) => n.inputs.input as [string, number]);
    expect(scaled.some(([from]) => from === stillId)).toBe(true);
    const save = byType("SaveVideo")[0]![1];
    const video = api[(save.inputs.video as [string, number])[0]]!;
    expect(api[(video.inputs.audio as [string, number])[0]]!.class_type).toBe("GetVideoComponents");
  });
});
