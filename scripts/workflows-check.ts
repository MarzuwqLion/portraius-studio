// npm run workflows:check: checks workflows/*.api.json against the node
// definitions ComfyUI publishes (Comfy Cloud's /api/object_info): every node
// type exists, every input name is one the node takes, and every choice is
// one of its options. Free to run; nothing executes. Reads COMFY_API_KEY from
// the shell, like smoke.
//
// OBJECT_INFO_URL points it at another ComfyUI instead, such as a local one
// (http://127.0.0.1:8188/object_info, no key). Where that ComfyUI has the
// Portraius node pack installed, the pack's example graph is checked too.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Spec = [unknown, Record<string, unknown>?];
type Inputs = { required?: Record<string, Spec>; optional?: Record<string, Spec> };
type Allowed = { options?: unknown[]; min?: number; max?: number; link?: boolean; required?: boolean };

const source = process.env.OBJECT_INFO_URL?.trim() || "https://cloud.comfy.org/api/object_info";
const key = process.env.COMFY_API_KEY?.trim();
if (!process.env.OBJECT_INFO_URL && !key) {
  console.error("Set COMFY_API_KEY in your shell first, or OBJECT_INFO_URL to a local ComfyUI's /object_info.");
  process.exit(2);
}
const res = await fetch(source, { headers: key && !process.env.OBJECT_INFO_URL ? { "X-API-Key": key } : {} });
if (!res.ok) throw new Error(`object_info: HTTP ${res.status}`);
const catalog = (await res.json()) as Record<string, { input: Inputs }>;

// Dynamic inputs (a model choice with its own inputs, a growing list of image
// slots) are flattened to the dotted names a prompt uses. The chosen model's
// inputs are required as ComfyUI requires them; a growing list isn't an
// input itself, and only its first `min` slots are required.
function flatten(inputs: Inputs, prefix: string, chosen: Record<string, unknown>, out: Record<string, Allowed>): void {
  for (const [group, required] of [[inputs.required, true], [inputs.optional, false]] as const) {
    for (const [name, [type, opts = {}]] of Object.entries(group ?? {})) {
      const id = prefix ? `${prefix}.${name}` : name;
      if (type === "COMFY_DYNAMICCOMBO_V3") {
        const options = opts.options as { key: string; inputs: Inputs }[];
        out[id] = { options: options.map((o) => o.key), required };
        const pick = options.find((o) => o.key === chosen[id]);
        if (pick) flatten(pick.inputs, id, chosen, out);
      } else if (type === "COMFY_AUTOGROW_V3") {
        // A list of names, or a prefix counted from 0 ("video0", "video1", ...).
        const template = opts.template as { names?: string[]; prefix?: string; max?: number; min?: number };
        const names = template.names ?? Array.from({ length: template.max ?? 0 }, (_, i) => `${template.prefix}${i}`);
        names.forEach((n, i) => (out[`${id}.${n}`] = { link: true, required: required && i < (template.min ?? 1) }));
      } else if (Array.isArray(type)) out[id] = { options: type, required };
      else if (type === "COMBO") out[id] = { options: opts.options as unknown[], required };
      else out[id] = { min: opts.min as number | undefined, max: opts.max as number | undefined, required };
    }
  }
}

const USER_FILES = new Set(["LoadImage.image", "LoadVideo.file"]);

const PACK_EXAMPLE ="custom_nodes/comfyui-portraius-characters/tests/portraius-character-still.api.json";
const files = readdirSync("workflows")
  .filter((f) => f.endsWith(".api.json"))
  .map((f) => join("workflows", f));
if (catalog.PortraiusLoadCharacter && existsSync(PACK_EXAMPLE)) files.push(PACK_EXAMPLE);
else console.log(`skipped ${PACK_EXAMPLE}: this ComfyUI doesn't have the Portraius node pack`);

const problems: string[] = [];
for (const file of files) {
  const prompt = JSON.parse(readFileSync(file, "utf8")) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
  for (const [id, node] of Object.entries(prompt)) {
    const where = `${file} node ${id} (${node.class_type})`;
    const def = catalog[node.class_type];
    if (!def) {
      problems.push(`${where}: no such node`);
      continue;
    }
    const allowed: Record<string, Allowed> = {};
    flatten(def.input, "", node.inputs, allowed);
    for (const [name, value] of Object.entries(node.inputs)) {
      const a = allowed[name];
      if (!a) problems.push(`${where}: takes no input ${name}`);
      else if (Array.isArray(value)) continue; // a link to another node
      // Image and video files are whatever the user puts in ComfyUI/input/.
      else if (a.options && !USER_FILES.has(`${node.class_type}.${name}`) && !a.options.includes(value)) problems.push(`${where}: ${name} ${JSON.stringify(value)} isn't an option`);
      else if (typeof value === "number" && ((a.min !== undefined && value < a.min) || (a.max !== undefined && value > a.max))) problems.push(`${where}: ${name} ${value} is out of range`);
    }
    for (const [name, a] of Object.entries(allowed)) if (a.required && !(name in node.inputs)) problems.push(`${where}: missing ${name}`);
  }
  console.log(`checked ${file}: ${Object.keys(prompt).length} nodes`);
}
if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log(`Every node, input and option matches the definitions at ${source}.`);
