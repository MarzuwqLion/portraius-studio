// npm run local:models -- <ComfyUI folder> [model words...]: downloads the
// model files the local engine needs (spec: Local engine, Models) straight
// into that ComfyUI's models/ folders, skipping files already there. Each file
// lands as <name>.part first and is renamed only once it has every byte, so a
// broken file never sits in place. A dropped connection resumes from the end of
// the .part (Hugging Face drops long downloads often), and so does running the
// command again after it stops.
// Usage: npm run local:models -- "D:\ComfyUI"              (everything, about 169 GB)
//        npm run local:models -- "D:\ComfyUI" qwen wan2.2   (only models whose ID has one of these words)
// For Windows portable, give the ComfyUI folder inside ComfyUI_windows_portable.
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { LOCAL_MODEL_FILES, type ModelFile } from "../src/lib/registry/local-models.ts";

const ATTEMPTS = 10;

const [root, ...words] = process.argv.slice(2);
if (root && existsSync(join(root, "ComfyUI", "models"))) {
  // A portable build's top folder, which can also hold a models folder that ComfyUI never reads.
  console.error(`${root} has a ComfyUI folder inside it. Give that one: npm run local:models -- "${join(root, "ComfyUI")}"`);
  process.exit(2);
}
if (!root || !existsSync(join(root, "models"))) {
  console.error('Give the ComfyUI folder, the one with models/ in it: npm run local:models -- "D:\\ComfyUI"');
  process.exit(2);
}

// A refusal that retrying won't change, such as a renamed file (404).
class Refused extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sizeOf = (path: string) => (existsSync(path) ? statSync(path).size : 0);
const gbText = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`;

async function attempt(f: ModelFile, part: string): Promise<number | undefined> {
  const have = sizeOf(part);
  const res = await fetch(f.url, { redirect: "follow", headers: have ? { range: `bytes=${have}-` } : {} });
  if (res.status === 416) {
    // The .part already has every byte, or more than the file now has.
    const total = Number(res.headers.get("content-range")?.split("/")[1]);
    if (total === have) return total;
    rmSync(part, { force: true });
    throw new Error("the saved part no longer fits the file, starting over");
  }
  if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) throw new Refused(`HTTP ${res.status}`);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  // 206 continues the .part; a 200 means the server sent the whole file again.
  const resumed = res.status === 206;
  const length = Number(res.headers.get("content-length")) || 0;
  const total = resumed ? Number(res.headers.get("content-range")?.split("/")[1]) || undefined : length || undefined;
  let done = resumed ? have : 0;
  let shown = -1;
  const body = Readable.fromWeb(res.body as never);
  body.on("data", (chunk: Buffer) => {
    done += chunk.length;
    const share = Math.floor((done / (total ?? f.gb * 1e9)) * 20);
    if (share > shown) {
      shown = share;
      process.stdout.write(`  ${share * 5}%\r`);
    }
  });
  await pipeline(body, createWriteStream(part, { flags: resumed ? "a" : "w" }));
  if (total && sizeOf(part) !== total) throw new Error(`stopped at ${gbText(sizeOf(part))} of ${gbText(total)}`);
  return total;
}

async function download(f: ModelFile, target: string): Promise<void> {
  const part = `${target}.part`;
  if (sizeOf(part)) console.log(`  resuming from ${gbText(sizeOf(part))}`);
  for (let n = 1; ; n++) {
    try {
      await attempt(f, part);
      renameSync(part, target);
      return;
    } catch (err) {
      if (err instanceof Refused || n === ATTEMPTS) throw err;
      const wait = Math.min(60, 2 ** n);
      console.log(`  dropped (${(err as Error).message}); retrying from ${gbText(sizeOf(part))} in ${wait} s`);
      await sleep(wait * 1000);
    }
  }
}

const wanted = new Map<string, ModelFile>();
for (const [id, files] of Object.entries(LOCAL_MODEL_FILES)) {
  if (words.length && !words.some((w) => id.toLowerCase().includes(w.toLowerCase()))) continue;
  for (const f of files) wanted.set(`${f.folder}/${f.name}`, f);
}

const todo = [...wanted.values()].filter((f) => !existsSync(join(root, "models", f.folder, f.name)));
const gb = todo.reduce((sum, f) => sum + f.gb, 0);
console.log(`${wanted.size - todo.length} of ${wanted.size} files already there; ${todo.length} to download, about ${Math.round(gb)} GB.`);

const failed: string[] = [];
for (const [i, f] of todo.entries()) {
  const folder = join(root, "models", f.folder);
  mkdirSync(folder, { recursive: true });
  console.log(`[${i + 1}/${todo.length}] ${f.folder}/${f.name} (${f.gb} GB)`);
  try {
    await download(f, join(folder, f.name));
    console.log("  done   ");
  } catch (err) {
    failed.push(`${f.folder}/${f.name}`);
    console.error(`  failed: ${(err as Error).message}`);
  }
}
if (failed.length) {
  console.error(`\n${failed.length} file(s) didn't finish: ${failed.join(", ")}. Run the same command again to resume them.`);
  process.exitCode = 1;
}
