// npm run voices:check: speaks one line in every voice in presets/voices.json
// through Router (Unknowns row 16: ElevenLabs stock voice IDs work through
// Router). With --previews it writes each line to public/voices/ as the
// voice's preview. Uses the shell's COMFY_API_KEY and costs a few cents.
import "./lib/env.ts";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describeError, useShellKey } from "./lib/router-script.ts";
import { adapterFor } from "../src/lib/registry/adapters.ts";
import { MODEL_IDS } from "../src/lib/registry/models.ts";
import * as router from "../src/lib/router/client.ts";
import { voicesFile } from "../src/lib/presets/schema.ts";

const root = join(import.meta.dirname, "..");
const writePreviews = process.argv.includes("--previews");
const file = voicesFile.parse(JSON.parse(readFileSync(join(root, "presets/voices.json"), "utf8")));
useShellKey();
if (writePreviews) mkdirSync(join(root, "public/voices"), { recursive: true });

const adapter = adapterFor(MODEL_IDS.elevenLabs);
let failed = 0;
for (const voice of file.voices) {
  const line = `Hi, I'm ${voice.label}. This is how I sound in Portraius Studio.`;
  const started = Date.now();
  try {
    const res = await router.run(MODEL_IDS.elevenLabs, adapter.buildBody({ lines: [{ text: line, voiceId: voice.id }], seed: 1 }), { idempotencyKey: crypto.randomUUID() });
    if (res.kind !== "binary") throw new Error(`expected audio, got JSON: ${JSON.stringify(res.data).slice(0, 200)}`);
    const bytes = res.data as Uint8Array;
    console.log(`✓ ${voice.label.padEnd(10)} ${voice.id}  ${res.contentType}  ${(bytes.byteLength / 1024).toFixed(0)} KB  ${Date.now() - started} ms  request ${res.requestId}`);
    if (writePreviews) writeFileSync(join(root, "public/voices", voice.preview), bytes);
  } catch (err) {
    failed++;
    console.log(`✗ ${voice.label.padEnd(10)} ${voice.id}`, describeError(err));
  }
}
console.log(failed ? `\n${failed} of ${file.voices.length} voices failed.` : `\nAll ${file.voices.length} voices work through Router.`);
process.exit(failed ? 1 : 0);
