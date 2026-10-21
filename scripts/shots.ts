// npm run shots (spec: Build order, UI pass): screenshots of every route at
// 1440×900 and 1280×800, light and dark, and at 390×844 (a phone) in dark,
// into shots/ (gitignored). Three passes, each in its own fresh browser
// profile:
//
//   fresh  nothing stored, no key: what a judge sees first
//   walt   after "Try this with Walt" on the Tour, which adds him, plus the
//          Tour's handoffs: Image with Walt and a preset, Recast with the
//          sample clip, and the Director sample scene
//   work   Walt plus a few finished, failed and queued jobs made from the
//          Tour's own samples, so takes, scores and the activity row show
//
// No key and no model call: the work pass writes sample files through the
// app's own Dexie module, which the dev server serves. It also checks that
// the Generate button and its price sit inside the viewport on Image, Video
// and Recast, runs the checks in CHECKS below, writes the results to
// shots/report-<passes>.md, and exits with an error if any check fails.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { createServer } from "vite";
import { encodeRecipe } from "../src/lib/recipes/share.ts";
import yearbook from "../presets/image/yearbook-1996.json" with { type: "json" };

const root = join(import.meta.dirname, "..");
const out = join(root, "shots");
const PORT = 5199;
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];
interface Viewport {
  name: string;
  width: number;
  height: number;
  themes: readonly Theme[];
  phone?: boolean;
}
const VIEWPORTS: Viewport[] = [
  { name: "1440x900", width: 1440, height: 900, themes: THEMES },
  { name: "1280x800", width: 1280, height: 800, themes: THEMES },
  // The phone pass (Decisions, October 21, U5, item 4).
  { name: "390x844", width: 390, height: 844, themes: ["dark"], phone: true },
];
// The primary action on each work screen, by its label's first word.
const FOLD_CHECKS: Record<string, RegExp> = { image: /^Generate/, video: /^(Make draft|Generate)/, recast: /^Recast/, "tour-try-image": /^Generate/, "tour-try-recast": /^Recast/ };

type Phase = "fresh" | "walt" | "work";
const only = process.argv.slice(2).filter((a): a is Phase => ["fresh", "walt", "work"].includes(a));
const phases: Phase[] = only.length ? only : ["fresh", "walt", "work"];

const remix = await encodeRecipe({ format: "portraius.recipe", version: 1, ...yearbook.recipe } as Parameters<typeof encodeRecipe>[0]);

// A route is a hash to visit, or a Tour chapter whose "Try this with Walt"
// button to press (it opens a studio with Walt cast).
type Route = { name: string; hash: string; scrollTo?: string } | { name: string; tryChapter: string };

const BASE_ROUTES: Route[] = [
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

// No reloads mid-run: an edit elsewhere in the repo must not reload the page.
const server = await createServer({ root, logLevel: "error", server: { port: PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } } });
await server.listen();
const base = `http://localhost:${PORT}${server.config.base}`;
const browser = await chromium.launch();
const report: string[] = ["# Shots report", "", `Generated ${new Date().toISOString()}.`, "", "| Pass | Size | Theme | Screen | Primary action in view |", "| --- | --- | --- | --- | --- |"];
const cut: string[] = ["", "## Truncated select values", ""];
const checked: string[] = [];
const failures: string[] = [];

// Hash changes only, so the app never reloads and seeded jobs are never resumed.
async function visit(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(150);
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Only images on screen: a lazy image that's hidden (a phone-only preset
    // tile at desktop width) never loads.
    await Promise.all(
      [...document.images]
        .filter((img) => !img.complete && img.offsetParent)
        .map((img) => new Promise((done) => ((img.onload = done), (img.onerror = done), setTimeout(done, 5000)))),
    );
    // Videos show a frame, not a blank box (a seek may still be decoding).
    const deadline = Date.now() + 3000;
    while ([...document.querySelectorAll("video")].some((v) => v.readyState < 2 || v.seeking) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
  });
  await page.waitForTimeout(350);
}

async function setTheme(page: Page, theme: Theme): Promise<void> {
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

// The Generate footer's text: its waiting reason, the button, the price and its note.
async function footerText(page: Page): Promise<string> {
  const footer = page.locator('section[aria-label="Call sheet"] > .sticky');
  return (await footer.count()) ? (await footer.innerText()).replace(/\s+/g, " ") : "";
}

// Is the element inside the part of <main> that the sticky footer leaves?
async function inView(page: Page, selector: string): Promise<string> {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return "missing";
    const box = el.getBoundingClientRect();
    const main = document.querySelector("main")!.getBoundingClientRect();
    const footer = document.querySelector('section[aria-label="Call sheet"] > .sticky')?.getBoundingClientRect();
    const bottom = footer?.height ? Math.min(main.bottom, footer.top) : main.bottom;
    return box.top >= main.top - 1 && box.bottom <= bottom + 1 ? "yes" : `no (${Math.round(box.top)} to ${Math.round(box.bottom)} px; room ${Math.round(main.top)} to ${Math.round(bottom)} px)`;
  }, selector);
}

