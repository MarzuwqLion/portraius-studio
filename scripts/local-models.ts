// npm run local:models -- <ComfyUI folder> [model words...]: downloads the
// model files the local engine needs (spec: Local engine, Models) straight
// into that ComfyUI's models/ folders, skipping files already there. Each file
// lands as <name>.part first and is renamed when complete, so a stopped
// download starts that file over and never leaves a broken one in place.
// Usage: npm run local:models -- "D:\ComfyUI"              (everything, about 169 GB)
//        npm run local:models -- "D:\ComfyUI" qwen wan2.2   (only models whose ID has one of these words)
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { LOCAL_MODEL_FILES, type ModelFile } from "../src/lib/registry/local-models.ts";

const [root, ...words] = process.argv.slice(2);
if (!root || !existsSync(join(root, "models"))) {
  console.error('Give the ComfyUI folder, the one with models/ in it: npm run local:models -- "D:\\ComfyUI"');
  process.exit(2);
}

const wanted = new Map<string, ModelFile>();
for (const [id, files] of Object.entries(LOCAL_MODEL_FILES)) {
  if (words.length && !words.some((w) => id.toLowerCase().includes(w.toLowerCase()))) continue;
  for (const f of files) wanted.set(`${f.folder}/${f.name}`, f);
}

const todo = [...wanted.values()].filter((f) => !existsSync(join(root, "models", f.folder, f.name)));
const gb = todo.reduce((sum, f) => sum + f.gb, 0);
console.log(`${wanted.size - todo.length} of ${wanted.size} files already there; ${todo.length} to download, about ${Math.round(gb)} GB.`);

for (const [i, f] of todo.entries()) {
  const folder = join(root, "models", f.folder);
  mkdirSync(folder, { recursive: true });
  const target = join(folder, f.name);
  const part = `${target}.part`;
  console.log(`[${i + 1}/${todo.length}] ${f.folder}/${f.name} (${f.gb} GB)`);
  const res = await fetch(f.url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    console.error(`  failed: HTTP ${res.status}`);
    process.exitCode = 1;
    continue;
  }
  const total = Number(res.headers.get("content-length")) || f.gb * 1e9;
  let done = 0;
  let shown = 0;
  const body = Readable.fromWeb(res.body as never);
  body.on("data", (chunk: Buffer) => {
    done += chunk.length;
    const share = Math.floor((done / total) * 20);
    if (share > shown) {
      shown = share;
      process.stdout.write(`  ${share * 5}%\r`);
    }
  });
  try {
    await pipeline(body, createWriteStream(part));
    renameSync(part, target);
    console.log("  done   ");
  } catch (err) {
    rmSync(part, { force: true });
    console.error(`  failed: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}
