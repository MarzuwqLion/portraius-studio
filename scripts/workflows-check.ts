// npm run workflows:check: checks workflows/*.api.json against the node
// definitions ComfyUI publishes (Comfy Cloud's /api/object_info): every node
// type exists, every input name is one the node takes, every choice is one of
// its options and every link fits (scripts/lib/object-info.ts). Free to run;
// nothing executes. Reads COMFY_API_KEY from
// the shell, like smoke.
//
// OBJECT_INFO_URL points it at another ComfyUI instead, such as a local one
// (http://127.0.0.1:8188/object_info, no key). Where that ComfyUI has the
// Portraius node pack installed, the pack's example graph is checked too.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkPrompt, loadCatalog, type ApiPrompt } from "./lib/object-info.ts";

const source = process.env.OBJECT_INFO_URL?.trim() || "https://cloud.comfy.org/api/object_info";
const key = process.env.COMFY_API_KEY?.trim();
if (!process.env.OBJECT_INFO_URL && !key) {
  console.error("Set COMFY_API_KEY in your shell first, or OBJECT_INFO_URL to a local ComfyUI's /object_info.");
  process.exit(2);
}
const catalog = await loadCatalog(source, process.env.OBJECT_INFO_URL ? undefined : key);

const USER_FILES = new Set(["LoadImage.image", "LoadVideo.file"]);

const PACK_EXAMPLE ="custom_nodes/comfyui-portraius-characters/tests/portraius-character-still.api.json";
const files = readdirSync("workflows")
  .filter((f) => f.endsWith(".api.json"))
  .map((f) => join("workflows", f));
if (catalog.PortraiusLoadCharacter && existsSync(PACK_EXAMPLE)) files.push(PACK_EXAMPLE);
else console.log(`skipped ${PACK_EXAMPLE}: this ComfyUI doesn't have the Portraius node pack`);

const problems: string[] = [];
for (const file of files) {
  const prompt = JSON.parse(readFileSync(file, "utf8")) as ApiPrompt;
  // Image and video files are whatever the user puts in ComfyUI/input/.
  problems.push(...checkPrompt(file, prompt, catalog, (classType, input) => USER_FILES.has(`${classType}.${input}`)));
  console.log(`checked ${file}: ${Object.keys(prompt).length} nodes`);
}
if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log(`Every node, input and option matches the definitions at ${source}.`);
