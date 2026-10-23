// npm run local:smoke: runs every local model's sample requests (spec: Local
// engine) on a real ComfyUI, through the app's own client, adapters and
// downloader, and saves what comes back in .local-smoke/ to look at. Free: it
// spends GPU time, not credits. Run it on the machine with the GPU, with
// ComfyUI started as docs/local-setup.md says.
// Usage: npm run local:smoke                       (every sample)
//        npm run local:smoke -- qwen wan            (only samples whose name has one of these words)
//        LOCAL_COMFY_URL=http://127.0.0.1:8188 npm run local:smoke
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { localText } from "../src/lib/adapters/local/graph.ts";
import { localSamples } from "../src/lib/adapters/local/samples.ts";
import { adapterFor } from "../src/lib/registry/adapters.ts";
import type { LocalResult } from "../src/lib/registry/local-body.ts";
import { missingFiles } from "../src/lib/registry/local-models.ts";
import { checkLocal, result, setLocalUrl, status, submit } from "../src/lib/router/client.ts";
import { downloadAsset } from "../src/lib/router/download.ts";
import { errorText, toAppError } from "../src/lib/router/errors.ts";

const url = process.env.LOCAL_COMFY_URL?.trim() || "http://127.0.0.1:8188";
setLocalUrl(url);
const filters = process.argv.slice(2).map((f) => f.toLowerCase());
const outDir = ".local-smoke";
mkdirSync(outDir, { recursive: true });

const image = (file: string) => ({ mime: file.endsWith(".webp") ? ("image/webp" as const) : ("image/jpeg" as const), base64: readFileSync(`public/samples/${file}`).toString("base64") });
const clip = `data:video/mp4;base64,${readFileSync("public/samples/concert-original.mp4").toString("base64")}`;
const samples = localSamples({ front: image("walt-front.jpg"), fullBody: image("walt-full-body.jpg"), firstFrame: image("concert-original.webp"), sheet: image("walt-sheet.jpg"), still: image("walt-diner.jpg"), clip, line: clip })
  .filter((s) => !filters.length || filters.some((f) => s.name.includes(f)));

const seconds = (since: number) => `${((Date.now() - since) / 1000).toFixed(0)} s`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const check = await checkLocal(["diffusion_models", "text_encoders", "vae", "loras", "clip_vision", "audio_encoders"]);
console.log(`ComfyUI ${check.version ?? "?"} at ${url}, ${check.gpu ?? "no GPU"}${check.vramGb ? `, ${check.vramGb} GB` : ""}`);

const failures: string[] = [];
for (const sample of samples) {
  const started = Date.now();
  const missing = missingFiles(sample.modelId, check.installed);
  if (missing.length) {
    console.log(`skip  ${sample.name}: missing ${missing.map((f) => `${f.folder}/${f.name}`).join(", ")}`);
    failures.push(sample.name);
    continue;
  }
  try {
    const body = adapterFor(sample.modelId).buildBody(sample.input);
    const { requestId } = await submit(sample.modelId, body, { idempotencyKey: crypto.randomUUID() });
    for (;;) {
      const s = await status(sample.modelId, requestId);
      if (s.completed) break;
      await sleep(2000);
    }
    const res = await result(sample.modelId, requestId);
    const slug = sample.name.replace(/[^a-z0-9]+/g, "-");
    if (sample.kind === "text") {
      const text = localText(res.data as LocalResult);
      writeFileSync(join(outDir, `${slug}.txt`), text);
      console.log(`ok    ${sample.name} (${seconds(started)}): ${text.slice(0, 160).replace(/\s+/g, " ")}`);
      continue;
    }
    const refs = adapterFor(sample.modelId).extractAssets(res.data);
    if (!refs.length) throw new Error("The run finished without a file.");
    const files: string[] = [];
    for (const [i, ref] of refs.entries()) {
      const blob = await downloadAsset(ref);
      const file = join(outDir, `${slug}${refs.length > 1 ? `-${i}` : ""}.${blob.type.split("/")[1] ?? "bin"}`);
      writeFileSync(file, new Uint8Array(await blob.arrayBuffer()));
      files.push(`${file} (${(blob.size / 1024 / 1024).toFixed(1)} MB)`);
    }
    console.log(`ok    ${sample.name} (${seconds(started)}): ${files.join(", ")}`);
  } catch (err) {
    failures.push(sample.name);
    console.log(`FAIL  ${sample.name} (${seconds(started)}): ${err instanceof RangeError ? err.message : errorText(toAppError(err))}`);
  }
}
console.log(failures.length ? `\n${failures.length} of ${samples.length} didn't finish: ${failures.join(", ")}` : `\nAll ${samples.length} finished. Look at the files in ${outDir}/.`);
process.exit(failures.length ? 1 : 0);
