// npm run posters [-- --force]: a WebP of the first frame beside every .mp4
// preset thumbnail and every sample clip in public/samples/, with the same
// base name (Decisions, October 21, U5, item 9). Taken from the existing
// files in a headless browser with the app's ffmpeg.wasm: no Router call and
// no key. Posters that exist are kept unless --force; npm run thumbnails
// writes one with every new loop.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { THUMBNAIL_MAX_BYTES } from "../src/lib/presets/check.ts";

const root = join(import.meta.dirname, "..");
const force = process.argv.includes("--force");

// Preset loops are 360 px on the long side, and so are their posters; the
// samples play large, so theirs keep up to 1280 px.
const sources = [
  ...["presets/video", "presets/recast"].map((dir) => ({ dir, longSide: 360 })),
  { dir: "public/samples", longSide: 1280 },
].flatMap(({ dir, longSide }) =>
  readdirSync(join(root, dir))
    .filter((f) => f.endsWith(".mp4"))
    .map((f) => ({ clip: join(root, dir, f), poster: join(root, dir, f.replace(/\.mp4$/, ".webp")), longSide })),
);
const todo = sources.filter((s) => force || !existsSync(s.poster));
if (!todo.length) {
  console.log("Every clip has a poster. Pass --force to make them again.");
  process.exit(0);
}

const server = await createServer({ root, logLevel: "error", server: { port: 5198, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } } });
await server.listen();
const base = server.config.base;
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:5198${base}#/settings`);
  await page.waitForSelector("main");
  // tsx keeps function names with an __name helper that the page doesn't have.
  await page.evaluate("window.__name = (f) => f");
  for (const s of todo) {
    const made = await page.evaluate(
      async ({ data, longSide, maxBytes, module }) => {
        const { posterStill } = await import(/* @vite-ignore */ module);
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        const still: Blob = await posterStill(new Blob([bytes], { type: "video/mp4" }), longSide, maxBytes);
        const out = new Uint8Array(await still.arrayBuffer());
        let text = "";
        for (let i = 0; i < out.length; i += 0x8000) text += String.fromCharCode(...out.subarray(i, i + 0x8000));
        return btoa(text);
      },
      { data: readFileSync(s.clip).toString("base64"), longSide: s.longSide, maxBytes: THUMBNAIL_MAX_BYTES - 10 * 1024, module: `${base}src/lib/media/poster.ts` },
    );
    const bytes = Buffer.from(made, "base64");
    writeFileSync(s.poster, bytes);
    console.log(`ok    ${relative(root, s.poster).replaceAll("\\", "/")}, ${Math.round(bytes.length / 1024)} KB`);
  }
} finally {
  await browser.close();
  await server.close();
}
