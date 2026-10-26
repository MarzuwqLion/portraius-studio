// npm run og-image: public/og.jpg, the 1200x630 picture link previews show
// (X, LinkedIn, Discord, iMessage) when someone shares the site (contest
// polish, October 25). The Recast sample's original and result side by side,
// the name, and a likeness chip, laid out in the app's own tokens and fonts
// and screenshotted in a headless browser. Nothing calls a model.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const root = join(import.meta.dirname, "..");
const url = (path: string) => pathToFileURL(join(root, path)).href;

const font = (family: string, weight: number, file: string) =>
  `@font-face { font-family: "${family}"; font-weight: ${weight}; src: url("${url(`public/fonts/${file}`)}") format("woff2"); }`;

const html = `<!doctype html>
<html data-theme="dark"><head><meta charset="utf-8">
<link rel="stylesheet" href="${url("src/styles/tokens.css")}">
<style>
${font("Big Shoulders Display", 800, "big-shoulders-display-latin-800-normal.woff2")}
${font("Atkinson Hyperlegible Next", 600, "atkinson-hyperlegible-next-latin-600-normal.woff2")}
html, body { margin: 0; }
body { width: 1200px; height: 630px; background: var(--seamless); color: var(--on-seamless); font-family: var(--type-body); box-sizing: border-box; padding: 36px 44px; display: grid; grid-template-rows: auto 1fr; gap: 28px; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
figure { margin: 0; display: grid; gap: 8px; }
figcaption { font-family: var(--type-display); font-weight: 800; font-size: 34px; }
img { width: 100%; height: 300px; object-fit: cover; border-radius: var(--corner-media); border: 1px solid var(--rule); display: block; }
.foot { display: flex; align-items: end; justify-content: space-between; gap: 24px; }
h1 { font-family: var(--type-display); font-weight: 800; font-size: 96px; line-height: 0.9; margin: 0; }
p { font-weight: 600; font-size: 24px; margin: 10px 0 0; max-width: 34ch; }
.chip { background: var(--proof); color: var(--match); font-family: var(--type-display); font-weight: 800; font-size: 44px; padding: 10px 22px; border-radius: var(--corner-control); white-space: nowrap; }
</style></head><body>
<div class="pair">
  <figure><figcaption>Original</figcaption><img src="${url("public/samples/concert-original.webp")}"></figure>
  <figure><figcaption>Recast</figcaption><img src="${url("public/samples/concert-recast.webp")}"></figure>
</div>
<div class="foot">
  <div><h1>Portraius Studio</h1><p>Your character in every shot, with a number for how much it looks like them.</p></div>
  <div class="chip">Likeness 90</div>
</div>
</body></html>`;

const dir = mkdtempSync(join(tmpdir(), "og-"));
writeFileSync(join(dir, "og.html"), html);
// Playwright's own Chromium when it's installed, otherwise the system's Edge.
const browser = await chromium.launch().catch(() => chromium.launch({ channel: "msedge" }));
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(pathToFileURL(join(dir, "og.html")).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(root, "public/og.jpg"), type: "jpeg", quality: 86 });
await browser.close();
console.log("Wrote public/og.jpg");
