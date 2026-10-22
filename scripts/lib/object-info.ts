// Checks Workflow (API) prompts against the node definitions a ComfyUI
// publishes at /object_info: every node type exists, every input name is one
// the node takes, every choice is one of its options, every required input is
// there, and every link points at a real output of the right type. Shared by
// npm run workflows:check and npm run local:check. Nothing executes.

type Spec = [unknown, Record<string, unknown>?];
type Inputs = { required?: Record<string, Spec>; optional?: Record<string, Spec> };
type Allowed = { options?: unknown[]; min?: number; max?: number; link?: boolean; required?: boolean; type?: string };

export interface NodeDef {
  input: Inputs;
  output?: string[];
}

export type Catalog = Record<string, NodeDef>;

export type ApiPrompt = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

export async function loadCatalog(source: string, key?: string): Promise<Catalog> {
  const res = await fetch(source, { headers: key ? { "X-API-Key": key } : {} });
  if (!res.ok) throw new Error(`object_info: HTTP ${res.status}`);
  return (await res.json()) as Catalog;
}

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
        const template = opts.template as { names?: string[]; prefix?: string; max?: number; min?: number; input?: Inputs };
        const names = template.names ?? Array.from({ length: template.max ?? 0 }, (_, i) => `${template.prefix}${i}`);
        const slot = Object.values(template.input?.required ?? {})[0]?.[0];
        names.forEach((n, i) => (out[`${id}.${n}`] = { link: true, required: required && i < (template.min ?? 1), ...(typeof slot === "string" ? { type: slot } : {}) }));
      } else if (Array.isArray(type)) out[id] = { options: type, required };
      else if (type === "COMBO") out[id] = { options: opts.options as unknown[], required, type: "COMBO" };
      else out[id] = { min: opts.min as number | undefined, max: opts.max as number | undefined, required, ...(typeof type === "string" ? { type } : {}) };
    }
  }
}

// Whether an output of type `from` may feed an input of type `to`.
function compatible(from: string | undefined, to: string | undefined): boolean {
  if (!from || !to) return true;
  if (from === "*" || to === "*" || to.startsWith("COMFY_") || from.startsWith("COMFY_")) return true;
  const accepted = to.split(",");
  return from.split(",").some((t) => accepted.includes(t));
}

// isUserFile: inputs whose value is a file the visitor supplies (an upload or
// a model file), so the definitions' option list can't know it.
export function checkPrompt(where: string, prompt: ApiPrompt, catalog: Catalog, isUserFile: (classType: string, input: string) => boolean): string[] {
  const problems: string[] = [];
  for (const [id, node] of Object.entries(prompt)) {
    const at = `${where} node ${id} (${node.class_type})`;
    const def = catalog[node.class_type];
    if (!def) {
      problems.push(`${at}: no such node`);
      continue;
    }
    const allowed: Record<string, Allowed> = {};
    flatten(def.input, "", node.inputs, allowed);
    for (const [name, value] of Object.entries(node.inputs)) {
      const a = allowed[name];
      if (!a) problems.push(`${at}: takes no input ${name}`);
      else if (Array.isArray(value)) {
        const [source, index] = value as [string, number];
        const from = prompt[source];
        if (!from) problems.push(`${at}: ${name} links to missing node ${source}`);
        else {
          const outputs = catalog[from.class_type]?.output;
          if (outputs && index >= outputs.length) problems.push(`${at}: ${name} links to output ${index} of ${from.class_type}, which has ${outputs.length}`);
          else if (outputs && !compatible(outputs[index], a.type)) problems.push(`${at}: ${name} wants ${a.type}, gets ${outputs[index]} from ${from.class_type}`);
        }
      } else if (a.options && !isUserFile(node.class_type, name) && !a.options.includes(value)) problems.push(`${at}: ${name} ${JSON.stringify(value)} isn't an option`);
      else if (typeof value === "number" && ((a.min !== undefined && value < a.min) || (a.max !== undefined && value > a.max))) problems.push(`${at}: ${name} ${value} is out of range`);
    }
    for (const [name, a] of Object.entries(allowed)) if (a.required && !(name in node.inputs)) problems.push(`${at}: missing ${name}`);
  }
  return problems;
}
