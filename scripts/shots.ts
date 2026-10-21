// npm run shots (spec: Build order, UI pass): screenshots of every route at
// 1440×900 and 1280×800, light and dark, into shots/ (gitignored). Three
// passes, each in its own fresh browser profile:
//
//   fresh  nothing stored, no key: what a judge sees first
//   walt   after "Add Walt Harmon to your vault" on the Tour
//   work   Walt plus a few finished, failed and queued jobs made from the
//          Tour's own samples, so takes, scores and the activity row show
//
// No key and no model call: the work pass writes sample files through the
// app's own Dexie module, which the dev server serves. It also checks that
// the Generate button and its price sit inside the viewport on Image, Video
// and Recast, and writes the result to shots/report-<passes>.md.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { createServer } from "vite";
import { encodeRecipe } from "../src/lib/recipes/share.ts";
import yearbook from "../presets/image/yearbook-1996.json" with { type: "json" };

const root = join(import.meta.dirname, "..");
const out = join(root, "shots");
const PORT = 5199;
const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x800", width: 1280, height: 800 },
] as const;
const THEMES = ["light", "dark"] as const;
// The primary action on each work screen, by its label's first word.
const FOLD_CHECKS: Record<string, RegExp> = { image: /^Generate/, video: /^(Make draft|Generate)/, recast: /^Recast/ };

type Phase = "fresh" | "walt" | "work";
const only = process.argv.slice(2).filter((a): a is Phase => ["fresh", "walt", "work"].includes(a));
const phases: Phase[] = only.length ? only : ["fresh", "walt", "work"];

const remix = await encodeRecipe({ format: "portraius.recipe", version: 1, ...yearbook.recipe } as Parameters<typeof encodeRecipe>[0]);

const BASE_ROUTES: { name: string; hash: string }[] = [
  { name: "first-run", hash: "/" },
  { name: "characters", hash: "/characters" },
  { name: "characters-new", hash: "/characters/new" },
  { name: "image", hash: "/image" },
  { name: "video", hash: "/video" },
  { name: "recast", hash: "/recast" },
  { name: "director", hash: "/director" },
  { name: "library", hash: "/library" },
  { name: "remix", hash: `/remix?r=${remix}` },
  { name: "tour", hash: "/tour" },
  { name: "settings", hash: "/settings" },
];

const server = await createServer({ root, logLevel: "error", server: { port: PORT, strictPort: true } });
await server.listen();
const base = `http://localhost:${PORT}${server.config.base}`;
const browser = await chromium.launch();
const report: string[] = ["# Shots report", "", `Generated ${new Date().toISOString()}.`, "", "| Pass | Size | Theme | Screen | Primary action in view |", "| --- | --- | --- | --- | --- |"];
const cut: string[] = ["", "## Truncated select values", ""];

// Hash changes only, so the app never reloads and seeded jobs are never resumed.
async function visit(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(150);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].filter((img) => !img.complete).map((img) => new Promise((done) => ((img.onload = done), (img.onerror = done)))),
    );
  });
  await page.waitForTimeout(350);
}

async function setTheme(page: Page, theme: (typeof THEMES)[number]): Promise<void> {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
}

// Is the primary action, and the price beside it, inside the viewport?
async function foldCheck(page: Page, label: RegExp): Promise<string> {
  const button = page.getByRole("button", { name: label }).first();
  if (!(await button.count())) return "no button found";
  const box = await button.boundingBox();
  const viewport = page.viewportSize()!;
  if (!box) return "hidden";
  const inView = box.y >= 0 && box.y + box.height <= viewport.height && box.x + box.width <= viewport.width;
  return inView ? "yes" : `no (button bottom at ${Math.round(box.y + box.height)} px)`;
}

// Selects whose chosen value doesn't fit: the option's text, measured in the
// select's own font, against the room left of the arrow.
async function truncatedSelects(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas").getContext("2d")!;
    return [...document.querySelectorAll("select")].flatMap((select) => {
      const text = select.selectedOptions[0]?.text ?? "";
      const style = getComputedStyle(select);
      canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const room = select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 20;
      return select.offsetParent && canvas.measureText(text).width > room ? [text] : [];
    });
  });
}

