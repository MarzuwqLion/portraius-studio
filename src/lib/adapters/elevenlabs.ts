// ElevenLabs v4 voice (spec: Finishing, Voice; P2). On Router it's ElevenLabs'
// text-to-dialogue: `inputs[]` of { text, voice_id }, up to 10 distinct voices
// in one call, stock voices only (the route has no cloning). Sync only: the
// response body is the audio itself, which the queue can't hold (Router
// refuses it there with not_enabled), so it runs on the synchronous route with
// fallback_provider=false.
import type { AdapterImpl, AssetRef, BinaryResult } from "@/lib/registry/capabilities";
import type { SpeechInput } from "@/lib/registry/inputs";
import type { ElevenlabsElevenV4 as Schema } from "@/lib/registry/schemas";

type SpeechBody = Schema.operations["runRouterModel"]["requestBody"]["content"]["application/json"];

export const MAX_DISTINCT_VOICES = 10;
// A line is meant to be lip-synced onto a clip of 15 s at most: about 40
// words. A dialogue can run a little longer in all.
export const MAX_LINE_CHARS = 400;
export const MAX_SPEECH_CHARS = 1200;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export const elevenLabs: AdapterImpl<SpeechInput, BinaryResult> = {
  capabilities: ["audio.tts"],
  delivery: "sync",
  limits: {},

  buildBody(input): SpeechBody {
    if (!input.lines.length) throw new RangeError("Write a line to speak.");
    for (const line of input.lines) {
      if (!line.text.trim()) throw new RangeError("A line can't be empty.");
      if (line.text.length > MAX_LINE_CHARS) throw new RangeError(`Keep each line under ${MAX_LINE_CHARS} characters.`);
      if (!line.voiceId) throw new RangeError("Pick a voice for every line.");
    }
    if (input.lines.reduce((t, l) => t + l.text.length, 0) > MAX_SPEECH_CHARS) throw new RangeError(`Keep the whole exchange under ${MAX_SPEECH_CHARS} characters.`);
    if (new Set(input.lines.map((l) => l.voiceId)).size > MAX_DISTINCT_VOICES) throw new RangeError(`One exchange takes up to ${MAX_DISTINCT_VOICES} voices.`);
    return {
      inputs: input.lines.map((l) => ({ text: l.text.trim(), voice_id: l.voiceId })),
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
    };
  },

  // The audio is already here, so it comes back inline, like Nano Banana's images.
  extractAssets(raw): AssetRef[] {
    return raw.bytes.byteLength ? [{ kind: "audio", mime: raw.contentType || "audio/mpeg", base64: toBase64(raw.bytes) }] : [];
  },
};
