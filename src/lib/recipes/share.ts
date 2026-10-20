// Remix links (spec: Remix links, Recipe format). A recipe is how something
// was made, never a face: characters become named slots the person remixing
// fills with their own. The link carries the recipe in the URL fragment,
// deflated and base64url-encoded, so a shared recipe never touches a server.
import { z } from "zod";
import { presetFile, recipe, type Preset } from "@/lib/presets/schema";
import { slotsIn } from "@/lib/prompts/slots";
import { isAllowedModel } from "@/lib/registry/models";

export const recipeFile = recipe.extend({ format: z.literal("portraius.recipe"), version: z.literal(1) });
export type RecipeFile = z.infer<typeof recipeFile>;

// Recipes that only need a prompt, settings and characters. Edits and Recast
// need the original person's own image or clip, so they aren't shared.
export const REMIXABLE = ["image.generate", "video.generate"] as const;

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// Keys sorted at every level, so the same recipe always hashes the same.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    return `{${entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function encodeRecipe(r: RecipeFile): Promise<string> {
  return toBase64Url(await pipe(new TextEncoder().encode(canonicalJson(r)), new CompressionStream("deflate-raw")));
}

export class RecipeError extends Error {}

export function validateRecipe(data: unknown): RecipeFile {
  const parsed = recipeFile.safeParse(data);
  if (!parsed.success) throw new RecipeError("This link doesn't hold a recipe this version of Portraius Studio can read.");
  const r = parsed.data;
  if (!isAllowedModel(r.model)) throw new RecipeError("This recipe uses a model the app doesn't allow.");
  if (!(REMIXABLE as readonly string[]).includes(r.capability)) throw new RecipeError("This kind of recipe can't be remixed.");
  const declared = new Set(r.slots.map((s) => s.slot));
  if (slotsIn(r.prompt).some((s) => !declared.has(s))) throw new RecipeError("This recipe names a character slot it doesn't declare.");
  return r;
}

export async function decodeRecipe(param: string): Promise<RecipeFile> {
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(await pipe(fromBase64Url(param), new DecompressionStream("deflate-raw"))));
  } catch {
    throw new RecipeError("This remix link is damaged. Ask for it again.");
  }
  return validateRecipe(data);
}

// The app's own address with the recipe in the fragment (HashRouter).
export async function remixLink(r: RecipeFile, base = `${location.origin}${location.pathname}`): Promise<string> {
  return `${base}#/remix?r=${await encodeRecipe(r)}`;
}

// remixOf on a remixed generation: who it came from, without the recipe.
export async function recipeHash(r: RecipeFile): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(r)));
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// "Save as preset": a file ready to drop into presets/ and open a pull request.
export function recipeToPreset(r: RecipeFile, title: string): Preset {
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "my-preset";
  const { format: _f, version: _v, seed: _s, ...rest } = r;
  return presetFile.parse({
    format: "portraius.preset",
    version: 1,
    id,
    type: r.capability === "image.generate" ? "image" : "video",
    title: title.slice(0, 60) || "My preset",
    author: "your-github-handle",
    license: "CC0-1.0",
    recipe: rest,
  });
}
