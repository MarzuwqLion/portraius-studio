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

// The spec's targets. --grease on --seamless (the pick mark) is about 1.2:1
// in light and 2.3:1 in dark by luminance, under WCAG's 3:1 for graphics; the
// hue carries it, and a change is a design call (docs/notes/m8-notes.md).
const pairs: { text: string; on: string; min: number; why: string }[] = [
  { text: "--ink", on: "--proof", min: 11, why: "ink on proof, about 12:1" },
  { text: "--ink-muted", on: "--proof", min: 4.5, why: "secondary text" },
  { text: "--on-seamless", on: "--seamless", min: 4.5, why: "text on Studio grey" },
  { text: "--on-ink", on: "--ink", min: 4.5, why: "primary button label" },
  { text: "--match", on: "--proof", min: 4.5, why: "Strong match" },
  { text: "--check", on: "--proof", min: 4.5, why: "Check" },
  { text: "--drift", on: "--proof", min: 4.5, why: "Drift and errors" },
];

describe("contrast targets", () => {
  for (const [name, theme] of [["light", light], ["dark", dark]] as const) {
    for (const p of pairs) {
      it(`${name}: ${p.why} (${p.text} on ${p.on}) is at least ${p.min}:1`, () => {
        expect(contrast(colour(theme, p.text), colour(theme, p.on))).toBeGreaterThanOrEqual(p.min);
      });
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
