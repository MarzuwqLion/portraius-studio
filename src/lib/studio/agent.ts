// The Director agent (spec: Director, Workflow step 2, "Draft with AI"; P2):
// Claude Sonnet 5.5 reads the scene card and drafts 3 to 6 shots, which land
// in the shot list for the user to edit. The reply is constrained to a JSON
// schema whose camera fields can only be presets/camera option IDs, then
// checked again here: a shot that still doesn't fit is dropped, a bad pick
// falls back to a plain default.
//
// It's queued like every model that supports the queue (M7: Claude runs on
// it). The request ID waits on the scene, so a reload collects the draft.
import { z } from "zod";
import { collectDirect, submitDirect } from "@/lib/jobs/direct";
import { CAMERA, cameraOption, look } from "@/lib/presets/load";
import { slotsIn } from "@/lib/prompts/compile";
import { MODEL_IDS } from "@/lib/registry/models";
import { db } from "@/lib/store/db";
import type { CastPick } from "./cast";
import { PACING_SECONDS, loadScene, newShot, updateScene, type Scene, type Shot } from "./director";

export const AGENT_SHOT_RANGE: [number, number] = [3, 6];
export const SHOT_SECONDS = [4, 5, 6, 8, 10, 12, 15] as const;
const MAX_ACTION = 600;
// Router keeps a result for 24 hours after it completes.
const RESULT_TTL_MS = 24 * 60 * 60 * 1000;

const ids = (group: keyof typeof CAMERA) => CAMERA[group].map((o) => o.id);

// What Claude must return. Aperture and lighting may be left empty.
export function shotListSchema() {
  const pick = (group: keyof typeof CAMERA, optional = false) => ({ type: "string", enum: optional ? ["", ...ids(group)] : ids(group) });
  return {
    type: "object",
    properties: {
      shots: {
        type: "array",
        items: {
          type: "object",
          properties: {
            action: { type: "string", description: "What happens, naming cast members only by their {slot}." },
            size: pick("size"),
            angle: pick("angle"),
            lens: pick("lens"),
            aperture: pick("aperture", true),
            movement: pick("movement"),
            lighting: pick("lighting", true),
            durationSec: { type: "integer", enum: [...SHOT_SECONDS] },
            continuity: { type: "string", enum: ["cut", "continue"] },
          },
          required: ["action", "size", "angle", "lens", "aperture", "movement", "lighting", "durationSec", "continuity"],
          additionalProperties: false,
        },
      },
    },
    required: ["shots"],
    additionalProperties: false,
  } as const;
}

export interface CastLine {
  slot: string;
  name: string;
  kind: "person" | "element";
  description?: string;
}

const label = (group: keyof typeof CAMERA, id: string | undefined) => (id ? (cameraOption(group, id)?.label ?? id) : undefined);

