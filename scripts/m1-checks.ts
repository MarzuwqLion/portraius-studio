// One-off M1 checks that need a real key but not a browser (spec: Unknowns
// rows 2 and 7), plus the recorded fixtures for the M1 adapters.
// Usage: npx tsx scripts/m1-checks.ts   (reads COMFY_API_KEY from the shell)
import { mkdirSync, writeFileSync } from "node:fs";
import { MODEL_IDS } from "../src/lib/registry/models.ts";
import * as router from "../src/lib/router/client.ts";
import { describeError, pollToCompletion, stripForFixture, useShellKey } from "./lib/router-script.ts";

useShellKey();
mkdirSync(".checks", { recursive: true });
mkdirSync("test/fixtures", { recursive: true });

const report: Record<string, unknown> = { ranAt: new Date().toISOString() };
const save = () => writeFileSync(".checks/m1-node.json", JSON.stringify(report, null, 2));

function fixture(name: string, data: unknown) {
  writeFileSync(`test/fixtures/${name}.json`, JSON.stringify(stripForFixture(data), null, 2) + "\n");
}

async function step(name: string, fn: () => Promise<unknown>) {
  const started = Date.now();
  process.stdout.write(`${name} ... `);
  try {
    report[name] = { ok: true, ms: Date.now() - started, ...((await fn()) as object) };
    console.log("ok");
  } catch (err) {
    report[name] = { ok: false, ms: Date.now() - started, error: describeError(err) };
    console.log("failed");
  }
  save();
}

const imagePrompt =
  "Studio portrait of a designed character: a man in his thirties with a shaved head, round tortoiseshell glasses " +
  "and a mustard knit sweater, neutral grey seamless backdrop, soft key light, 85mm lens.";

function nanoBody(thinkingLevel: "MINIMAL" | "HIGH") {
  return {
    contents: [{ role: "user", parts: [{ text: imagePrompt }] }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { aspectRatio: "4:5", imageSize: "1K" },
      thinkingConfig: { thinkingLevel },
    },
  };
}

async function runQueued(modelId: string, body: unknown) {
  const { requestId } = await router.submit(modelId, body, { idempotencyKey: crypto.randomUUID() });
  const polled = await pollToCompletion(modelId, requestId);
  const res = await router.result(modelId, requestId);
  return { requestId, trail: polled.trail, data: res.data, creditsUsed: res.creditsUsed };
}

let draftVideoUrl: string | undefined;
let draftTaskId: string | undefined;

await step("row7_thinking_high", async () => {
  const run = await runQueued(MODEL_IDS.nanoBanana, nanoBody("HIGH"));
  fixture("nano-banana-2.1.result", run.data);
  return { requestId: run.requestId, creditsUsed: run.creditsUsed, trail: run.trail };
});

await step("row7_thinking_minimal", async () => {
  const run = await runQueued(MODEL_IDS.nanoBanana, nanoBody("MINIMAL"));
  return { requestId: run.requestId, creditsUsed: run.creditsUsed, trail: run.trail };
});

await step("seedance_text_draft", async () => {
  const body = {
    content: [{ type: "text", text: "A paper boat drifting down a rain-filled street gutter, low angle, overcast light." }],
    draft: true,
    resolution: "480p",
    duration: 4,
    ratio: "16:9",
    generate_audio: false,
    return_last_frame: true,
    seed: 11,
  };
  const estimate = await router.estimate(MODEL_IDS.seedance, body).catch((err) => ({ error: describeError(err) }));
  const run = await runQueued(MODEL_IDS.seedance, body);
  fixture("seedance-2.5.draft.result", run.data);
  const data = run.data as { id?: string; content?: { video_url?: string; last_frame_url?: string } };
  draftVideoUrl = data.content?.video_url;
  draftTaskId = data.id;
  return { requestId: run.requestId, draftTaskId, creditsUsed: run.creditsUsed, estimate, hasLastFrame: Boolean(data.content?.last_frame_url), trail: run.trail };
});

await step("seedance_final_from_draft", async () => {
  if (!draftTaskId) throw new Error("no draft task id");
  const body = { content: [{ type: "draft_task", draft_task: { id: draftTaskId } }], resolution: "1080p" };
  const estimate = await router.estimate(MODEL_IDS.seedance, body).catch((err) => ({ error: describeError(err) }));
  const run = await runQueued(MODEL_IDS.seedance, body);
  fixture("seedance-2.5.final.result", run.data);
  const data = run.data as { resolution?: string; content?: { video_url?: string; last_frame_url?: string } };
  return {
    requestId: run.requestId,
    creditsUsed: run.creditsUsed,
    estimate,
    resolution: data.resolution,
    row9_lastFrameOnFinal: Boolean(data.content?.last_frame_url),
    trail: run.trail,
  };
});

let hostedUrl: string | undefined;
let hostedId: string | undefined;

await step("row2_cloud_upload_with_router_key", async () => {
  if (!draftVideoUrl) throw new Error("no draft video to upload");
  const clip = await (await fetch(draftVideoUrl)).blob();
  const hosted = await router.uploadAsset(new Blob([clip], { type: "video/mp4" }), { filePath: "portraius-m1-check.mp4", contentType: "video/mp4" });
  hostedUrl = hosted.url;
  hostedId = hosted.id;
  const anonymous = await fetch(hosted.url, { headers: { Range: "bytes=0-1023" } });
  const u = new URL(hosted.url);
  return { host: u.host, path: u.pathname.slice(0, 40), expiresAt: hosted.expiresAt, clipBytes: clip.size, anonymousStatus: anonymous.status };
});

await step("row2_seedance_reference_video", async () => {
  if (!hostedUrl) throw new Error("no hosted URL");
  const body = {
    content: [
      { type: "text", text: "Keep the motion and camera of the reference video; make it a sunny day." },
      { type: "video_url", role: "reference_video", video_url: { url: hostedUrl } },
    ],
    draft: true,
    resolution: "480p",
    duration: 4,
    ratio: "16:9",
    generate_audio: false,
    seed: 11,
  };
  const run = await runQueued(MODEL_IDS.seedance, body);
  const data = run.data as { content?: { video_url?: string } };
  return { requestId: run.requestId, creditsUsed: run.creditsUsed, gotVideo: Boolean(data.content?.video_url), trail: run.trail };
});

await step("row2_cleanup", async () => {
  if (hostedId) await router.deleteAsset(hostedId);
  return { deleted: Boolean(hostedId) };
});

console.log("Wrote .checks/m1-node.json and test/fixtures/*.json");