// Checks beyond the fold check (Decisions, October 21, U5): each says which
// screens it applies to, and returns a problem or undefined.
interface Check {
  name: string;
  applies: (route: string, phase: Phase, viewport: Viewport) => boolean;
  run: (page: Page) => Promise<string | undefined>;
}

const CHECKS: Check[] = [
  {
    name: "nothing scrolls sideways",
    applies: (_route, _phase, viewport) => Boolean(viewport.phone),
    run: (page) =>
      page.evaluate(() => {
        const main = document.querySelector("main")!;
        if (document.documentElement.scrollWidth > innerWidth + 1) return `the page is ${document.documentElement.scrollWidth} px wide`;
        if (main.scrollWidth > main.clientWidth + 1) return `the main area is ${main.scrollWidth} px wide`;
        return undefined;
      }),
  },
  {
    name: "every bottom-bar label fits",
    applies: (_route, _phase, viewport) => Boolean(viewport.phone),
    run: async (page) => {
      const cut = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('nav[aria-label="Studio"] a span')].flatMap((span) =>
          span.offsetParent && span.scrollWidth > span.clientWidth + 1 ? [span.textContent ?? ""] : [],
        ),
      );
      return cut.length ? `truncated: ${cut.join(", ")}` : undefined;
    },
  },
  {
    name: "the picked preset and the prompt are in view",
    applies: (route, _phase, viewport) => route === "tour-try-image" && Boolean(viewport.phone),
    run: async (page) => {
      const tile = await inView(page, '[role="group"][aria-label="Presets"] button[aria-pressed="true"]');
      const prompt = await inView(page, ".prompt-editor");
      return tile === "yes" && prompt === "yes" ? undefined : `picked preset ${tile}; prompt ${prompt}`;
    },
  },
  {
    name: "the empty Image set shows the Film still example",
    applies: (route, phase) => route === "tour-try-image" && phase === "walt",
    run: async (page) => {
      const example = page.locator('section[aria-label="Set"]').getByText("Example: Film still with Walt Harmon, a designed character. Your takes appear here.");
      return (await example.count()) && (await example.isVisible()) ? undefined : "no example on the set";
    },
  },
  {
    name: "Recast waits only for the key: no prepare, trim or rights step",
    applies: (route) => route === "tour-try-recast",
    run: async (page) => {
      const text = await footerText(page);
      return /prepar|trim|rights/i.test(text) || !/Add your Comfy API key/.test(text) ? `the footer reads "${text}"` : undefined;
    },
  },
];

const dbModule = () => `${server.config.base}src/lib/store/db.ts`;

async function tryChapter(page: Page, chapter: string): Promise<void> {
  await visit(page, "/tour");
  await page.locator(`#tour-${chapter}`).getByRole("button", { name: /^Try this with/ }).click();
  await page.waitForURL((url) => !url.hash.startsWith("#/tour"), { timeout: 60_000 });
  // The studio applies the launch; Recast loads its sample clip and prepares it.
  await page.waitForTimeout(500);
  if (chapter === "recast") {
    await page.waitForFunction(() => {
      const footer = document.querySelector('section[aria-label="Call sheet"] > .sticky')?.textContent ?? "";
      return !/Upload a clip|Preparing/.test(footer);
    }, undefined, { timeout: 120_000 });
    await page.waitForTimeout(1000);
  }
}

