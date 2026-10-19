// Smoke test against real Router calls (spec: Testing, layer 4). Costs cents:
// one Nano Banana 2.1 image and one 4 s Seedance 480p draft, run through the
// app's own runner, adapters and downloader (Seedance's links go through the
// deployed Worker), plus one estimate, a catalog check for every registry
// model, and a queued handle rebuilt from a stored request ID.
// Usage: npm run smoke   (reads COMFY_API_KEY from the shell; run before any deploy)
import "./lib/env.ts";
import "fake-indexeddb/auto";
import { config } from "../src/lib/config.ts";
import { resumeJobs, settled, startJob } from "../src/lib/jobs/runner.ts";
import { MODEL_IDS, REGISTRY } from "../src/lib/registry/models.ts";
import type { GenerateImageInput, GenerateVideoInput } from "../src/lib/registry/inputs.ts";
import * as router from "../src/lib/router/client.ts";
import { toAppError } from "../src/lib/router/errors.ts";
import { db } from "../src/lib/store/db.ts";
import { useShellKey } from "./lib/router-script.ts";

useShellKey();

const failures: string[] = [];
const started = Date.now();
const seconds = (since: number) => `${((Date.now() - since) / 1000).toFixed(1)} s`;

async function check(name: string, fn: () => Promise<string>) {
  const t = Date.now();
  try {
    console.log(`ok    ${name}: ${await fn()} (${seconds(t)})`);
  } catch (err) {
    const e = toAppError(err);
    failures.push(name);
    console.log(`FAIL  ${name}: ${e.code}: ${e.message}${e.requestId ? ` (request ${e.requestId})` : ""}`);
  }
}

console.log(`Router ${config.routerBaseUrl}, Worker ${config.workerUrl || "(none)"}, media host ${config.mediaHost}\n`);

await check("catalog has every registry model", async () => {
  const missing: string[] = [];
  for (const entry of REGISTRY) {
    await router.catalogModel(entry.id).catch(() => missing.push(entry.id));
  }
  if (missing.length) throw new Error(`not in the catalog: ${missing.join(", ")}`);
  return `${REGISTRY.length} models`;
});

const image: GenerateImageInput = {
  prompt:
    "Studio portrait of a designed character: a woman in her forties with a cropped silver bob and a rust corduroy jacket, " +
    "neutral grey seamless backdrop, soft window light, 85mm lens.",
  references: [],
  aspectRatio: "1:1",
  size: "1K",
  quality: "fast",
};

const video: GenerateVideoInput = {
  stage: "draft",
  prompt: "Slow push-in on a ceramic teapot steaming on a wooden table beside a rainy window.",
  durationSec: 4,
  ratio: "16:9",
  generateAudio: false,
  seed: 7,
};

await check("estimate a Nano Banana 2.1 image", async () => {
  const { nanoBanana } = await import("../src/lib/adapters/nano-banana.ts");
  const res = await router.estimate(MODEL_IDS.nanoBanana, nanoBanana.buildBody(image));
  if (!res.enabled) return "price unknown (/estimate isn't enabled for this key)";
  const e = res.estimate;
  return e.source === "exact" ? `${e.amountCents} cents` : e.source === "estimated" ? `${e.minCents} to ${e.maxCents} cents` : "price unknown";
});

// Both jobs run at once, as they would in the app.
const imageJob = await startJob({ kind: "image", modelId: MODEL_IDS.nanoBanana, input: { model: image, characterIds: [], prompt: image.prompt } });
const videoJob = await startJob({ kind: "video", modelId: MODEL_IDS.seedance, input: { model: video, characterIds: [], prompt: video.prompt } });

async function describeJob(id: string): Promise<string> {
  const job = await settled(id);
  if (job.status !== "done") throw Object.assign(new Error(`${job.status}: ${job.error?.message ?? ""}`), job.error ?? {});
  const generation = await db.generations.get(job.generationIds[0]!);
  const assets = generation?.assets.map((a) => `${a.kind} ${a.mime} ${(a.bytes / 1024).toFixed(0)} KB`).join(", ");
  const blobs = await db.blobs.bulkGet(generation?.assets.map((a) => a.blobId) ?? []);
  if (!blobs.length || blobs.some((b) => !b || b.bytes === 0)) throw new Error("an asset saved with no bytes");
  return `request ${job.requestId}${job.draftTaskId ? `, draft ${job.draftTaskId}` : ""}; ${assets}`;
}

await check("Nano Banana 2.1 image, queued and saved", () => describeJob(imageJob.id));
await check("Seedance 2.5 4 s 480p draft, saved through the Worker", () => describeJob(videoJob.id));

await check("queued handle rebuilt from a stored request ID", async () => {
  const stored = await db.jobs.get(imageJob.id);
  if (!stored?.requestId) throw new Error("no stored request ID");
  // A fresh handle from nothing but the model and request IDs, as after a reload.
  const status = await router.status(stored.modelId, stored.requestId);
  const res = await router.result(stored.modelId, stored.requestId);
  if (!status.completed || !res.data) throw new Error(`status ${status.status}`);
  // And the runner's reload path leaves a finished job alone.
  await resumeJobs();
  return `${status.status}; credits ${res.creditsUsed ?? "not reported"}`;
});

console.log(`\n${failures.length ? `${failures.length} failed` : "All passed"} in ${seconds(started)}`);
process.exit(failures.length ? 1 : 0);