async function addWalt(page: Page): Promise<string> {
  await visit(page, "/tour");
  await page.getByRole("button", { name: /Add Walt Harmon/ }).click();
  const open = page.getByRole("link", { name: /Open Walt Harmon/ });
  await open.waitFor({ timeout: 60_000 });
  const href = (await open.getAttribute("href")) ?? "";
  return href.replace(/^#/, "").replace(/^\/characters\//, "");
}

// Finished, failed and queued jobs made from the Tour's samples, written
// through the app's own db module so the screens' live queries see them.
async function seedWork(page: Page, waltId: string): Promise<void> {
  // tsx keeps function names with an __name helper that the page doesn't have.
  await page.evaluate("window.__name = (f) => f");
  await page.evaluate(
    async ({ waltId, samples, dbModule }) => {
      const { db } = await import(/* @vite-ignore */ dbModule);
      const now = Date.now();
      const blob = async (name: string) => {
        const res = await fetch(`${samples}${name}`);
        const b = await res.blob();
        const id = `shots-${name}`;
        await db.blobs.put({ id, blob: b, mime: b.type, bytes: b.size });
        return { blobId: id, mime: b.type, bytes: b.size };
      };
      const image = (n: number, file: string, score: number, prompt: string, aspectRatio: string) => ({ n, file, score, prompt, aspectRatio });
      const stills = [
        image(1, "walt-diner.jpg", 96, "{lead} reading a paperback in a corner booth of a late-night diner", "4:5"),
        image(2, "walt-pier.jpg", 94, "{lead} at the end of a wooden pier at dusk", "16:9"),
        image(3, "walt-letter.jpg", 57, "{lead} looks up from an envelope toward the diner door", "16:9"),
      ];
      for (const s of stills) {
        const asset = await blob(s.file);
        const jobId = `shots-job-${s.n}`;
        const genId = `shots-gen-${s.n}`;
        const at = now - (10 - s.n) * 60_000;
        await db.generations.put({ id: genId, type: "image", modelId: "vertexai/gemini-nano-banana-2.1", jobId, characterIds: [waltId], identityScore: s.score, identityScores: { [waltId]: s.score }, assets: [{ ...asset, kind: "image" }], prompt: s.prompt, createdAt: at });
        await db.jobs.put({ id: jobId, kind: "image", modelId: "vertexai/gemini-nano-banana-2.1", requestId: `shots-${s.n}`, idempotencyKey: jobId, input: { model: {}, characterIds: [waltId], prompt: s.prompt, request: { scene: s.prompt, cast: [{ slot: "lead", characterId: waltId }], aspectRatio: s.aspectRatio, size: "1K", quality: "fast", count: 1, camera: {} } }, status: "done", generationIds: [genId], createdAt: at, updatedAt: at, completedAt: at });
      }
      const clip = await blob("walt-looks-up.mp4");
      const frame = await blob("walt-letter.jpg");
      await db.generations.put({ id: "shots-gen-video", type: "video", modelId: "minimax/minimax-h3", jobId: "shots-job-video", characterIds: [waltId], identityScore: 95, worstScore: 93, assets: [{ ...clip, kind: "video" }, { ...frame, kind: "frame" }], prompt: "{lead} looks up from an envelope toward the door and almost smiles", createdAt: now - 120_000 });
      await db.jobs.put({ id: "shots-job-video", kind: "video", modelId: "minimax/minimax-h3", requestId: "shots-video", idempotencyKey: "shots-job-video", input: { model: { resolution: "768P" }, characterIds: [waltId], prompt: "{lead} looks up from an envelope toward the door", request: { mode: "image", ratio: "16:9" } }, status: "done", generationIds: ["shots-gen-video"], createdAt: now - 120_000, updatedAt: now - 120_000, completedAt: now - 120_000 });
      await db.jobs.put({ id: "shots-job-failed", kind: "image", modelId: "vertexai/gemini-nano-banana-2.1", requestId: "shots-failed", idempotencyKey: "shots-job-failed", input: { model: {}, characterIds: [], prompt: "A lighthouse in fog", request: { aspectRatio: "1:1" } }, status: "failed", error: { code: "provider_error", message: "The provider didn't finish this one. Retry it?", requestId: "shots-failed", retry: "manual" }, generationIds: [], createdAt: now - 60_000, updatedAt: now - 60_000 });
      await db.jobs.put({ id: "shots-job-queued", kind: "video", modelId: "byteplus/dreamina-seedance-2-5-260628", requestId: "shots-queued", idempotencyKey: "shots-job-queued", input: { model: {}, characterIds: [], prompt: "Rain on a diner window at night", request: { mode: "text", ratio: "16:9" } }, status: "queued", queuePosition: 2, generationIds: [], createdAt: now - 10_000, updatedAt: now - 10_000 });
    },
    { waltId, samples: `${server.config.base}samples/`, dbModule: `${server.config.base}src/lib/store/db.ts` },
  );
}

async function scene(page: Page): Promise<string | undefined> {
  await visit(page, "/director");
  const create = page.getByRole("button", { name: "New scene" });
  if (!(await create.count())) return undefined;
  await create.click();
  await page.waitForURL(/#\/director\/[^/]+$/);
  for (let i = 0; i < 2; i++) {
    const add = page.getByRole("button", { name: /^Add (a )?shot$/ }).first();
    if (await add.count()) await add.click();
  }
  return new URL(page.url()).hash.replace(/^#/, "");
}

try {
  for (const phase of phases) {
    rmSync(join(out, phase), { recursive: true, force: true });
    const context = await browser.newContext({ viewport: VIEWPORTS[0], reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(`${base}#/`);
    await page.waitForSelector("main");
    const routes = [...BASE_ROUTES];
    if (phase !== "fresh") {
      const waltId = await addWalt(page);
      routes.push({ name: "character-walt", hash: `/characters/${waltId}` });
      if (phase === "work") {
        await seedWork(page, waltId);
        routes.push({ name: "library-take", hash: "/library/shots-gen-1" }, { name: "library-video", hash: "/library/shots-gen-video" });
      }
      const sceneHash = await scene(page);
      if (sceneHash) routes.push({ name: "director-scene", hash: sceneHash });
    }
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const theme of THEMES) {
        const dir = join(out, phase, `${viewport.name}-${theme}`);
        mkdirSync(dir, { recursive: true });
        await setTheme(page, theme);
        for (const route of routes) {
          await visit(page, route.hash);
          // A picked take, so the grease mark and its label show.
          if (phase === "work" && route.name === "image") {
            await page.locator('button[aria-label^="Pick:"]').last().click();
            await page.waitForTimeout(100);
          }
          await page.screenshot({ path: join(dir, `${route.name}.png`) });
          const label = FOLD_CHECKS[route.name];
          const truncated = await truncatedSelects(page);
          if (truncated.length) cut.push(`- ${phase} ${viewport.name} ${theme} ${route.name}: ${truncated.map((t) => `"${t}"`).join(", ")}`);
          if (label) report.push(`| ${phase} | ${viewport.name} | ${theme} | ${route.name} | ${await foldCheck(page, label)} |`);
        }
      }
    }
    await context.close();
    console.log(`✓ ${phase}: ${routes.length} screens × ${VIEWPORTS.length} sizes × ${THEMES.length} themes`);
  }
  if (cut.length === 3) cut.push("None.");
  writeFileSync(join(out, `report-${phases.join("-")}.md`), `${[...report, ...cut].join("\n")}\n`);
  console.log(`Shots and report-${phases.join("-")}.md in ${out}`);
} finally {
  await browser.close();
  await server.close();
}
