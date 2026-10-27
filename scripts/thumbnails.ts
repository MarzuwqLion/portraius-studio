// npm run thumbnails [-- <preset id>... | --force]: preset tile thumbnails
// (spec: Presets and recipes, Preset file), made with the sample character
// through the app's own studios in a headless browser, then shrunk to fit
// presets:check's 200 KB cap and written next to each preset file. A loop
// gets its first frame beside it as a .webp poster (U5, item 9).
//
// Costs Router calls (docs/notes/u2-notes.md lists them): image presets are
// one Nano Banana 2.1 still at 1K Fast; video presets one 4 s clip at the
// cheapest settings (H3 768p from a still, or a Seedance 480p draft); Recast
// presets a 1K Fast still of what they do, except the ones the Tour's sample
// clip already shows. Presets that have a thumbnail are skipped unless named
// or --force. Reads COMFY_API_KEY from the shell; the key goes to the page's
// Router client only and is never printed or written.
import "./lib/env.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = join(import.meta.dirname, "..");
const key = process.env.COMFY_API_KEY?.trim();
if (!key) {
  console.error("Set COMFY_API_KEY in your shell first. It is read from the environment only.");
  process.exit(2);
}

type Kind = "image" | "video" | "recast";
type Job =
  | { preset: string; type: Kind; still: { scene: string; aspectRatio: string; camera?: Record<string, string> } }
  | { preset: string; type: Kind; clip: { mode: "still" | "text"; scene: string; ratio: string; camera?: Record<string, string> } }
  | { preset: string; type: Kind; sample: { file: string; startSec: number } };

const preset = (type: Kind, id: string) => JSON.parse(readFileSync(join(root, "presets", type, `${id}.json`), "utf8")) as { thumbnail?: string; recipe: { prompt: string; camera?: Record<string, string>; params?: Record<string, unknown> } };

// Slots the sample character can't fill become plain words.
const fill = (scene: string) => scene.replace(/\{second\}/g, "a woman in her sixties with silver hair").replace(/\{product\}/g, "a worn tan leather satchel");

const IMAGE = ["editorial-cover", "film-still", "golden-hour-field", "instant-photo-1970s", "movie-poster", "noir-office", "park-bench-duo", "profile-photo", "studio-headshot", "yearbook-1996"];
const VIDEO = ["cliff-reveal", "night-walk", "product-reveal", "slow-motion-turn", "talking-to-camera", "walk-in"];
// What each Recast preset does, as one still with the sample character.
const RECAST_STILLS: Record<string, string> = {
  "concert-stage": "{lead} performs on a large concert stage with crowd lights and haze behind, mid-move, arms raised",
  "neon-performance": "{lead} dances on a dark stage lit by neon tubes in magenta and cyan, with light haze",
  "same-move-new-city": "{lead} dances on a busy city street at night with neon signs and wet pavement",
  "stunt-double": "{lead} mid-leap between two rooftops at dusk, coat flying, an action film still",
  "outfit-change": "{lead} on a city rooftop at golden hour, wearing a bright mustard yellow raincoat",
  "product-swap": "{lead} on a city rooftop holding a matte black water bottle up toward the camera",
  "sneaker-swap": "Low angle on {lead}'s feet in bright red high-top sneakers, mid-step on a city rooftop",
  "new-background": "{lead} mid-step on a sunny beach boardwalk, the sea behind him",
  claymation: "{lead} as a claymation figure, stop-motion style with visible thumbprints, on a miniature rooftop set",
  "film-1970s": "{lead} on a city rooftop, shot on 1970s film stock: warm faded colour, heavy grain, soft halation",
};
// The Tour's own recast already shows these two.
const RECAST_SAMPLE = ["swap-me-in", "dance-double"];

const jobs: Job[] = [
  ...IMAGE.map((id): Job => {
    const p = preset("image", id);
    return { preset: id, type: "image", still: { scene: fill(p.recipe.prompt), aspectRatio: String(p.recipe.params?.aspectRatio ?? "1:1"), camera: p.recipe.camera } };
  }),
  ...VIDEO.map((id): Job => {
    const p = preset("video", id);
    const people = /\{lead\}/.test(p.recipe.prompt);
    return { preset: id, type: "video", clip: { mode: people ? "still" : "text", scene: fill(p.recipe.prompt), ratio: String(p.recipe.params?.ratio ?? "16:9"), camera: p.recipe.camera } };
  }),
  ...Object.entries(RECAST_STILLS).map(([id, scene]): Job => ({ preset: id, type: "recast", still: { scene, aspectRatio: "1:1" } })),
  ...RECAST_SAMPLE.map((id): Job => ({ preset: id, type: "recast", sample: { file: "concert-recast.mp4", startSec: 1 } })),
];

