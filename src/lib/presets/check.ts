// presets:check (spec: Contribution flow): every file in presets/ against its
// schema, plus what a schema can't say: file names match IDs, IDs are unique,
// models are allowed, prompt slots are declared, camera picks exist,
// thumbnails stay small, and no brand or celebrity names.
import { isAllowedModel } from "@/lib/registry/models";
import { slotsIn } from "@/lib/prompts/slots";
import { CAMERA_GROUPS, cameraFile, lookFile, presetFile, type CameraFile } from "./schema";

export const THUMBNAIL_MAX_BYTES = 200 * 1024;

// Kept short on purpose: it catches the obvious, review catches the rest.
export const BLOCKED_NAMES = [
  "adidas", "apple", "iphone", "barbie", "chanel", "coca-cola", "disney", "ferrari", "gucci", "harry potter",
  "lego", "louis vuitton", "marvel", "mcdonald's", "nike", "pepsi", "pixar", "pokemon", "pokémon", "prada",
  "rolex", "starbucks", "star wars", "higgsfield",
  "beyonce", "beyoncé", "drake", "elon musk", "kim kardashian", "keanu reeves", "rihanna", "ryan gosling",
  "taylor swift", "tom cruise", "brad pitt", "zendaya", "timothee chalamet", "timothée chalamet",
];

export interface PresetSource {
  path: string;  // relative to the repo, e.g. presets/image/film-still.json
  data: unknown;
}

const FOLDER_TYPE: Record<string, "recast" | "image" | "video"> = { recast: "recast", image: "image", video: "video" };

function blockedIn(text: string): string[] {
  const lower = text.toLowerCase();
  return BLOCKED_NAMES.filter((name) => new RegExp(`(^|[^\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "u").test(lower));
}

// Returns one line per problem; an empty list means the presets pass.
export function checkPresets(sources: PresetSource[], thumbnailBytes: (path: string) => number | undefined): string[] {
  const problems: string[] = [];
  const cameraFiles: CameraFile[] = [];
  const ids = new Map<string, string>();

  // Camera files first: preset camera picks are checked against them.
  for (const { path, data } of sources.filter((s) => s.path.includes("/camera/"))) {
    const parsed = cameraFile.safeParse(data);
    if (parsed.success) cameraFiles.push(parsed.data);
    else problems.push(`${path}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  }
  const options = (group: string) => cameraFiles.find((f) => f.group === group)?.options.map((o) => o.id) ?? [];
  const lookIds: string[] = [];

  for (const { path, data } of sources.filter((s) => s.path.includes("/looks/"))) {
    const parsed = lookFile.safeParse(data);
    if (!parsed.success) {
      problems.push(`${path}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      continue;
    }
    lookIds.push(parsed.data.id);
    if (!path.endsWith(`/${parsed.data.id}.json`)) problems.push(`${path}: the file name should be ${parsed.data.id}.json`);
    for (const name of blockedIn(`${parsed.data.label} ${parsed.data.phrase}`)) problems.push(`${path}: mentions "${name}"`);
  }

  for (const { path, data } of sources.filter((s) => !s.path.includes("/camera/") && !s.path.includes("/looks/"))) {
    const parsed = presetFile.safeParse(data);
    if (!parsed.success) {
      problems.push(`${path}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      continue;
    }
    const p = parsed.data;
    const template = path.endsWith("/_template.json");
    const folder = path.split("/").at(-2) ?? "";
    if (!template) {
      if (FOLDER_TYPE[folder] !== p.type) problems.push(`${path}: type "${p.type}" belongs in presets/${p.type}/`);
      if (!path.endsWith(`/${p.id}.json`)) problems.push(`${path}: the file name should be ${p.id}.json`);
      const other = ids.get(p.id);
      if (other) problems.push(`${path}: the ID "${p.id}" is already used by ${other}`);
      ids.set(p.id, path);
    }
    if (!isAllowedModel(p.recipe.model)) problems.push(`${path}: "${p.recipe.model}" isn't a model the app allows`);
    const declared = new Set(p.recipe.slots.map((s) => s.slot));
    for (const slot of slotsIn(p.recipe.prompt)) if (!declared.has(slot)) problems.push(`${path}: the prompt uses {${slot}}, which isn't in slots`);
    for (const [group, id] of Object.entries(p.recipe.camera ?? {})) {
      if (group === "look") {
        if (!lookIds.includes(id)) problems.push(`${path}: look "${id}" doesn't exist`);
      } else if (!(CAMERA_GROUPS as readonly string[]).includes(group)) {
        problems.push(`${path}: "${group}" isn't a camera group`);
      } else if (!options(group).includes(id)) {
        problems.push(`${path}: ${group} "${id}" doesn't exist`);
      }
    }
    for (const name of blockedIn(`${p.title} ${p.recipe.prompt}`)) problems.push(`${path}: mentions "${name}"`);
    if (p.thumbnail && !template) {
      const thumbPath = `${path.slice(0, path.lastIndexOf("/"))}/${p.thumbnail}`;
      const bytes = thumbnailBytes(thumbPath);
      if (bytes === undefined) problems.push(`${path}: thumbnail ${p.thumbnail} is missing`);
      else if (bytes > THUMBNAIL_MAX_BYTES) problems.push(`${path}: thumbnail is ${Math.round(bytes / 1024)} KB; keep it under 200 KB`);
    }
  }
  return problems;
}
