// The likeness sheet (contest polish, October 25): one person's best shots in
// a grid, each with its likeness score, as one picture to share. Drawn on a
// canvas in the app's fonts and token colours, like the 9:16 end card.
import { band, type Band } from "@/lib/identity/score";
import { tokenColour } from "./social-card";

export const SHEET_WIDTH = 1200;
export const SHEET_MAX_SHOTS = 6;

const COLUMNS = 3;
const MARGIN = 48;
const GAP = 24;
const TOP = 230;
const FOOTER = 120;
const CELL_W = (SHEET_WIDTH - 2 * MARGIN - (COLUMNS - 1) * GAP) / COLUMNS;
const CELL_H = Math.round((CELL_W * 5) / 4);

// As tall as its rows, so one or two shots don't leave a blank sheet.
export function sheetHeight(count: number): number {
  const rows = Math.max(1, Math.ceil(Math.min(count, SHEET_MAX_SHOTS) / COLUMNS));
  return TOP + rows * CELL_H + (rows - 1) * GAP + FOOTER;
}

const DISPLAY = '"Big Shoulders Display"';
const BODY = '"Atkinson Hyperlegible Next"';
const BAND_TOKEN: Record<Band, string> = { match: "--match", check: "--check", drift: "--drift" };

export interface SheetShotImage {
  image: CanvasImageSource & { width: number; height: number };
  score: number;
}

// Where each shot sits: three across, as many rows as needed.
export function sheetCells(count: number): { x: number; y: number; w: number; h: number }[] {
  return Array.from({ length: Math.min(count, SHEET_MAX_SHOTS) }, (_, i) => ({
    x: MARGIN + (i % COLUMNS) * (CELL_W + GAP),
    y: TOP + Math.floor(i / COLUMNS) * (CELL_H + GAP),
    w: CELL_W,
    h: CELL_H,
  }));
}

export function sheetSummary(name: string, scores: number[]): string {
  const average = Math.round(scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length));
  return `${name}'s best ${scores.length === 1 ? "shot" : `${scores.length} shots`}, average likeness ${average}`;
}

export async function drawLikenessSheet(name: string, shots: SheetShotImage[]): Promise<Blob> {
  await Promise.all([document.fonts.load(`800 96px ${DISPLAY}`), document.fonts.load(`600 30px ${BODY}`)]).catch(() => undefined);
  const c = document.createElement("canvas");
  c.width = SHEET_WIDTH;
  c.height = sheetHeight(shots.length);
  const g = c.getContext("2d")!;
  g.fillStyle = tokenColour("--seamless");
  g.fillRect(0, 0, c.width, c.height);

  g.fillStyle = tokenColour("--on-seamless");
  g.textBaseline = "alphabetic";
  g.font = `800 96px ${DISPLAY}`;
  g.fillText(name, MARGIN, 130, c.width - 2 * MARGIN);
  g.font = `600 30px ${BODY}`;
  g.fillText(sheetSummary(name, shots.map((s) => s.score)), MARGIN, 180, c.width - 2 * MARGIN);

  sheetCells(shots.length).forEach((cell, i) => {
    const { image, score } = shots[i]!;
    // Cover the cell, cropping the longer side around the middle.
    const scale = Math.max(cell.w / image.width, cell.h / image.height);
    const sw = cell.w / scale;
    const sh = cell.h / scale;
    g.save();
    g.beginPath();
    g.roundRect(cell.x, cell.y, cell.w, cell.h, 2);
    g.clip();
    g.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, cell.x, cell.y, cell.w, cell.h);
    g.restore();
    // The score on a proof chip, as the app's badges are.
    const label = `${Math.round(score)}`;
    g.font = `800 52px ${DISPLAY}`;
    const w = g.measureText(label).width + 32;
    g.fillStyle = tokenColour("--proof");
    g.beginPath();
    g.roundRect(cell.x + 14, cell.y + cell.h - 82, w, 68, 6);
    g.fill();
    g.fillStyle = tokenColour(BAND_TOKEN[band(score)]);
    g.fillText(label, cell.x + 30, cell.y + cell.h - 30);
  });

  g.fillStyle = tokenColour("--on-seamless");
  g.font = `600 30px ${BODY}`;
  g.fillText("Likeness scored 0 to 100 against their own references. Made with Portraius Studio, open source.", MARGIN, c.height - 56, c.width - 2 * MARGIN);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("The sheet couldn't be drawn."))), "image/png"));
}
