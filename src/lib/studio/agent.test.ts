import { describe, expect, it } from "vitest";
import { AGENT_SYSTEM, agentRequest, replyText, sceneBrief, shotListSchema, shotsFromReply } from "./agent";
import { newScene, type Scene } from "./director";

function scene(): Scene {
  return {
    ...newScene(500),
    title: "The Letter",
    logline: "A retired harbour pilot finds a letter he never sent.",
    location: "A late-night diner with red vinyl booths",
    cast: [{ slot: "lead", characterId: "walt" }],
    film: { genre: "drama", pacing: "calm" },
  };
}

const reply = (shots: unknown[], stop = "end_turn") => ({ stop_reason: stop, content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify({ shots }) }] });
const shot = (over: Record<string, unknown> = {}) => ({
  action: "{lead} turns the envelope over",
  size: "CU",
  angle: "eye",
  lens: "85mm",
  aperture: "f2",
  movement: "slow-push-in",
  lighting: "",
  durationSec: 6,
  continuity: "cut",
  ...over,
});

describe("the request", () => {
  it("asks for JSON whose camera fields are preset IDs only", () => {
    const schema = shotListSchema();
    const item = schema.properties.shots.items;
    expect(item.properties.size.enum).toContain("ECU");
    expect(item.properties.movement.enum).toContain("slow-push-in");
    expect(item.properties.lighting.enum[0]).toBe("");
    expect(item.additionalProperties).toBe(false);
    const body = agentRequest(scene(), [{ slot: "lead", name: "Walt Harmon", kind: "person", description: "Retired harbour pilot." }]);
    expect(body).toMatchObject({ max_tokens: 16000, system: AGENT_SYSTEM, output_config: { effort: "medium", format: { type: "json_schema" } } });
    expect(body).not.toHaveProperty("model");
  });

  it("gives Claude the scene card with the cast as slots", () => {
    const brief = sceneBrief(scene(), [{ slot: "lead", name: "Walt Harmon", kind: "person", description: "Retired harbour pilot." }]);
    expect(brief).toContain("Logline: A retired harbour pilot finds a letter he never sent.");
    expect(brief).toContain("- {lead}: Walt Harmon, a person. Retired harbour pilot.");
    expect(brief).toContain("Film: Genre Drama");
    expect(sceneBrief({ ...scene(), cast: [] }, [])).toContain("Cast: none.");
  });
});

describe("shotsFromReply", () => {
  it("turns the reply into shots with the scene's numbering", () => {
    const s = scene();
    const shots = shotsFromReply(reply([shot(), shot({ action: "{lead} looks up toward the door", continuity: "continue", lighting: "neon" })]), s);
    expect(shots).toHaveLength(2);
    expect(shots[0]).toMatchObject({ action: "{lead} turns the envelope over", size: "CU", lens: "85mm", aperture: "f2", durationSec: 6, continuity: "cut", n: 0 });
    expect(shots[0]).not.toHaveProperty("lighting");
    expect(shots[1]).toMatchObject({ continuity: "continue", lighting: "neon", n: 1 });
    expect(new Set(shots.map((x) => x.id)).size).toBe(2);
  });

  it("drops shots naming someone outside the cast, and falls back on bad picks", () => {
    const shots = shotsFromReply(reply([shot({ action: "{stranger} waves" }), shot({ size: "XXL", lens: "9mm", durationSec: 7, continuity: "continue" })]), scene());
    expect(shots).toHaveLength(1);
    // The calm pacing's 8 s stands in for a length the app doesn't offer; the first shot can't continue.
    expect(shots[0]).toMatchObject({ size: "MS", lens: "35mm", durationSec: 8, continuity: "cut" });
  });

  it("keeps 6 shots at most", () => {
    expect(shotsFromReply(reply(Array.from({ length: 9 }, () => shot())), scene())).toHaveLength(6);
  });

  it("says what went wrong when there's no usable plan", () => {
    expect(() => shotsFromReply(reply([], "refusal"), scene())).toThrow(/declined/);
    expect(() => shotsFromReply(reply([shot()], "max_tokens"), scene())).toThrow(/too long/);
    expect(() => shotsFromReply({ stop_reason: "end_turn", content: [{ type: "text", text: "not json" }] }, scene())).toThrow(/wasn't readable/);
    expect(() => shotsFromReply(reply([shot({ action: "{nobody} sits" })]), scene())).toThrow(/no shots/);
    expect(() => replyText({ content: [] })).toThrow(/didn't return/);
  });
});