async function addWalt(page: Page): Promise<string> {
  await tryChapter(page, "images");
  return page.evaluate(async (m) => {
    const { db } = await import(/* @vite-ignore */ m);
    return ((await db.characters.toArray()) as { id: string }[])[0]!.id;
  }, dbModule());
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
      // A Director scene: three shots with anchors, two with a take, and one export.
      const letter = await blob("the-letter.mp4");
      await db.generations.put({ id: "shots-gen-export", type: "scene", modelId: "portraius/director-export", jobId: "scene:shots-scene", characterIds: [waltId], assets: [{ ...letter, kind: "video" }], prompt: "The Letter", createdAt: now - 30_000 });
      const shot = (n: number, action: string, size: string, lens: string, movement: string, anchor: string, take?: string) => ({ id: `shots-shot-${n}`, n, size, angle: "eye", lens, movement, action, durationSec: 5, continuity: "cut", rolls: 0, anchorJobIds: [anchor], anchorJobId: anchor, ...(take ? { takeJobId: take } : {}) });
      const scene = {
        id: "shots-scene",
        title: "The Letter",
        logline: "A retired harbour pilot finds a letter he never sent.",
        cast: [{ slot: "lead", characterId: waltId }],
        location: "A late-night diner with red vinyl booths",
        film: { genre: "drama", body: "digital-cinema", era: "present", pacing: "standard" },
        ratio: "16:9",
        sound: true,
        seed: 7,
        nextShot: 3,
        shots: [
          shot(0, "{lead} sits alone in a corner booth, rain on the window", "WS", "35mm", "static", "shots-job-2", "shots-job-video"),
          shot(1, "{lead} slides an old envelope out of his coat and turns it over", "MCU", "50mm", "slow-push-in", "shots-job-3", "shots-job-video"),
          shot(2, "{lead} looks up toward the diner door and almost smiles", "CU", "85mm", "static", "shots-job-1"),
        ],
        exportGenerationIds: ["shots-gen-export"],
        exportInfo: { "shots-gen-export": { crossfade: true, durationSec: 15 } },
        createdAt: now - 600_000,
        updatedAt: now - 30_000,
      };
      const json = new Blob([JSON.stringify(scene)], { type: "application/json" });
      await db.blobs.put({ id: "scene:shots-scene", blob: json, mime: json.type, bytes: json.size });
      await db.jobs.put({ id: "shots-job-queued", kind: "video", modelId: "byteplus/dreamina-seedance-2-5-260628", requestId: "shots-queued", idempotencyKey: "shots-job-queued", input: { model: {}, characterIds: [], prompt: "Rain on a diner window at night", request: { mode: "text", ratio: "16:9" } }, status: "queued", queuePosition: 2, generationIds: [], createdAt: now - 10_000, updatedAt: now - 10_000 });
    },
    { waltId, samples: `${server.config.base}samples/`, dbModule: dbModule() },
  );
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
        routes.push({ name: "library-take", hash: "/library/shots-gen-1" }, { name: "library-video", hash: "/library/shots-gen-video" }, { name: "director-work", hash: "/director/shots-scene" }, { name: "director-export", hash: "/director/shots-scene", scrollTo: 'section[aria-label="Export"]' });
      }
      routes.push({ name: "tour-try-image", tryChapter: "images" }, { name: "tour-try-recast", tryChapter: "recast" }, { name: "director-scene", tryChapter: "director" });
    }
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const theme of viewport.themes) {
        const dir = join(out, phase, `${viewport.name}-${theme}`);
        mkdirSync(dir, { recursive: true });
        await setTheme(page, theme);
        for (const route of routes) {
          if ("hash" in route) {
            await visit(page, route.hash);
            if (route.scrollTo) {
              await page.locator(route.scrollTo).scrollIntoViewIfNeeded();
              await page.waitForTimeout(300);
            }
          } else await tryChapter(page, route.tryChapter);
          // A picked take, so the grease mark and its label show.
          if (phase === "work" && route.name === "image") {
            await page.locator('button[aria-label^="Pick:"]').last().click();
            await page.waitForTimeout(100);
          }
          await page.screenshot({ path: join(dir, `${route.name}.png`) });
          const where = `${phase} ${viewport.name} ${theme} ${route.name}`;
          const label = FOLD_CHECKS[route.name];
          const truncated = await truncatedSelects(page);
          if (truncated.length) {
            cut.push(`- ${where}: ${truncated.map((t) => `"${t}"`).join(", ")}`);
            failures.push(`${where}: truncated select values: ${truncated.join(", ")}`);
          }
          if (label) {
            const fold = await foldCheck(page, label);
            report.push(`| ${phase} | ${viewport.name} | ${theme} | ${route.name} | ${fold} |`);
            if (fold !== "yes") failures.push(`${where}: primary action in view: ${fold}`);
          }
          for (const check of CHECKS) {
            if (!check.applies(route.name, phase, viewport)) continue;
            const problem = await check.run(page);
            checked.push(`| ${where} | ${check.name} | ${problem ?? "pass"} |`);
            if (problem) failures.push(`${where}: ${check.name}: ${problem}`);
          }
        }
      }
    }
    await context.close();
    console.log(`✓ ${phase}: ${routes.length} screens at ${VIEWPORTS.map((v) => `${v.name} (${v.themes.join(", ")})`).join(", ")}`);
  }
  if (cut.length === 3) cut.push("None.");
  const checks = ["", "## Checks", "", "| Where | Check | Result |", "| --- | --- | --- |", ...checked, "", "## Failed", "", ...(failures.length ? failures.map((f) => `- ${f}`) : ["None."])];
  writeFileSync(join(out, `report-${phases.join("-")}.md`), `${[...report, ...cut, ...checks].join("\n")}\n`);
  console.log(`Shots and report-${phases.join("-")}.md in ${out}`);
  if (failures.length) {
    for (const f of failures) console.error(`✗ ${f}`);
    console.error(`${failures.length} check${failures.length === 1 ? "" : "s"} failed.`);
    process.exitCode = 1;
  } else console.log(`✓ Every check passes (${report.length - 6} fold checks, ${checked.length} others).`);
} finally {
  await browser.close();
  await server.close();
}
