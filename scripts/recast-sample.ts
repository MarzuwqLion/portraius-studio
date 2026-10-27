// The Tour's Recast sample, made through the app's own code in a headless
// browser. Two steps, so a take can be looked at before anything ships:
//
//   npm run recast-sample -- <out dir> [768P|2K]
//     Walt performs public/samples/concert-original.mp4 with "Swap me in"
//     (the clip's motion, timing, camera and setting), the clip prepared the
//     way the Recast screen prepares it. Writes recast-<seed>.mp4 and prints
//     its likeness. Costs one MiniMax H3 call (8 s, 768P unless 2K is named).
//   npm run recast-sample -- <out dir> --export <take.mp4>
//     The Tour's two files from that take: concert-recast.mp4, scaled to the
//     original's size so the split view lines up, and concert-9x16.mp4, the
//     original and the recast in one frame, labelled, with the end card, as
//     "Export 9:16" makes it. No call.
//
// Reads COMFY_API_KEY from the shell for the first step; the key goes to the
// page's Router client only and is never printed or written.
import "./lib/env.ts";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const [outArg] = args;
const exportFrom = args.includes("--export") ? args[args.indexOf("--export") + 1] : undefined;
const resolution = exportFrom ? undefined : (args[1] ?? "768P");
if (!outArg || (exportFrom === undefined && !["768P", "2K"].includes(resolution!)) || (args.includes("--export") && !exportFrom)) {
  console.error("Usage: npm run recast-sample -- <out dir> [768P|2K]\n       npm run recast-sample -- <out dir> --export <take.mp4>");
  process.exit(2);
}
const key = process.env.COMFY_API_KEY?.trim();
if (!exportFrom && !key) {
  console.error("Set COMFY_API_KEY in your shell first. It is read from the environment only.");
  process.exit(2);
}
const out = resolve(outArg);
mkdirSync(out, { recursive: true });

// The export has its own port, so it can run beside a render.
const port = exportFrom ? 5199 : 5198;
const server = await createServer({ root, logLevel: "error", server: { port, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } } });
await server.listen();
const base = server.config.base;
const browser = await chromium.launch();
const page = await browser.newPage();
const mod = (path: string) => `${base}src/${path}`;
const m = {
  client: mod("lib/router/client.ts"), tour: mod("lib/tour/tour.ts"), settings: mod("lib/store/settings.ts"), db: mod("lib/store/db.ts"),
  recast: mod("lib/studio/recast.ts"), prep: mod("lib/media/video-prep.ts"), launch: mod("lib/studio/launch.ts"),
  social: mod("lib/media/social.ts"), card: mod("lib/media/social-card.ts"),
};

// The page's own modules, so this is the app's pipeline end to end.
async function inPage<T, A>(fn: (arg: A) => Promise<T>, arg: A): Promise<T> {
  // tsx keeps function names with an __name helper that the page doesn't have.
  await page.evaluate("window.__name = (f) => f");
  return page.evaluate(fn as never, arg as never) as Promise<T>;
}

