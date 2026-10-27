// Visual direction checks (spec: Colour tokens; Testing, acceptance row
// "Visual direction"): the contrast targets in both themes, read from
// tokens.css itself, and no colour value anywhere else in src/.
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

type Rgb = [number, number, number];

function block(selector: RegExp): Record<string, string> {
  const match = selector.exec(css);
  if (!match) throw new Error(`no block ${selector}`);
  const body = css.slice(match.index + match[0].length, css.indexOf("}", match.index + match[0].length));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

const light = block(/:root\s*\{/);
const darkMedia = block(/:root:not\(\[data-theme="light"\]\)\s*\{/);
const darkForced = block(/:root\[data-theme="dark"\]\s*\{/);
const dark = { ...light, ...darkMedia };
const portraius = { ...light, ...block(/:root\[data-theme="portraius"\]\s*\{/) };

const hex = (value: string): Rgb => {
  const m = /^#([0-9a-f]{6})$/i.exec(value);
  if (!m) throw new Error(`not a colour: ${value}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// Resolves var() and the color-mix(in srgb, A p%, B) the tokens use.
function colour(theme: Record<string, string>, name: string): Rgb {
  const value = theme[name];
  if (!value) throw new Error(`no token ${name}`);
  const ref = /^var\((--[\w-]+)\)$/.exec(value);
  if (ref) return colour(theme, ref[1]!);
  const mix = /^color-mix\(in srgb, var\((--[\w-]+)\) (\d+)%, var\((--[\w-]+)\)\)$/.exec(value);
  if (mix) {
    const a = colour(theme, mix[1]!);
    const b = colour(theme, mix[3]!);
    const p = Number(mix[2]) / 100;
    return a.map((c, i) => c * p + b[i]! * (1 - p)) as Rgb;
  }
  return hex(value);
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// The spec's targets (Colour tokens, October 21). --grease on light --seamless
// (the pick mark) is about 2.4:1, under WCAG's 3:1 for graphics, so every pick
// also carries a "✓ Selected" label; in dark it's about 5.6:1.
const pairs: { text: string; on: string; min: number; why: string }[] = [
  { text: "--ink", on: "--proof", min: 13, why: "ink on proof, about 14:1" },
  { text: "--ink-muted", on: "--proof", min: 4.5, why: "secondary text" },
  { text: "--on-seamless", on: "--seamless", min: 4.5, why: "text on Studio grey" },
  { text: "--on-ink", on: "--ink", min: 4.5, why: "a picked segment" },
  { text: "--on-accent", on: "--accent", min: 4.5, why: "primary button label" },
  { text: "--accent-text", on: "--proof", min: 4.5, why: "links and accent text" },
  { text: "--accent", on: "--proof", min: 3, why: "focus ring and active rail item" },
  { text: "--rule", on: "--proof", min: 3, why: "input borders" },
  { text: "--match", on: "--proof", min: 4.5, why: "Strong" },
  { text: "--check", on: "--proof", min: 4.5, why: "Review" },
  { text: "--drift", on: "--proof", min: 4.5, why: "Drifted and errors" },
];

describe("contrast targets", () => {
  for (const [name, theme] of [["light", light], ["dark", dark], ["portraius", portraius]] as const) {
    for (const p of pairs) {
      it(`${name}: ${p.why} (${p.text} on ${p.on}) is at least ${p.min}:1`, () => {
        expect(contrast(colour(theme, p.text), colour(theme, p.on))).toBeGreaterThanOrEqual(p.min);
      });
    }
  }

  // White labels sit on every stop of the moving accent gradient.
  for (const stop of ["--accent", "--accent-deep-purple", "--accent-deep-blue"]) {
    it(`portraius: a label on the accent gradient's ${stop} stop is at least 4.5:1`, () => {
      expect(contrast(colour(portraius, "--on-accent"), colour(portraius, stop))).toBeGreaterThanOrEqual(4.5);
    });
  }

  // Panels are --glass: --proof over the moving backdrop, at 78% in Portraius
  // and 86% in Light and Dark. Text has to hold its contrast over every colour
  // that drifts behind it: the shader's three tokens, Portraius's CSS
  // gradient, and the darkest and brightest pixels the shader actually drew
  // (lighting takes it past its inputs), measured October 27 in Chrome.
  const backdrops = [
    ["light", light, ["--shader-1", "--shader-2", "--shader-3", "#ce8fab", "#efffff"]],
    ["dark", dark, ["--shader-1", "--shader-2", "--shader-3", "#d0975b", "#000013"]],
    ["portraius", portraius, ["--shader-1", "--shader-2", "--shader-3", "--brand-purple", "#ffc6f0", "#1541df"]],
  ] as const;
  for (const [name, theme, stops] of backdrops) {
    const opacity = /^color-mix\(in srgb, var\(--proof\) (\d+)%, transparent\)$/.exec(theme["--glass"] ?? "");
    it(`${name}: glass is proof at 72% or more over the backdrop`, () => {
      expect(Number(opacity?.[1])).toBeGreaterThanOrEqual(72);
    });
    for (const stop of stops) {
      for (const text of ["--ink", "--ink-muted", "--accent-text", "--match", "--check", "--drift"]) {
        it(`${name}: ${text} on glass over ${stop} is at least 4.5:1`, () => {
          const p = Number(opacity?.[1]) / 100;
          const proof = colour(theme, "--proof");
          const behind = stop.startsWith("#") ? hex(stop) : colour(theme, stop);
          const glass = proof.map((c, i) => c * p + behind[i]! * (1 - p)) as Rgb;
          expect(contrast(colour(theme, text), glass)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }

  it("gives the forced dark theme the same colours as the system dark theme", () => {
    expect(darkForced).toEqual(darkMedia);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("colour values", () => {
  it("appear nowhere in src/ but tokens.css", () => {
    const src = new URL("../", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
    const offenders = sourceFiles(src)
      .filter((file) => !file.endsWith("tokens.css"))
      .flatMap((file) => [...readFileSync(file, "utf8").matchAll(/#[0-9a-f]{3,8}\b|\brgba?\(\s*\d/gi)].map((m) => `${file}: ${m[0]}`))
      // Generated Router schema types quote provider docs, not colours.
      .filter((hit) => !hit.includes("registry/schemas"));
    expect(offenders).toEqual([]);
  });
});