const args = process.argv.slice(2);
const force = args.includes("--force");
const named = args.filter((a) => !a.startsWith("--"));
const todo = jobs.filter((j) => (named.length ? named.includes(j.preset) : force || !preset(j.type, j.preset).thumbnail));
if (!todo.length) {
  console.log("Every preset has a thumbnail. Name presets or pass --force to make them again.");
  process.exit(0);
}

// Nothing may reload the page mid-run: not the files written into presets/,
// and not an edit elsewhere in the repo.
const server = await createServer({ root, logLevel: "error", server: { port: 5197, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } } });
await server.listen();
const base = server.config.base;
const browser = await chromium.launch();
const page = await browser.newPage();
const mod = (path: string) => `${base}src/${path}`;

// The page's own modules, so this is the app's pipeline end to end.
async function inPage<T, A>(fn: (arg: A) => Promise<T>, arg: A): Promise<T> {
  // tsx keeps function names with an __name helper that the page doesn't have.
  await page.evaluate("window.__name = (f) => f");
  return page.evaluate(fn as never, arg as never) as Promise<T>;
}

const report: string[] = [];
try {
  await page.goto(`http://localhost:5197${base}#/`);
  await page.waitForSelector("main");
  const waltId = await inPage(
    async ({ key, m }) => {
      const [{ setRouterKey }, tour, { updateSettings }] = await Promise.all([import(m.client), import(m.tour), import(m.settings)]);
      setRouterKey(key);
      // No automatic drift retries: a thumbnail is one take.
      await updateSettings({ autoRetry: false });
      return tour.addSampleCharacter(await tour.loadTour());
    },
    { key, m: { client: mod("lib/router/client.ts"), tour: mod("lib/tour/tour.ts"), settings: mod("lib/store/settings.ts") } },
  );

  for (const job of todo) {
    const t = Date.now();
    const made = await inPage(
      async ({ job, waltId, m }) => {
        const [{ db }, image, video, prep, poster] = await Promise.all([import(m.db), import(m.image), import(m.video), import(m.prep), import(m.poster)]);
        const cast = [{ slot: "lead", characterId: waltId }];
        type J = { id: string; status: string; generationIds: string[]; requestId?: string; parentJobId?: string; error?: { message: string } };
        const settle = async (id: string): Promise<J> => {
          for (let i = 0; i < 900; i++) {
            const j = (await db.jobs.get(id)) as J;
            if (["done", "failed", "cancelled", "expired"].includes(j.status)) return j;
            await new Promise((r) => setTimeout(r, 2000));
          }
          throw new Error(`job ${id} took too long`);
        };
        const childOf = async (id: string): Promise<string> => {
          for (let i = 0; i < 120; i++) {
            const child = (await db.jobs.where("parentJobId").equals(id).first()) as J | undefined;
            if (child) return child.id;
            await new Promise((r) => setTimeout(r, 1000));
          }
          throw new Error(`no clip followed still ${id}`);
        };
        const asset = async (j: J, kind: string): Promise<{ blob: Blob; score?: number }> => {
          if (j.status !== "done") throw new Error(`${j.status}: ${j.error?.message ?? ""} (request ${j.requestId})`);
          const g = await db.generations.get(j.generationIds[0]);
          const a = g.assets.find((x: { kind: string }) => x.kind === kind);
          return { blob: (await db.blobs.get(a.blobId)).blob, score: g.identityScore };
        };
        const toBase64 = async (blob: Blob) => {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let s = "";
          for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          return btoa(s);
        };
        // A WebP still, 480 px on the long side, under the cap.
        const shrinkImage = async (blob: Blob) => {
          const bitmap = await createImageBitmap(blob);
          const scale = 480 / Math.max(bitmap.width, bitmap.height);
          const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
          canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          for (const quality of [0.82, 0.7, 0.55]) {
            const out = await canvas.convertToBlob({ type: "image/webp", quality });
            if (out.size < 190_000) return out;
          }
          throw new Error("still over 190 KB");
        };
        // A 3 s muted H.264 loop, 360 px on the long side, under the cap.
        const shrinkClip = async (blob: Blob, startSec: number) => {
          const ffmpeg = await prep.loadFfmpeg();
          await ffmpeg.writeFile("in.mp4", new Uint8Array(await blob.arrayBuffer()));
          for (const crf of ["30", "34", "38"]) {
            await ffmpeg.exec(["-ss", String(startSec), "-t", "3", "-i", "in.mp4", "-vf", "scale='if(gt(iw,ih),360,-2)':'if(gt(iw,ih),-2,360)',fps=24", "-c:v", "libx264", "-preset", "veryfast", "-crf", crf, "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", "out.mp4"]);
            const data = (await ffmpeg.readFile("out.mp4")) as Uint8Array;
            if (data.byteLength < 190_000) return new Blob([data as Uint8Array<ArrayBuffer>], { type: "video/mp4" });
          }
          throw new Error("loop over 190 KB");
        };

        if ("sample" in job) {
          const res = await fetch(`${m.samples}${job.sample.file}`);
          const loop = await shrinkClip(await res.blob(), job.sample.startSec);
          return { ext: "mp4", data: await toBase64(loop), poster: await toBase64(await poster.posterStill(loop, 360, 190_000)), note: `from public/samples/${job.sample.file}` };
        }
        if ("still" in job) {
          const [id] = await image.startImages({ scene: job.still.scene, cast, aspectRatio: job.still.aspectRatio, size: "1K", quality: "fast", count: 1, camera: job.still.camera ?? {} });
          const done = await settle(id);
          const { blob, score } = await asset(done, "image");
          return { ext: "webp", data: await toBase64(await shrinkImage(blob)), note: `Nano Banana 2.1 1K Fast, request ${done.requestId}, likeness ${score ?? "not scored"}` };
        }
        const people = job.clip.mode === "still";
        const first = await video.startVideo({ mode: job.clip.mode, model: "byteplus/dreamina-seedance-2-5-260628", scene: job.clip.scene, cast: people ? cast : [], durationSec: 4, ratio: job.clip.ratio, audio: false, seed: image.randomSeed(), h3Resolution: "768P", camera: job.clip.camera ?? {} });
        const clipId = people ? await childOf((await settle(first)).id) : first;
        const done = await settle(clipId);
        const { blob, score } = await asset(done, "video");
        const how = people ? "2K still, then MiniMax H3 768p 4 s" : "Seedance 2.5 480p draft 4 s";
        const loop = await shrinkClip(blob, 0.5);
        return { ext: "mp4", data: await toBase64(loop), poster: await toBase64(await poster.posterStill(loop, 360, 190_000)), note: `${how}, request ${done.requestId}, likeness ${score ?? "not scored"}` };
      },
      { job, waltId, m: { db: mod("lib/store/db.ts"), image: mod("lib/studio/image.ts"), video: mod("lib/studio/video.ts"), prep: mod("lib/media/video-prep.ts"), poster: mod("lib/media/poster.ts"), samples: `${base}samples/` } },
    ).catch((err: Error) => ({ error: err.message }));

    if ("error" in made) {
      console.log(`FAIL  ${job.type}/${job.preset}: ${made.error}`);
      report.push(`| ${job.type}/${job.preset} | failed: ${made.error} |`);
      continue;
    }
    const file = `${job.preset}.${made.ext}`;
    writeFileSync(join(root, "presets", job.type, file), Buffer.from(made.data, "base64"));
    // Every loop gets its first frame beside it as a poster (presets:check).
    if ("poster" in made && made.poster) writeFileSync(join(root, "presets", job.type, `${job.preset}.webp`), Buffer.from(made.poster, "base64"));
    const path = join(root, "presets", job.type, `${job.preset}.json`);
    const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    // The thumbnail goes after the license, where _template.json has it.
    const ordered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === "thumbnail") continue;
      ordered[k] = v;
      if (k === "license") ordered.thumbnail = file;
    }
    ordered.thumbnail ??= file;
    writeFileSync(path, `${JSON.stringify(ordered, null, 2)}\n`);
    const kb = Math.round(Buffer.from(made.data, "base64").length / 1024);
    console.log(`ok    ${job.type}/${job.preset}: ${file}, ${kb} KB, ${made.note} (${Math.round((Date.now() - t) / 1000)} s)`);
    report.push(`| ${job.type}/${job.preset} | ${file}, ${kb} KB | ${made.note} |`);
  }
  console.log(`\n${report.join("\n")}`);
} finally {
  await browser.close();
  await server.close();
}