try {
  await page.goto(`http://localhost:${port}${base}#/`);
  await page.waitForSelector("main");

  if (exportFrom) {
    const take = readFileSync(resolve(exportFrom)).toString("base64");
    const files = await inPage(
      async ({ take, m }) => {
        const [{ sampleUrl }, { SAMPLE_CLIP }, prep, social, card] = await Promise.all([import(m.tour), import(m.launch), import(m.prep), import(m.social), import(m.card)]);
        const source = async (blob: Blob) => {
          const info = await prep.clipInfo(blob);
          return { blob, width: info.width, height: info.height, durationSec: info.durationSec };
        };
        const toBase64 = async (blob: Blob) => {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let s = "";
          for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          return btoa(s);
        };
        const original = await source(await (await fetch(sampleUrl(SAMPLE_CLIP))).blob());
        // The take at the original's size: a 2K take would be several times
        // the file the Tour needs.
        const ffmpeg = await prep.loadFfmpeg();
        await ffmpeg.writeFile("take.mp4", new Uint8Array(await (await fetch(`data:video/mp4;base64,${take}`)).arrayBuffer()));
        const code = await ffmpeg.exec(["-i", "take.mp4", "-vf", `scale=${original.width}:${original.height}:flags=lanczos`, "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", "fit.mp4"]);
        if (code !== 0) throw new Error("The take couldn't be scaled.");
        const result = await source(new Blob([(await ffmpeg.readFile("fit.mp4")) as Uint8Array<ArrayBuffer>], { type: "video/mp4" }));
        // As lib/studio/social.ts exports a recast, with no likeness on the
        // card, in the light theme's Studio grey like the shipped file.
        document.documentElement.setAttribute("data-theme", "light");
        const layout = social.socialLayout([original, result]);
        const blob: Blob = await social.exportSocial([original, result], {
          durationSec: result.durationSec,
          background: card.ffmpegColour(card.tokenColour("--seamless")),
          overlay: await card.drawLabels(layout.cells, layout.clips, ["Original", "Recast"]),
          endCard: await card.drawEndCard(),
          audioOrder: [1, 0],
        });
        return { recast: await toBase64(result.blob), social: await toBase64(blob) };
      },
      { take, m },
    );
    for (const [name, data] of [["concert-recast.mp4", files.recast], ["concert-9x16.mp4", files.social]] as const) {
      const file = join(out, name);
      writeFileSync(file, Buffer.from(data, "base64"));
      console.log(`ok    ${file}, ${Math.round(Buffer.from(data, "base64").length / 1024)} KB`);
    }
  } else {
    const made = await inPage(
      async ({ key, resolution, m }) => {
        const [{ setRouterKey }, tour, { updateSettings }, { db }, recast, prep, { SAMPLE_CLIP }] = await Promise.all([
          import(m.client), import(m.tour), import(m.settings), import(m.db), import(m.recast), import(m.prep), import(m.launch),
        ]);
        setRouterKey(key);
        // One take: no automatic drift retry.
        await updateSettings({ autoRetry: false });
        const waltId = await tour.addSampleCharacter(await tour.loadTour());

        const raw = await (await fetch(tour.sampleUrl(SAMPLE_CLIP))).blob();
        const limits = recast.recastLimits("motion", false);
        const [startSec, endSec] = recast.defaultRange((await prep.clipInfo(raw)).durationSec, limits);
        const clip = await prep.trimClip(raw, { startSec, endSec, maxHeight: limits.maxHeight, minHeight: limits.minHeight, fps: limits.fps, keepAudio: true });
        const info = await prep.clipInfo(clip);
        const seed = Math.floor(Math.random() * 2 ** 31);
        const id: string = await recast.startRecast({
          presetId: "swap-me-in",
          clipBlobId: await recast.storeClip(clip),
          clipDurationSec: info.durationSec,
          clipWidth: info.width,
          clipHeight: info.height,
          cast: [{ slot: "lead", characterId: waltId }],
          h3Resolution: resolution,
          seed,
        });

        type J = { status: string; generationIds: string[]; requestId?: string; error?: { message: string } };
        let job: J | undefined;
        for (let i = 0; i < 900; i++) {
          job = (await db.jobs.get(id)) as J;
          if (["done", "failed", "cancelled", "expired"].includes(job.status)) break;
          await new Promise((r) => setTimeout(r, 2000));
        }
        if (job?.status !== "done") return { error: `${job?.status}: ${job?.error?.message ?? ""} (request ${job?.requestId})` };
        // Scores land after the job is done.
        let g;
        for (let i = 0; i < 120; i++) {
          g = await db.generations.get(job.generationIds[0]);
          if (g?.identityScore !== undefined) break;
          await new Promise((r) => setTimeout(r, 1000));
        }
        const asset = g.assets.find((a: { kind: string }) => a.kind === "video");
        const bytes = new Uint8Array(await (await db.blobs.get(asset.blobId)).blob.arrayBuffer());
        let s = "";
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return { data: btoa(s), seed, requestId: job.requestId, score: g.identityScore as number | undefined, worst: g.worstScore as number | undefined };
      },
      { key: key!, resolution: resolution!, m },
    );
    if ("error" in made) {
      console.error(`FAIL  ${made.error}`);
      process.exitCode = 1;
    } else {
      const file = join(out, `recast-${made.seed}.mp4`);
      writeFileSync(file, Buffer.from(made.data, "base64"));
      console.log(`ok    ${file}: H3 ${resolution}, seed ${made.seed}, request ${made.requestId}, likeness ${made.score ?? "not scored"} (worst ${made.worst ?? "-"})`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
