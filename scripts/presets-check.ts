// npm run presets:check: validates every file in presets/ (CONTRIBUTING.md).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { checkPresets, type PresetSource } from "../src/lib/presets/check.ts";

const root = join(import.meta.dirname, "..");

function jsonFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return jsonFiles(path);
    return entry.name.endsWith(".json") ? [path] : [];
  });
}

const sources: PresetSource[] = [];
const problems: string[] = [];
for (const file of jsonFiles(join(root, "presets"))) {
  const path = relative(root, file).replaceAll("\\", "/");
  try {
    sources.push({ path, data: JSON.parse(readFileSync(file, "utf8")) });
  } catch (err) {
    problems.push(`${path}: not valid JSON (${(err as Error).message})`);
  }
}
problems.push(...checkPresets(sources, (path) => (existsSync(join(root, path)) ? statSync(join(root, path)).size : undefined)));

if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"} in presets/.`);
  process.exit(1);
}
console.log(`✓ ${sources.length} preset files pass.`);
