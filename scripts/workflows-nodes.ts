// npm run workflows:nodes: refreshes src/lib/workflows/local-nodes.json, the
// node definitions the local graphs' UI format is built from (slots, widget
// order, defaults). Takes them from a ComfyUI's /object_info, trimmed to the
// nodes the local adapters use and to what the UI format needs. Run it after
// ComfyUI changes a node the local adapters use, then npm run workflows.
//
// Reads Comfy Cloud's definitions with COMFY_API_KEY from the shell, like
// workflows:check; OBJECT_INFO_URL points it at another ComfyUI instead
// (http://127.0.0.1:8188/object_info, no key).
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { localSamples } from "../src/lib/adapters/local/samples.ts";
import { requestBody } from "../src/lib/registry/adapters.ts";
import type { LocalBody } from "../src/lib/registry/local-body.ts";
import { loadCatalog } from "./lib/object-info.ts";

const source = process.env.OBJECT_INFO_URL?.trim() || "https://cloud.comfy.org/api/object_info";
const key = process.env.COMFY_API_KEY?.trim();
if (!process.env.OBJECT_INFO_URL && !key) {
  console.error("Set COMFY_API_KEY in your shell first, or OBJECT_INFO_URL to a local ComfyUI's /object_info.");
  process.exit(2);
}
const catalog = (await loadCatalog(source, process.env.OBJECT_INFO_URL ? undefined : key)) as unknown as Record<string, Record<string, unknown>>;

// What the UI format reads from an input's options; the rest (tooltips,
// ranges, long option lists) stays in ComfyUI.
const KEEP = ["default", "control_after_generate", "image_upload", "video_upload", "audio_upload"];

function trimSpec([type, opts = {}]: [unknown, Record<string, unknown>?]): [unknown, Record<string, unknown>] {
  const kept: Record<string, unknown> = Object.fromEntries(KEEP.filter((k) => k in opts).map((k) => [k, opts[k]]));
  if (type === "COMFY_DYNAMICCOMBO_V3") {
    kept.options = (opts.options as { key: string; inputs: Record<string, unknown> }[]).map((o) => ({ key: o.key, inputs: trimGroup(o.inputs) }));
  } else if (type === "COMFY_AUTOGROW_V3") {
    const t = opts.template as Record<string, unknown>;
    kept.template = { ...t, input: trimGroup(t.input as Record<string, unknown>) };
  } else if (type === "COMFY_MATCHTYPE_V3") {
    kept.template = opts.template;
  } else if (type === "COMBO" && Array.isArray(opts.options)) {
    kept.options = opts.options.slice(0, 1);
  }
  // A plain option list keeps only its first entry, the fallback default.
  return [Array.isArray(type) ? type.slice(0, 1) : type, kept];
}

function trimGroup(group: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const part of ["required", "optional"]) {
    const entries = group[part] as Record<string, [unknown, Record<string, unknown>?]> | undefined;
    if (entries) out[part] = Object.fromEntries(Object.entries(entries).map(([name, spec]) => [name, trimSpec(spec)]));
  }
  return out;
}

// The nodes every local adapter uses, from the same sample requests local:check
// builds (the presets the exported graphs read need Vite, so they aren't
// built here), plus any already in workflows/local/.
const image = { mime: "image/jpeg" as const, base64: "x" };
const samples = localSamples({ front: image, fullBody: image, firstFrame: image, sheet: image, still: image, clip: "local-input:clip.mp4", line: "local-input:line.mp3" });
const prompts = samples.map((s) => (requestBody(s.modelId, s.input) as LocalBody).prompt as Record<string, { class_type: string }>);
const dir = "workflows/local";
if (existsSync(dir)) for (const f of readdirSync(dir).filter((f) => f.endsWith(".api.json"))) prompts.push(JSON.parse(readFileSync(`${dir}/${f}`, "utf8")));
const used = [...new Set(prompts.flatMap((p) => Object.values(p).map((n) => n.class_type)))].sort();
const missing = used.filter((t) => !catalog[t]);
if (missing.length) {
  console.error(`${source} has no ${missing.join(", ")}`);
  process.exit(1);
}
const nodes = Object.fromEntries(
  used.map((t) => {
    const def = catalog[t]!;
    return [t, { display_name: def.display_name, input: trimGroup(def.input as Record<string, unknown>), output: def.output, output_name: def.output_name }];
  }),
);
writeFileSync("src/lib/workflows/local-nodes.json", `${JSON.stringify(nodes, null, 2)}\n`);
console.log(`Wrote ${used.length} node definitions from ${source}.`);
