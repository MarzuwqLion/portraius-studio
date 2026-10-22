// Gemma 4 12B through ComfyUI's Generate Text node (spec: Local engine,
// Models): the Director agent's plan and the identity second opinion. Wired
// as Comfy's llm_gemma4_text_gen template. Several images go side by side in
// one, since Generate Text takes a single image. Text, not files, comes back:
// read it with localText().
import type { AdapterImpl } from "@/lib/registry/capabilities";
import type { LocalTextInput } from "@/lib/registry/inputs";
import type { LocalBody, LocalResult } from "@/lib/registry/local-body";
import { FILES } from "@/lib/registry/local-models";
import { LocalGraph, clip, loadImage, out, type Link } from "./graph";

export const gemma: AdapterImpl<LocalTextInput, LocalResult> = {
  capabilities: ["text.plan", "vision.judge"],
  delivery: "queue",
  limits: {},

  buildBody(input): LocalBody {
    const g = new LocalGraph();
    // The template's loader type; ComfyUI tells Gemma 4 by its weights.
    const model = clip(g, FILES.gemma, "stable_diffusion");
    let image: Link | undefined;
    for (const ref of input.images ?? []) {
      const loaded = out(loadImage(g, ref));
      image = image
        ? out(g.add("ImageStitch", { image1: image, image2: loaded, direction: "right", match_image_size: true, spacing_width: 0, spacing_color: "white" }))
        : loaded;
    }
    const generated = g.add("TextGenerate", {
      clip: out(model),
      prompt: input.prompt,
      max_length: input.maxTokens,
      sampling_mode: "on",
      "sampling_mode.temperature": 0.4,
      "sampling_mode.top_k": 64,
      "sampling_mode.top_p": 0.95,
      "sampling_mode.min_p": 0.05,
      "sampling_mode.repetition_penalty": 1.05,
      "sampling_mode.seed": input.seed ?? 0,
      thinking: false,
      use_default_template: true,
      ...(input.system ? { system_prompt: input.system } : {}),
      ...(image ? { image } : {}),
    });
    g.add("PreviewAny", { source: out(generated) });
    return g.body();
  },

  extractAssets: () => [],
};
