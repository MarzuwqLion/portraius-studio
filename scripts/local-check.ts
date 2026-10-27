// npm run local:check: builds every local model's sample requests (spec:
// Local engine) with the app's own adapters and holds their graphs against a
// ComfyUI's node definitions, with the checks workflows:check makes, and the
// same for the exported graphs in workflows/local/. Free and needs no GPU:
// nothing executes, and model files aren't checked (Settings and local:smoke
// do that).
// Usage: OBJECT_INFO_URL=http://127.0.0.1:8188/object_info npm run local:check
// Comfy Cloud's definitions (https://cloud.comfy.org/api/object_info) need
// COMFY_API_KEY in the shell, like workflows:check.
import { readFileSync, readdirSync } from "node:fs";
import { localSamples } from "../src/lib/adapters/local/samples.ts";
import { requestBody } from "../src/lib/registry/adapters.ts";
import type { LocalBody } from "../src/lib/registry/local-body.ts";
import { checkPrompt, loadCatalog, type ApiPrompt } from "./lib/object-info.ts";

const source = process.env.OBJECT_INFO_URL?.trim() || "http://127.0.0.1:8188/object_info";
const loopback = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(source);
const catalog = await loadCatalog(source, loopback ? undefined : process.env.COMFY_API_KEY?.trim());

const image = (file: string) => ({ mime: file.endsWith(".webp") ? ("image/webp" as const) : ("image/jpeg" as const), base64: readFileSync(`public/samples/${file}`).toString("base64") });
const clip = `data:video/mp4;base64,${readFileSync("public/samples/concert-original.mp4").toString("base64")}`;
const samples = localSamples({ front: image("walt-front.jpg"), fullBody: image("walt-full-body.jpg"), firstFrame: image("concert-original.webp"), sheet: image("walt-sheet.jpg"), still: image("walt-diner.jpg"), clip, line: clip });

// Uploads and model files are whatever the visitor has, so their option lists
// can't know them.
const FILE_INPUTS = new Set(["image", "file", "audio", "unet_name", "clip_name", "vae_name", "lora_name", "audio_encoder_name"]);

const problems: string[] = [];
for (const sample of samples) {
  const body = requestBody(sample.modelId, sample.input) as LocalBody;
  problems.push(...checkPrompt(sample.name, body.prompt as ApiPrompt, catalog, (_, input) => FILE_INPUTS.has(input)));
  console.log(`checked ${sample.name}: ${Object.keys(body.prompt).length} nodes, ${body.uploads.length} uploads`);
}
const exported = readdirSync("workflows/local").filter((f) => f.endsWith(".api.json"));
for (const file of exported) {
  const prompt = JSON.parse(readFileSync(`workflows/local/${file}`, "utf8")) as ApiPrompt;
  problems.push(...checkPrompt(`workflows/local/${file}`, prompt, catalog, (_, input) => FILE_INPUTS.has(input)));
  console.log(`checked workflows/local/${file}: ${Object.keys(prompt).length} nodes`);
}
if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log(`Every local graph and the ${exported.length} in workflows/local/ match the definitions at ${source}.`);
