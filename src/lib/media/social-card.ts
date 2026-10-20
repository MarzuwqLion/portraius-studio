// The end card and the Recast labels for the 9:16 export, drawn on a canvas
// in the app's own fonts and token colours (spec: Visual direction), then
// laid over the video by ffmpeg.
import { SOCIAL_HEIGHT, SOCIAL_WIDTH, type Box } from "./social";

export const END_CARD_LINES = { lead: "Made with", name: ["Portraius", "Studio"], tail: "Open source" } as const;

// A token's current value, e.g. "#64676b" for --seamless.
export function tokenColour(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// "#64676b" or "rgb(100, 103, 107)" as ffmpeg's 0xRRGGBB.
export function ffmpegColour(css: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(css);
  if (hex) return `0x${hex[1]!.toLowerCase()}`;
  const rgb = /^rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(css);
  if (rgb) return `0x${[rgb[1], rgb[2], rgb[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
  throw new Error(`Can't read the colour ${css}.`);
}

const DISPLAY = '"Big Shoulders Display"';
const BODY = '"Atkinson Hyperlegible Next"';

function canvas(): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = SOCIAL_WIDTH;
  c.height = SOCIAL_HEIGHT;
  return { c, g: c.getContext("2d")! };
}

function png(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("The card couldn't be drawn."))), "image/png"));
}

async function fonts(): Promise<void> {
  await Promise.all([document.fonts.load(`800 120px ${DISPLAY}`), document.fonts.load(`600 36px ${BODY}`)]).catch(() => undefined);
}

// "Made with Portraius Studio, open source" on Studio grey.
export async function drawEndCard(): Promise<Blob> {
  await fonts();
  const { c, g } = canvas();
  g.fillStyle = tokenColour("--seamless");
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = tokenColour("--on-seamless");
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.font = `600 36px ${BODY}`;
  g.fillText(END_CARD_LINES.lead, c.width / 2, 500);
  g.font = `800 132px ${DISPLAY}`;
  END_CARD_LINES.name.forEach((line, i) => g.fillText(line, c.width / 2, 640 + i * 132));
  g.font = `600 36px ${BODY}`;
  g.fillText(END_CARD_LINES.tail, c.width / 2, 870);
  return png(c);
}

// A label per clip, like the split view's: in the grey above the clip when
// there's room, otherwise in a proof chip on the clip's corner.
export async function drawLabels(cells: Box[], clips: Box[], labels: string[]): Promise<Blob> {
  await fonts();
  const { c, g } = canvas();
  g.textBaseline = "alphabetic";
  g.font = `800 44px ${DISPLAY}`;
  labels.forEach((label, i) => {
    const cell = cells[i]!;
    const clip = clips[i]!;
    if (clip.y - cell.y >= 72) {
      g.fillStyle = tokenColour("--on-seamless");
      g.fillText(label, clip.x + 16, clip.y - 18);
      return;
    }
    const width = g.measureText(label).width + 28;
    g.fillStyle = tokenColour("--proof");
    g.beginPath();
    g.roundRect(clip.x + 16, clip.y + 16, width, 56, 6);
    g.fill();
    g.fillStyle = tokenColour("--ink");
    g.fillText(label, clip.x + 30, clip.y + 60);
  });
  return png(c);
}