// The scene card as Claude reads it.
export function sceneBrief(scene: Scene, cast: CastLine[]): string {
  const film = [
    ["Genre", label("genre", scene.film.genre)],
    ["Camera", label("body", scene.film.body)],
    ["Era", label("era", scene.film.era)],
    ["Pacing", label("pacing", scene.film.pacing)],
    ["Look", scene.film.look ? (look(scene.film.look)?.label ?? scene.film.look) : undefined],
  ].filter(([, v]) => v);
  const lines = [
    `Title: ${scene.title}`,
    `Logline: ${scene.logline.trim()}`,
    scene.location.trim() ? `Location: ${scene.location.trim()}` : "Location: not set; keep to one place.",
    `Frame: ${scene.ratio}`,
    film.length ? `Film: ${film.map(([k, v]) => `${k} ${v}`).join(", ")}` : "",
    cast.length
      ? `Cast (write each as its {slot} in the action):\n${cast.map((c) => `- {${c.slot}}: ${c.name}, ${c.kind === "person" ? "a person" : "an element"}${c.description ? `. ${c.description}` : ""}`).join("\n")}`
      : "Cast: none. Shots show places and things, no people.",
    scene.shots.length ? `Shots already planned (continue after these):\n${scene.shots.map((s, i) => `${i + 1}. ${s.action}`).join("\n")}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export const AGENT_SYSTEM = [
  "You plan shot lists for short film scenes in Portraius Studio's Director.",
  "Each shot becomes one still and then a 4 to 15 second generated video clip, so describe one clear, visible moment per shot: what the camera sees and what moves. No dialogue, sound or inner thoughts.",
  `Plan ${AGENT_SHOT_RANGE[0]} to ${AGENT_SHOT_RANGE[1]} shots that tell the logline with a beginning, middle and end, varying shot size and angle like an editor would.`,
  "Name cast members only by their {slot} exactly as given, never by name, and only cast members listed. Don't add other named people, brands, logos or real places.",
  "Use the scene's location for every shot. Pick each camera field from the allowed values; leave aperture or lighting empty when the shot doesn't need one.",
  'Set continuity to "continue" only when a shot picks up the exact moment the previous shot ends on, from a similar angle; otherwise "cut". The first shot is always "cut".',
  "Match lengths to the pacing: calm scenes hold longer, fast ones cut quicker.",
].join("\n");

export function agentRequest(scene: Scene, cast: CastLine[]): Record<string, unknown> {
  return {
    max_tokens: 16000,
    system: AGENT_SYSTEM,
    messages: [{ role: "user", content: sceneBrief(scene, cast) }],
    // A short creative plan doesn't need Sonnet 5.5's default high effort.
    output_config: { effort: "medium", format: { type: "json_schema", schema: shotListSchema() } },
  };
}

const drafted = z.object({
  action: z.string(),
  size: z.string(),
  angle: z.string(),
  lens: z.string(),
  aperture: z.string().optional(),
  movement: z.string(),
  lighting: z.string().optional(),
  durationSec: z.number(),
  continuity: z.string(),
});

// The text of Claude's reply: its first text block, after the stop checks.
export function replyText(raw: unknown): string {
  const message = (raw ?? {}) as { stop_reason?: string; content?: { type?: string; text?: string }[] };
  if (message.stop_reason === "refusal") throw new Error("Claude declined to plan this scene. Change the logline or cast, then try again.");
  if (message.stop_reason === "max_tokens") throw new Error("Claude's plan ran too long. Try again.");
  const text = message.content?.find((b) => b.type === "text" && typeof b.text === "string")?.text;
  if (!text) throw new Error("Claude didn't return a plan. Try again.");
  return text;
}

const fit = (group: keyof typeof CAMERA, id: string | undefined, fallback?: string) => (id && cameraOption(group, id) ? id : fallback);

// Turns the reply into shots for the scene: unknown slots and camera picks
// never get through, and there are at most 6.
export function shotsFromReply(raw: unknown, scene: Scene): Shot[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(replyText(raw));
  } catch (err) {
    if (err instanceof SyntaxError) throw new Error("Claude's plan wasn't readable. Try again.");
    throw err;
  }
  const list = Array.isArray((parsed as { shots?: unknown })?.shots) ? (parsed as { shots: unknown[] }).shots : [];
  const slots = new Set(scene.cast.map((c) => c.slot));
  const pacing = PACING_SECONDS[scene.film.pacing ?? "standard"] ?? 5;
  let base = scene;
  const shots: Shot[] = [];
  for (const item of list) {
    if (shots.length >= AGENT_SHOT_RANGE[1]) break;
    const result = drafted.safeParse(item);
    if (!result.success) continue;
    const d = result.data;
    const action = d.action.trim().slice(0, MAX_ACTION);
    // A shot naming someone not in the cast would draw a stranger.
    if (!action || slotsIn(action).some((s) => !slots.has(s))) continue;
    const shot = newShot(base, shots.at(-1) ?? base.shots.at(-1));
    const aperture = fit("aperture", d.aperture);
    const lighting = fit("lighting", d.lighting);
    const { aperture: _a, lighting: _l, ...rest } = shot;
    shots.push({
      ...rest,
      action,
      size: fit("size", d.size, "MS")!,
      angle: fit("angle", d.angle, "eye")!,
      lens: fit("lens", d.lens, "35mm")!,
      ...(aperture ? { aperture } : {}),
      movement: fit("movement", d.movement, "static")!,
      ...(lighting ? { lighting } : {}),
      durationSec: (SHOT_SECONDS as readonly number[]).includes(d.durationSec) ? d.durationSec : pacing,
      continuity: d.continuity === "continue" && (shots.length > 0 || base.shots.length > 0) ? "continue" : "cut",
    });
    base = { ...base, nextShot: base.nextShot + 1 };
  }
  if (!shots.length) throw new Error("Claude's plan had no shots that fit this scene. Try again.");
  return shots;
}

async function castLines(cast: CastPick[]): Promise<CastLine[]> {
  const records = await db.characters.bulkGet(cast.map((c) => c.characterId));
  return cast.flatMap((c, i) => {
    const r = records[i];
    return r ? [{ slot: c.slot, name: r.name, kind: r.kind, ...(r.file.description ? { description: r.file.description } : {}) }] : [];
  });
}

export async function agentInput(sceneId: string): Promise<Record<string, unknown>> {
  const scene = await loadScene(sceneId);
  if (!scene) throw new Error("This scene is gone.");
  if (!scene.logline.trim()) throw new Error("Write a logline first: the plan is drawn from it.");
  return agentRequest(scene, await castLines(scene.cast));
}

// Submits the scene card and keeps the request ID on the scene, then waits
// for the plan.
export async function draftShots(sceneId: string): Promise<Shot[]> {
  const body = await agentInput(sceneId);
  const requestId = await submitDirect(MODEL_IDS.directorAgent, body);
  await updateScene(sceneId, (s) => ({ ...s, agentRequest: { requestId, startedAt: Date.now() } }));
  return collectDraft(sceneId);
}

// Collects a plan the scene is waiting on (also after a reload) and adds its
// shots after the ones already there.
export async function collectDraft(sceneId: string): Promise<Shot[]> {
  const scene = await loadScene(sceneId);
  const pending = scene?.agentRequest;
  if (!scene || !pending) return [];
  const clear = (s: Scene): Scene => {
    const { agentRequest: _r, ...rest } = s;
    return rest;
  };
  try {
    if (Date.now() - pending.startedAt > RESULT_TTL_MS) throw new Error("That plan expired before it was collected. Draft again.");
    const raw = await collectDirect(MODEL_IDS.directorAgent, pending.requestId);
    let added: Shot[] = [];
    await updateScene(sceneId, (s) => {
      if (s.agentRequest?.requestId !== pending.requestId) return s;
      added = shotsFromReply(raw, s);
      return clear({ ...s, shots: [...s.shots, ...added], nextShot: s.nextShot + added.length });
    });
    return added;
  } catch (err) {
    await updateScene(sceneId, (s) => (s.agentRequest?.requestId === pending.requestId ? clear(s) : s));
    throw err;
  }
}
